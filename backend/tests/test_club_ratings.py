import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.models.database import Base, get_db
from app.models.club_rating import ClubRatingVote, ClubRatingPublication, ClubRatingInputs, ClubRatingVoter
from app.api.club_rating_routes import club_rating_router
from app.services.club_ratings.community import adjustment, eligible
from app.services.club_ratings import publication


def opinion(direction=1, age=0, score=1800):
    return SimpleNamespace(direction=direction, updated_at=datetime.utcnow()-timedelta(days=age), rating_at_vote=score)


class CommunityTests(unittest.TestCase):
    def test_quorum_and_agreement(self):
        now=datetime.utcnow()
        self.assertEqual(adjustment([opinion() for _ in range(4)],1800,0,now)[0],0)
        self.assertEqual(adjustment([opinion() for _ in range(4)]+[opinion(-1)],1800,0,datetime.utcnow())[0],3)
        self.assertEqual(adjustment([opinion() for _ in range(3)]+[opinion(-1) for _ in range(2)],1800,0,datetime.utcnow())[0],0)

    def test_cap_symmetry_and_no_ratchet(self):
        for direction in (1,-1):
            vs=[opinion(direction) for _ in range(5)]
            offset=0
            for _ in range(50):
                offset=adjustment(vs,1800,offset,datetime.utcnow())[0]
            self.assertEqual(offset,5*direction)
        offset,_=adjustment([opinion() for _ in range(10000)],1800,14,datetime.utcnow())
        self.assertLessEqual(offset,15)

    def test_expiry_changed_rating_and_decay(self):
        vs=[opinion(age=31) for _ in range(20)]+[opinion(score=1750) for _ in range(20)]
        self.assertEqual(adjustment(vs,1800,9,datetime.utcnow()),(6,{'up':0,'down':0,'voters':0}))
        self.assertFalse(eligible(opinion(age=-1),1800,datetime.utcnow()))

    def test_publication_boundary(self):
        self.assertEqual(publication.period_for(datetime(2026,9,14,11,59)),'2026-09-07')
        self.assertEqual(publication.period_for(datetime(2026,9,14,12)),'2026-09-14')


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions=sessionmaker(bind=self.engine)
        self.patch=patch.object(publication,'SessionLocal',self.sessions)
        self.patch.start()
        reference_time = datetime(2026,9,10,12,tzinfo=timezone.utc)
        self.clock_patches = [patch.object(module,'utcnow',return_value=reference_time) for module in (publication.club_consensus, publication.club_consensus.club_performance)]
        for clock in self.clock_patches: clock.start()
        publication._publish()
        app=FastAPI()
        app.include_router(club_rating_router,prefix='/api')
        def db():
            with self.sessions() as session: yield session
        app.dependency_overrides[get_db]=db
        self.client=TestClient(app)
        self.app=app
        self.client.get('/api/club-ratings/votes/me')

    def tearDown(self):
        self.client.close()
        self.patch.stop()
        for clock in self.clock_patches: clock.stop()
        self.engine.dispose()

    def test_public_board_matches_reviewed_seed_and_is_free(self):
        res=self.client.get('/api/club-ratings')
        self.assertEqual(res.status_code,200)
        rows=res.json()['teams']
        self.assertEqual(len(rows),135)
        psg=next(t for t in rows if 'Paris Saint' in t['name'])
        self.assertEqual(psg['rank'],6)
        self.assertEqual(psg['tier'],'Elite')
        self.assertEqual(sum(t['tier']=='Elite' for t in rows),6)
        self.assertTrue(all(t['community_adjustment']==0 for t in rows))
        self.assertEqual(self.client.put('/api/club-ratings/19/vote',json={'direction':1}).status_code,200)

    def test_vote_validation_persistence_withdrawal_and_isolation(self):
        url='/api/club-ratings/19/vote'
        for value in (2,True,'1',1.5):
            self.assertEqual(self.client.put(url,json={'direction':value}).status_code,422)
        self.assertEqual(self.client.put('/api/club-ratings/999999/vote',json={'direction':1}).status_code,404)
        self.assertEqual(self.client.put(url,json={'direction':1}).status_code,200)
        self.assertEqual(self.client.put(url,json={'direction':1}).status_code,200)
        self.assertEqual(self.client.get('/api/club-ratings/votes/me').json(),{'19':1})
        with TestClient(self.app) as other:
            self.assertEqual(other.get('/api/club-ratings/votes/me').json(),{})
        self.assertEqual(self.client.put(url,headers={'Origin':'https://unrelated.example'},json={'direction':1}).status_code,403)
        self.assertEqual(self.client.put(url,json={'direction':-1}).status_code,429)
        with self.sessions() as db:
            v=db.query(ClubRatingVote).one();v.updated_at-=timedelta(seconds=3);db.commit()
        self.assertEqual(self.client.put(url,json={'direction':-1}).status_code,200)
        with self.sessions() as db:
            v=db.query(ClubRatingVote).one();v.updated_at-=timedelta(seconds=3);db.commit()
        self.assertEqual(self.client.put(url,json={'direction':0}).status_code,200)
        self.assertEqual(self.client.get('/api/club-ratings/votes/me').json(),{})

    def test_publication_idempotence_failure_and_weekly_votes(self):
        with self.sessions() as db:
            original=json.loads(json.dumps(db.query(ClubRatingPublication).one().board))
        with patch.object(publication.club_consensus,'refresh') as refresh:
            publication._publish()
            refresh.assert_not_called()
        with self.sessions() as db:
            old=db.query(ClubRatingPublication).one();old.period='2026-08-31'
            state=db.get(ClubRatingInputs,1);state.checked_at-=timedelta(days=7)
            for i in range(1,6):
                db.add(ClubRatingVoter(id=str(i)))
                db.add(ClubRatingVote(voter_id=str(i),club_id=19,direction=1,rating_at_vote=original['teams'][0]['score'],updated_at=datetime.utcnow()))
            db.commit()
        bad=json.loads(json.dumps(original));bad['teams']=bad['teams'][:-1]
        with patch.object(publication.club_consensus,'refresh',return_value={'board':bad,'results':{'test':'incomplete'}}):
            publication._publish()
        with self.sessions() as db:
            self.assertEqual(db.query(ClubRatingPublication).count(),1)
            db.get(ClubRatingInputs,1).checked_at-=timedelta(days=1);db.commit()
        with patch.object(publication.club_consensus,'refresh',return_value={'board':original,'results':{'test':'ok'}}):
            publication._publish()
        with self.sessions() as db:
            self.assertEqual(db.query(ClubRatingPublication).count(),2)
            row=db.query(ClubRatingPublication).order_by(ClubRatingPublication.id.desc()).first().board['teams'][0]
            self.assertEqual(row['community_adjustment'],3)
            self.assertEqual(row['base_score'],original['teams'][0]['base_score'])


if __name__=='__main__': unittest.main()

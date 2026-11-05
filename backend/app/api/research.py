import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.models import User, get_db
from app.models.research_track import ResearchTrack
from app.services.research_query import SAMPLE, Rules, resolve
from app.services.research_results import report
from app.services.research_movements import MOVES, movement_question, movement_report

router = APIRouter(prefix="/research")


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=240)
    previous: str | None = Field(None, max_length=240)


def pro(response: Response, user: User = Depends(require_user)):
    response.headers["Cache-Control"] = "private, no-store"
    if not user.subscription or user.subscription.status != "active":
        raise HTTPException(403, "Research questions require SteamWatch Pro.")
    return user


def interpret(q, previous=None):
    try:
        return resolve(q, previous, datetime.now(timezone.utc).date())
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


_example_lock = Lock()
_example_expires = 0.0
_example_result = None


@router.get("/example")
def example(response: Response, db: Session = Depends(get_db)):
    # One explicitly public report, with a fixed season and no user-controlled filters.
    global _example_expires, _example_result
    response.headers["Cache-Control"] = "public, max-age=60"
    with _example_lock:
        if monotonic() >= _example_expires:
            _example_result = report(
                db, interpret(SAMPLE.replace("this season", "2026/27"))
            )
            _example_expires = monotonic() + 60
        return _example_result


@router.post("/run")
def run(body: Question, _=Depends(pro), db: Session = Depends(get_db)):
    # A stated sample size checks the result. It never selects an arbitrary subset.
    question = body.question.strip()
    try:
        ranking = movement_question(question, body.previous)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    if ranking:
        return movement_report(db, ranking)
    count = re.search(r"\ball\s+(\d+)\s+(games|matches|fixtures)\b", question, re.I)
    if count:
        question = question[: count.start()] + "all games" + question[count.end() :]
    previous = body.previous if not MOVES.search((body.previous or "").casefold()) else None
    result = report(db, interpret(question, previous))
    if count and int(count[1]) != result["summary"]["games"]:
        raise HTTPException(
            422,
            f"These rules match {result['summary']['games']} settled games. Remove the stated count to see the updated report.",
        )
    return result


def entry(t):
    return dict(
        id=t.id,
        question=t.question,
        rules=t.rules,
        baseline=t.baseline,
        created_at=t.created_at,
        forward_from=t.forward_from.isoformat(),
    )


@router.get("/tracks")
def tracks(user=Depends(pro), db: Session = Depends(get_db)):
    return [
        entry(t)
        for t in db.query(ResearchTrack)
        .filter_by(user_id=user.id)
        .order_by(ResearchTrack.created_at.desc())
        .all()
    ]


@router.post("/tracks")
def save(body: Question, user=Depends(pro), db: Session = Depends(get_db)):
    rules = interpret(body.question)
    key = hashlib.sha256(
        json.dumps(rules.model_dump(), sort_keys=True).encode()
    ).hexdigest()
    # Serialize saves per account, including retries and the 40-track limit.
    db.query(User.id).filter_by(id=user.id).with_for_update().one()
    owned = db.query(ResearchTrack).filter_by(user_id=user.id)
    existing = owned.filter_by(fingerprint=key).first()
    if existing:
        return entry(existing)
    if owned.count() >= 40:
        raise HTTPException(409, "Remove a saved question before tracking another.")
    sample = report(db, rules)
    if not sample["summary"]["games"] or sample["notices"]:
        raise HTTPException(
            422,
            "A complete results feed with matching games is needed to start tracking.",
        )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    t = ResearchTrack(
        user_id=user.id,
        question=body.question.strip(),
        rules=rules.model_dump(),
        fingerprint=key,
        baseline=sample["summary"],
        created_at=now,
        forward_from=now.date() + timedelta(days=1),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return entry(t)


def own(db, user, track_id):
    item = db.query(ResearchTrack).filter_by(user_id=user.id, id=track_id).first()
    if not item:
        raise HTTPException(404, "Saved question not found.")
    return item


@router.get("/tracks/{track_id}")
def progress(track_id: int, user=Depends(pro), db: Session = Depends(get_db)):
    t = own(db, user, track_id)
    return {
        **entry(t),
        "forward": report(db, Rules(**t.rules), t.forward_from.isoformat()),
    }


@router.delete("/tracks/{track_id}", status_code=204)
def remove(track_id: int, user=Depends(pro), db: Session = Depends(get_db)):
    db.delete(own(db, user, track_id))
    db.commit()

"""Access-boundary regression tests; no production services or credentials."""
import json
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.manager_ratings import manager_ratings_router, snapshot, public_preview
from app.api.deps import get_current_user
from app.models.database import get_db


class ManagerAccessTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(manager_ratings_router, prefix='/api')
        # Anonymous/invalid token paths never query this DB.
        self.app.dependency_overrides[get_db] = lambda: None
        self.client = TestClient(self.app)

    def user(self, status, days=10):
        sub = SimpleNamespace(status=status, current_period_end=datetime.utcnow()+timedelta(days=days), cancel_at_period_end=True)
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(subscription=sub)

    def test_anonymous_invalid_and_query_enumeration(self):
        for headers in ({}, {'Authorization':'Bearer invalid-token'}):
            for query in ('', '?page=2&limit=999&sort=recent&start=2025-01-01'):
                result = self.client.get('/api/manager-ratings'+query, headers=headers)
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()['access'], 'preview')
                self.assertEqual([r['rank'] for r in result.json()['rows']], [1,2,3])
                self.assertEqual(result.headers['cache-control'], 'private, no-store')
                self.assertEqual(result.headers['vary'], 'Authorization')

    def test_subscription_lifecycle(self):
        for status, days, count in [('active',10,len(snapshot()['rows'])), ('active',-1,3), ('canceled',10,3), ('past_due',10,3), ('inactive',10,3)]:
            self.user(status,days)
            self.assertEqual(len(self.client.get('/api/manager-ratings').json()['rows']),count)
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(subscription=None)
        self.assertEqual(len(self.client.get('/api/manager-ratings').json()['rows']),3)

    def test_public_artifacts_have_only_preview(self):
        root = Path(__file__).resolve().parents[2]
        public = root/'frontend/public/tools/manager-ratings'
        preview = json.loads((public/'manager-elo-data.json').read_text(encoding='utf-8'))
        self.assertEqual(preview['rows'],public_preview(snapshot())['rows'])
        html = (public/'index.html').read_text(encoding='utf-8')
        for row in snapshot()['rows']:
            if row['id'] not in {r['id'] for r in preview['rows']}:
                self.assertNotIn(json.dumps(row['name']),html)
        self.assertIn('loadManagerRatings', html)
        self.assertNotIn('const data={',html)

    def test_static_paths_cannot_reach_private_snapshot(self):
        from app.main import safe_static_path
        from fastapi import HTTPException
        root = Path(__file__).resolve().parents[1]/'static'
        for path in ('../app/data/manager-ratings.json', '../../app/data/manager-ratings.json'):
            with self.assertRaises(HTTPException):
                safe_static_path(root, path)
        self.assertEqual(safe_static_path(root, 'tools/manager-ratings/index.html'), (root/'tools/manager-ratings/index.html').resolve())


if __name__ == '__main__':
    unittest.main()

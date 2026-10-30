"""Public ratings regression checks; no production services or credentials."""
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.manager_ratings import manager_ratings_router, snapshot

class ManagerAccessTests(unittest.TestCase):
    def test_full_public_access_without_authentication(self):
        app = FastAPI()
        app.include_router(manager_ratings_router, prefix='/api')
        client = TestClient(app)
        for headers in ({}, {'Authorization': 'Bearer invalid-token'}):
            response = client.get('/api/manager-ratings', headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['access'], 'public')
            self.assertEqual(response.json()['rows'], snapshot()['rows'])
            self.assertGreater(len(response.json()['rows']), 3)
            self.assertEqual(response.headers['cache-control'], 'public, max-age=300')
    def test_public_download_matches_snapshot(self):
        root = Path(__file__).resolve().parents[2]
        folder = root/'frontend/public/tools/manager-ratings'
        data = json.loads((folder/'manager-elo-data.json').read_text(encoding='utf-8'))
        self.assertEqual(data['rows'], snapshot()['rows'])
        self.assertEqual(data['access'], 'public')
        self.assertEqual(data['movement_as_of'], snapshot()['movement_as_of'])
        self.assertNotIn('id="manager-paywall"', (folder/'index.html').read_text(encoding='utf-8'))
    def test_static_paths_stay_inside_frontend(self):
        from app.main import safe_static_path
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            safe_static_path(Path(__file__).resolve().parents[1]/'static', '../app/data/manager-ratings.json')

if __name__ == '__main__':
    unittest.main()

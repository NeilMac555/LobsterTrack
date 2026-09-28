import unittest
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.api.form_lab import router
from app.api.deps import get_current_user
from app.models import get_db

class FormLabPaywallTests(unittest.TestCase):
 def setUp(self):
  self.app=FastAPI();self.app.include_router(router)
  self.app.dependency_overrides[get_db]=lambda:None
  self.client=TestClient(self.app)
 def test_guest_blocked(self):
  self.app.dependency_overrides[get_current_user]=lambda:None
  for path in ['/form-lab/table?league=soccer_epl','/form-lab/analysis?league=soccer_epl&team_id=1']:
   self.assertEqual(self.client.get(path).status_code,401)
 def test_unpaid_blocked(self):
  for status in [None,'inactive','canceled','past_due']:
   self.app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(subscription=SimpleNamespace(status=status) if status else None)
   for path in ['/form-lab/table?league=soccer_epl','/form-lab/analysis?league=soccer_epl&team_id=1']:
    self.assertEqual(self.client.get(path).status_code,403)
 def test_subscriber_allowed(self):
  self.app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(subscription=SimpleNamespace(status='active'))
  with patch('app.api.form_lab.analyze',return_value={'sample':10}):
   self.assertEqual(self.client.get('/form-lab/analysis?league=soccer_epl&team_id=1').json(),{'sample':10})

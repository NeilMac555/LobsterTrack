import unittest

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.canonical_host import CanonicalHostMiddleware


async def endpoint(request):
    return JSONResponse({"method": request.method, "body": (await request.body()).decode()})


class CanonicalHostTests(unittest.TestCase):
    def setUp(self):
        app = Starlette(routes=[Route('/{path:path}', endpoint, methods=['GET', 'POST'])])
        app.add_middleware(CanonicalHostMiddleware)
        self.client = TestClient(app, follow_redirects=False)

    def test_apex_redirect_retains_path_query_and_encoding(self):
        for scheme in ['http', 'https']:
            response = self.client.get(f'{scheme}://steamwatch.io/blog/a%20b?utm_source=x&next=%2Fpro')
            self.assertEqual(response.status_code, 308)
            self.assertEqual(response.headers['location'], 'https://www.steamwatch.io/blog/a%20b?utm_source=x&next=%2Fpro')

    def test_post_keeps_method_and_body(self):
        response = self.client.post('https://steamwatch.io/api/example', content='payload', follow_redirects=True)
        self.assertEqual(response.json(), {'method': 'POST', 'body': 'payload'})

    def test_www_local_and_other_hosts_do_not_redirect(self):
        for host in ['www.steamwatch.io', 'localhost:8000', 'lobstertrack-production.up.railway.app', 'steamwatch.io.example.org']:
            response = self.client.get(f'http://{host}/pro')
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('location', response.headers)


if __name__ == '__main__':
    unittest.main()

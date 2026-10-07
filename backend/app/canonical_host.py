from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse


class CanonicalHostMiddleware(BaseHTTPMiddleware):
    """Serve the bare domain through Railway TLS, then consolidate on www."""

    async def dispatch(self, request, call_next):
        if request.url.hostname == "steamwatch.io":
            target = request.url.replace(scheme="https", netloc="www.steamwatch.io")
            # 308 retains the method/body for API and authentication requests.
            return RedirectResponse(str(target), status_code=308)
        return await call_next(request)

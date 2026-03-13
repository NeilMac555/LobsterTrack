from .routes import router
from .auth_routes import auth_router
from .stripe_routes import stripe_router

router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(stripe_router, prefix="/stripe", tags=["stripe"])

__all__ = ["router"]

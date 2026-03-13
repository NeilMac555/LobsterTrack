from pydantic import BaseModel, EmailStr
from datetime import datetime


class MagicLinkRequest(BaseModel):
    email: EmailStr


class VerifyRequest(BaseModel):
    token: str


class SubscriptionInfo(BaseModel):
    status: str
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False


class UserResponse(BaseModel):
    id: int
    email: str
    subscription: SubscriptionInfo


class AuthResponse(BaseModel):
    token: str
    user: UserResponse

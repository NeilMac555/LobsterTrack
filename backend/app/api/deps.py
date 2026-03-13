from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.user import User
from app.services.auth import decode_jwt


async def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_jwt(authorization[7:])
    if not payload:
        return None
    user = db.query(User).filter(User.id == payload["sub"]).first()
    return user


async def require_user(user: User | None = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.models import get_db
from app.services.predictor_baselines import get_baselines

router = APIRouter()


@router.get("/predictor-baselines")
def predictor_baselines(db: Session = Depends(get_db)):
    # Sync route: the DB read runs in FastAPI's worker thread, not the event loop.
    return get_baselines(db)

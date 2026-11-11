from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.connection import get_db

router = APIRouter(tags=["health"])


@router.get("/healthz", description="Liveness — o processo está de pé (sem checar dependências)")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", description="Readiness — consegue atender tráfego (banco acessível)")
def readiness(response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "db": "unreachable"}
    return {"status": "ok", "db": "reachable"}

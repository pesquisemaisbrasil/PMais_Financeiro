from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from api.payables import READ_LIMIT, DbSession, FinanceUser
from core.limiter import limiter
from schemas.search import SearchResult
from services import search as search_service
from services.payable import PayableInvalid

router = APIRouter(tags=["busca"])


@router.get(
    "/search",
    response_model=SearchResult,
    description=(
        "Busca em todo o sistema: contas a pagar e a receber, notas fiscais, projetos e cadastros, "
        "separados por grupo. O termo não vai para o log."
    ),
)
@limiter.limit(READ_LIMIT)
def search_everything(request: Request, db: DbSession, user: FinanceUser, q: str = "") -> Any:
    try:
        groups = search_service.search(db, q)
        groups = [g for g in groups if not search_service.blocked(g.key, user.blockedScreens)]
    except PayableInvalid as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return {"term": q.strip(), "groups": [asdict(group) for group in groups]}

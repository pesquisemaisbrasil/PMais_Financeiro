from fastapi import HTTPException

from models.user import User


def require_admin(current_user: User) -> None:
    """Só admin: ações de sistema, como gerir contas."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso de administrador é necessário")


def require_finance(current_user: User) -> None:
    """Rotas do Financeiro: admin e o papel financeiro."""
    if current_user.role not in ("admin", "financeiro"):
        raise HTTPException(status_code=403, detail="Acesso ao Financeiro é necessário")

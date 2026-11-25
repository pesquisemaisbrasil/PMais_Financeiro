"""Os três níveis de acesso e as telas que o admin bloqueia por pessoa (Bruno, 19/11/2026).

- `superadmin`: tudo, mais a tela Demandas. Provisório, até o fim do desenvolvimento.
- `admin`: libera computadores e bloqueia telas dos usuários.
- `financeiro`: o usuário, sem liberar computador nem bloquear tela.
"""

from typing import Annotated, Any

from fastapi import Depends, HTTPException

from models.user import User
from services.auth import get_current_user

SUPERADMIN = "superadmin"
ADMIN_ROLES = (SUPERADMIN, "admin")
FINANCE_ROLES = (*ADMIN_ROLES, "financeiro")
ROLE_LABELS = {SUPERADMIN: "Super admin", "admin": "Admin", "financeiro": "Usuário"}

# As telas que o admin pode bloquear, na ordem do menu. Cadastros vale para todas as abas.
SCREENS = {
    "contas-a-pagar": "Contas a pagar",
    "contas-a-receber": "Contas a receber",
    "conferencia-bancaria": "Conferência bancária",
    "divergencias": "Divergências",
    "relatorio-projeto": "Relatório do projeto",
    "fluxo-de-caixa": "Fluxo de caixa",
    "dre": "DRE",
    "cadastros": "Cadastros",
}
SCREEN_BLOCKED = "Esta tela não está liberada para você. Fale com o administrador."


def require_admin(current_user: User) -> None:
    """Admin e super admin: liberar computadores e bloquear telas."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Acesso de administrador é necessário")


def require_finance(current_user: User) -> None:
    """Rotas do Financeiro: os três níveis."""
    if current_user.role not in FINANCE_ROLES:
        raise HTTPException(status_code=403, detail="Acesso ao Financeiro é necessário")


def require_superadmin(current_user: User) -> None:
    if current_user.role != SUPERADMIN:
        raise HTTPException(status_code=403, detail="Esta tela é só do super admin")


def require_screen(screen: str) -> Any:
    """Dependência das rotas de uma tela: a pessoa com a tela bloqueada recebe 403, mesmo chamando
    a API direto. As rotas que várias telas usam (cadastros ativos, Início, avisos) ficam de
    fora."""

    def check(user: Annotated[User, Depends(get_current_user)]) -> None:
        if screen in user.blockedScreens:
            raise HTTPException(status_code=403, detail=SCREEN_BLOCKED)

    return Depends(check)

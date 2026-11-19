"""Avisos dentro do sistema para a equipe (os três níveis). Só texto de tela e link: nada de
dado pessoal de entrevistador."""

import logging

from sqlalchemy.orm import Session

from core.permissions import ADMIN_ROLES, FINANCE_ROLES
from models.notification import Notification
from models.user import User

logger = logging.getLogger(__name__)


def notify_finance(
    db: Session, kind: str, title: str, body: str | None = None, link: str | None = None
) -> None:
    """Um aviso para cada admin e financeiro ativo. Falha ao avisar nunca derruba a ação que
    gerou o aviso: o savepoint desfaz só os avisos, e o resto da transação segue."""
    try:
        users = db.query(User).filter(User.status == "active", User.role.in_(FINANCE_ROLES))
        with db.begin_nested():
            for user in users:
                db.add(
                    Notification(
                        user_id=user.id, type=kind, title=title[:255], body=body, link=link
                    )
                )
    except Exception:
        logger.exception("Falha ao criar o aviso %s", kind)


def notify_admins(
    db: Session,
    kind: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    *,
    except_user_id: int | None = None,
    roles: tuple[str, ...] = ADMIN_ROLES,
) -> None:
    """Um aviso para cada admin ativo, menos `except_user_id` (quem pediu não libera o próprio
    pedido). Como `notify_finance`: falhar ao avisar nunca derruba a ação."""
    try:
        users = db.query(User).filter(User.status == "active", User.role.in_(roles))
        if except_user_id is not None:
            users = users.filter(User.id != except_user_id)
        with db.begin_nested():
            for user in users:
                db.add(
                    Notification(
                        user_id=user.id, type=kind, title=title[:255], body=body, link=link
                    )
                )
    except Exception:
        logger.exception("Falha ao criar o aviso %s", kind)

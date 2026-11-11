"""Avisos dentro do sistema para a equipe (admin e financeiro). Só texto de tela e link: nada de
dado pessoal de entrevistador."""

import logging

from sqlalchemy.orm import Session

from models.notification import Notification
from models.user import User

logger = logging.getLogger(__name__)


def notify_finance(
    db: Session, kind: str, title: str, body: str | None = None, link: str | None = None
) -> None:
    """Um aviso para cada admin e financeiro ativo. Falha ao avisar nunca derruba a ação que
    gerou o aviso: o savepoint desfaz só os avisos, e o resto da transação segue."""
    try:
        users = db.query(User).filter(
            User.status == "active", User.role.in_(["admin", "financeiro"])
        )
        with db.begin_nested():
            for user in users:
                db.add(
                    Notification(
                        user_id=user.id, type=kind, title=title[:255], body=body, link=link
                    )
                )
    except Exception:
        logger.exception("Falha ao criar o aviso %s", kind)

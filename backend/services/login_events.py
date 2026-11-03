import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from core.net import mask_ip
from models.login_event import LoginEvent
from models.user import User

logger = logging.getLogger(__name__)

MAX_FAILURES_PER_EMAIL = 10
FAILURE_WINDOW = timedelta(hours=1)


def too_many_failures(db: Session, email_hash: str) -> bool:
    """Falhas por e-mail contadas no banco: valem depois de um restart e entre
    instâncias, e tratam igual e-mail com e sem conta, para não revelar quem existe."""
    since = datetime.now(UTC) - FAILURE_WINDOW
    failures = (
        db.query(LoginEvent)
        .filter(
            LoginEvent.emailHash == email_hash,
            LoginEvent.success.is_(False),
            LoginEvent.createdAt >= since,
        )
        .count()
    )
    return failures >= MAX_FAILURES_PER_EMAIL


def record_login_event(
    db: Session,
    *,
    user_id: int | None,
    success: bool,
    email_hash: str | None = None,
    reason: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Grava a tentativa e, no sucesso, `lastSignedInAt`. Dá commit e nunca
    levanta: medir não pode quebrar o login."""
    try:
        db.add(
            LoginEvent(
                user_id=user_id,
                emailHash=email_hash,
                success=success,
                reason=reason,
                ipMasked=mask_ip(ip),
                userAgent=user_agent[:255] if user_agent else None,
            )
        )
        if success and user_id is not None:
            db.execute(
                update(User)
                .where(User.id == user_id)
                .values(lastSignedInAt=datetime.now(UTC), updatedAt=User.updatedAt)
            )
        db.commit()
    except Exception:
        logger.exception("Falha ao registrar tentativa de login")
        db.rollback()

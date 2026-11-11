"""Limpeza dos registros de login que só crescem: tentativas (`login_events`) e sessões
(`refresh_tokens`). Os prazos vêm da pergunta Q26 (DPO) e **começam desligados**: sem prazo
configurado, nada é apagado. Por padrão só conta o que apagaria (simulação).

Regras:
- tentativa de login: some quando passou o prazo desde que aconteceu;
- sessão: some quando passou o prazo desde que **expirou**. Sessão revogada ou trocada só entra
  na conta depois de expirar, porque revogada que reaparece derruba a família inteira.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models.login_event import LoginEvent
from models.refresh_token import RefreshToken


def _days(value: int | None, name: str) -> int | None:
    if value is None:
        return None
    if value < 1:
        # 0 ou negativo apagaria tudo de uma vez: quase certamente é engano de digitação
        raise ValueError(f"{name} precisa ser de 1 dia ou mais")
    return value


def purge_login_data(
    db: Session,
    *,
    now: datetime,
    login_events_days: int | None,
    refresh_tokens_days: int | None,
    dry_run: bool = True,
) -> dict[str, int]:
    """Devolve quantos registros de cada tipo passaram do prazo. Só apaga com `dry_run=False`."""
    events_days = _days(login_events_days, "O prazo das tentativas de login")
    tokens_days = _days(refresh_tokens_days, "O prazo das sessões")
    found = {"login_events": 0, "refresh_tokens": 0}

    if events_days is not None:
        old_events = db.query(LoginEvent).filter(
            LoginEvent.createdAt < now - timedelta(days=events_days)
        )
        found["login_events"] = old_events.count()
        if not dry_run:
            old_events.delete(synchronize_session=False)

    if tokens_days is not None:
        old_tokens = db.query(RefreshToken).filter(
            RefreshToken.expiresAt < now - timedelta(days=tokens_days)
        )
        found["refresh_tokens"] = old_tokens.count()
        if not dry_run:
            old_tokens.delete(synchronize_session=False)

    if not dry_run:
        db.commit()
    return found

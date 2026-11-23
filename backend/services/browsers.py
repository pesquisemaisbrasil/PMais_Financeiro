"""Navegador liberado: depois da senha e do autenticador, a conta só entra pelos navegadores que um
admin liberou (spec acesso-e-auditoria, ADR 0022). O primeiro navegador de cada conta é liberado
sozinho; os outros viram pedido, que outro admin libera na tela Acessos.

O navegador é reconhecido por um cookie aleatório; aqui só o hash dele é guardado. O IP não decide
nada (o roteador troca o IP dos computadores): fica mascarado, só para o admin reconhecer.
"""

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from core import config
from core.net import mask_ip
from core.permissions import SUPERADMIN
from core.security import hash_token
from models.refresh_token import RefreshToken
from models.trusted_browser import TrustedBrowser
from models.user import User
from services.notifications import notify_admins

COOKIE_NAME = "financeiro_navegador"
# o máximo que os navegadores aceitam para um cookie
COOKIE_MAX_AGE = int(timedelta(days=400).total_seconds())

PENDING = "pendente"
APPROVED = "liberado"
REFUSED = "recusado"
REVOKED = "revogado"

PENDING_DETAIL = (
    "Este computador ainda não está liberado. O pedido foi para o administrador; quando ele "
    "liberar, entre de novo."
)
REFUSED_DETAIL = "O administrador não liberou este computador. Fale com ele."
OWN_REQUEST_DETAIL = "Peça a outro administrador para liberar este computador"
ALREADY_DECIDED_DETAIL = "Esse pedido já foi decidido. Atualize a lista."
NOT_APPROVED_DETAIL = "Só se revoga um navegador liberado. Atualize a lista."


class BrowserNotFound(Exception):
    pass


class BrowserConflict(Exception):
    """A ação não vale para este navegador agora (HTTP 409), com a mensagem da regra."""


@dataclass(frozen=True)
class Decision:
    """O que o login faz com este navegador. `cookie` é o valor que o navegador deve guardar
    (o que ele já tinha ou um novo); `reason` vai para `login_events`."""

    allowed: bool
    cookie: str | None = None
    reason: str | None = None
    detail: str | None = None
    status: str | None = None


_BROWSERS = (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"))
_SYSTEMS = (
    ("Windows", "Windows"),
    ("Android", "Android"),
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Mac OS X", "Mac"),
    ("Linux", "Linux"),
)


def browser_label(user_agent: str | None) -> str:
    """'Chrome no Windows': o bastante para a pessoa e o admin reconhecerem o computador."""
    agent = user_agent or ""
    browser = next((name for mark, name in _BROWSERS if mark in agent), None)
    if browser is None and "Safari/" in agent:
        browser = "Safari"
    system = next((name for mark, name in _SYSTEMS if mark in agent), None)
    if browser and system:
        return f"{browser} no {system}"
    return browser or (f"Navegador no {system}" if system else "Navegador desconhecido")


def _now() -> datetime:
    return datetime.now(UTC)


def _ever_approved(db: Session, user: User) -> bool:
    """Conta que já tem algum navegador registrado não ganha outro sozinha. Olha qualquer linha, e
    não só as liberadas: um navegador revogado que tenta entrar de novo volta a ser pedido, e
    revogar tudo não pode virar porta para o próximo navegador entrar sem o admin. (O primeiro
    navegador já nasce liberado, então pedido e recusa só existem depois de uma liberação.)"""
    return db.query(TrustedBrowser.id).filter(TrustedBrowser.user_id == user.id).first() is not None


def check(
    db: Session, user: User, cookie: str | None, ip: str | None, user_agent: str | None
) -> Decision:
    """A regra do login, depois do autenticador. Quem chama já travou a conta (FOR UPDATE em
    `get_mfa_pending_user`), então dois logins ao mesmo tempo não criam dois primeiros
    navegadores. Dá commit."""
    if not config.DEVICE_APPROVAL_ENABLED:
        return Decision(allowed=True)
    # O super admin é o desenvolvedor e não passa pela liberação (Bruno, 19/11/2026, ADR 0023):
    # senha e autenticador continuam. O cargo é provisório, até o fim do desenvolvimento.
    if user.role == SUPERADMIN:
        return Decision(allowed=True, cookie=cookie, reason="browser_superadmin")
    label, masked = browser_label(user_agent), mask_ip(ip)
    browser = None
    if cookie:
        browser = (
            db.query(TrustedBrowser)
            .filter(
                TrustedBrowser.user_id == user.id, TrustedBrowser.tokenHash == hash_token(cookie)
            )
            .first()
        )
    if browser is not None and browser.status == APPROVED:
        browser.lastSeenAt, browser.ipMasked, browser.label = _now(), masked, label
        db.commit()
        return Decision(allowed=True, cookie=cookie)

    if not _ever_approved(db, user):
        # Primeiro navegador da conta (no cadastro do autenticador ou no primeiro login depois
        # da entrega): liberado na hora.
        value = cookie if browser is not None and cookie else secrets.token_urlsafe(32)
        if browser is None:
            browser = TrustedBrowser(user_id=user.id, tokenHash=hash_token(value))
            db.add(browser)
        browser.status, browser.label, browser.ipMasked = APPROVED, label, masked
        browser.lastSeenAt = _now()
        db.commit()
        return Decision(allowed=True, cookie=value, reason="browser_first")

    if browser is not None and browser.status == REFUSED:
        return Decision(
            allowed=False,
            cookie=cookie,
            reason="browser_refused",
            detail=REFUSED_DETAIL,
            status=REFUSED,
        )
    if browser is not None and browser.status == PENDING:
        browser.ipMasked, browser.label = masked, label
        db.commit()
        return Decision(
            allowed=False,
            cookie=cookie,
            reason="browser_pending",
            detail=PENDING_DETAIL,
            status=PENDING,
        )

    # Navegador novo, ou um que foi revogado: vira pedido, e os admins são avisados uma vez.
    value = cookie if browser is not None and cookie else secrets.token_urlsafe(32)
    if browser is None:
        browser = TrustedBrowser(user_id=user.id, tokenHash=hash_token(value))
        db.add(browser)
    browser.status, browser.label, browser.ipMasked = PENDING, label, masked
    browser.requestedAt, browser.decidedAt, browser.decided_by_user_id = _now(), None, None
    db.flush()
    notify_admins(
        db,
        "browser_request",
        f"{user.name} pediu para entrar de um computador novo",
        f"{label}. Libere ou recuse em Acessos.",
        "/acessos",
        except_user_id=user.id,
    )
    db.commit()
    return Decision(
        allowed=False,
        cookie=value,
        reason="browser_pending",
        detail=PENDING_DETAIL,
        status=PENDING,
    )


def _get(db: Session, browser_id: int) -> TrustedBrowser:
    browser = (
        db.query(TrustedBrowser).filter(TrustedBrowser.id == browser_id).with_for_update().first()
    )
    if browser is None:
        raise BrowserNotFound
    return browser


def _decide(browser: TrustedBrowser, admin: User, status: str) -> None:
    browser.status, browser.decidedAt, browser.decided_by_user_id = status, _now(), admin.id


def approve(db: Session, browser_id: int, admin: User) -> TrustedBrowser:
    """Libera um pedido (ou um navegador recusado ou revogado antes). Admin não libera o próprio
    computador: quem roubou a senha e o celular de um admin não se libera sozinho."""
    browser = _get(db, browser_id)
    if browser.user_id == admin.id:
        raise BrowserConflict(OWN_REQUEST_DETAIL)
    if browser.status == APPROVED:
        raise BrowserConflict(ALREADY_DECIDED_DETAIL)
    _decide(browser, admin, APPROVED)
    db.commit()
    return browser


def refuse(db: Session, browser_id: int, admin: User) -> TrustedBrowser:
    browser = _get(db, browser_id)
    if browser.status != PENDING:
        raise BrowserConflict(ALREADY_DECIDED_DETAIL)
    _decide(browser, admin, REFUSED)
    db.commit()
    return browser


def revoke(db: Session, browser_id: int, admin: User) -> TrustedBrowser:
    """Tira a liberação e derruba as sessões da conta, como o reset do autenticador: a sessão
    aberta naquele navegador não pode continuar valendo."""
    browser = _get(db, browser_id)
    if browser.status != APPROVED:
        raise BrowserConflict(NOT_APPROVED_DETAIL)
    _decide(browser, admin, REVOKED)
    db.query(RefreshToken).filter(RefreshToken.user_id == browser.user_id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()
    return browser


def approve_latest_request(db: Session, user: User) -> TrustedBrowser | None:
    """Saída de emergência (scripts/liberar_navegador.py), para quando não há outro admin:
    libera o pedido mais recente da conta. Sem quem decidiu: foi pelo servidor."""
    browser = (
        db.query(TrustedBrowser)
        .filter(TrustedBrowser.user_id == user.id, TrustedBrowser.status == PENDING)
        .order_by(TrustedBrowser.requestedAt.desc(), TrustedBrowser.id.desc())
        .with_for_update()
        .first()
    )
    if browser is None:
        return None
    browser.status, browser.decidedAt = APPROVED, _now()
    db.commit()
    return browser


def listing(db: Session, status: str | None) -> list[dict[str, Any]]:
    """O que a tela Acessos mostra: os pedidos e os navegadores, do mais novo para o mais antigo."""
    query = db.query(TrustedBrowser)
    if status:
        query = query.filter(TrustedBrowser.status == status)
    rows = query.order_by(TrustedBrowser.requestedAt.desc(), TrustedBrowser.id.desc()).all()
    return [
        {
            "id": b.id,
            "userId": b.user_id,
            "userName": b.user.name,
            "userEmail": b.user.email,
            "label": b.label,
            "ipMasked": b.ipMasked,
            "status": b.status,
            "requestedAt": b.requestedAt,
            "decidedAt": b.decidedAt,
            "decidedBy": b.decided_by.name if b.decided_by else None,
            "lastSeenAt": b.lastSeenAt,
        }
        for b in rows
    ]

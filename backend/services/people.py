"""As pessoas do Financeiro e as telas bloqueadas de cada uma (Bruno, 19/11/2026).

Admin bloqueia telas só de usuário; super admin, também de admin. Ninguém mexe nas próprias telas
nem nas de um super admin. Cada troca fica no histórico (`record_events`, kind `userScreens`).
"""

from typing import Any

from sqlalchemy.orm import Session

from core.permissions import ROLE_LABELS, SCREENS, SUPERADMIN
from models.reference import RecordEvent
from models.user import User
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

KIND = "userScreens"
UNKNOWN_SCREEN = "Tela desconhecida"
NOT_YOURS = "Você não pode mudar as telas desta pessoa"
OWN = "Peça a outro administrador para mudar as suas telas"


def can_edit(editor: User, person: User) -> bool:
    if person.id == editor.id or person.role == SUPERADMIN:
        return False
    return person.role == "financeiro" or editor.role == SUPERADMIN


def _row(person: User, editor: User) -> dict[str, Any]:
    return {
        "id": person.id,
        "name": person.name,
        "email": person.email,
        "role": person.role,
        "roleLabel": ROLE_LABELS.get(person.role, person.role),
        "blockedScreens": person.blockedScreens,
        "canEdit": can_edit(editor, person),
    }


def listing(db: Session, editor: User) -> dict[str, Any]:
    people = (
        db.query(User)
        .filter(User.status == "active", User.role.in_(tuple(ROLE_LABELS)))
        .order_by(User.name, User.id)
        .all()
    )
    return {
        "screens": [{"id": key, "label": label} for key, label in SCREENS.items()],
        "people": [_row(person, editor) for person in people],
    }


def set_screens(db: Session, person_id: int, blocked: list[str], editor: User) -> dict[str, Any]:
    if any(screen not in SCREENS for screen in blocked):
        raise PayableInvalid(UNKNOWN_SCREEN)
    person = db.query(User).filter(User.id == person_id).with_for_update().one_or_none()
    if person is None or person.status != "active" or person.role not in ROLE_LABELS:
        raise PayableNotFound
    if person.id == editor.id:
        raise PayableConflict(OWN)
    if not can_edit(editor, person):
        raise PayableConflict(NOT_YOURS)
    ordered = [screen for screen in SCREENS if screen in blocked]
    if ordered != person.blockedScreens:
        person.blockedScreensText = ",".join(ordered)
        names = ", ".join(SCREENS[screen] for screen in ordered) or "nenhuma"
        text = f"Telas bloqueadas de {person.name}: {names}"
        db.add(RecordEvent(kind=KIND, record_id=person.id, user_id=editor.id, text=text[:500]))
    db.commit()
    return _row(person, editor)

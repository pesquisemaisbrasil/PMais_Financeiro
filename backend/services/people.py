"""As pessoas do Financeiro, as telas bloqueadas (Bruno, 19/11/2026) e as empresas que cada uma
vê (27/11/2026).

Admin muda só as de usuário; super admin, também as de admin. Ninguém mexe nas próprias nem nas de
um super admin. As empresas, só quem vê todas muda. Cada troca fica no histórico (`record_events`,
kinds `userScreens` e `userCompanies`).
"""

from typing import Any

from sqlalchemy.orm import Session

from core.permissions import ROLE_LABELS, SCREENS, SUPERADMIN
from models.reference import Company, RecordEvent
from models.user import User
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

KIND = "userScreens"
COMPANIES_KIND = "userCompanies"
ONLY_FULL_ACCESS = "Só quem vê todas as empresas muda o acesso por empresa"
NOT_YOUR_COMPANIES = "Você não pode mudar as empresas desta pessoa"
OWN_COMPANIES = "Peça a outro administrador para mudar as suas empresas"
PICK_ONE = "Escolha ao menos uma empresa, ou Todas as empresas"
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
        "companyIds": person.companyIds,
        "canEditCompanies": editor.companyIds is None and can_edit(editor, person),
    }


def listing(db: Session, editor: User) -> dict[str, Any]:
    people = (
        db.query(User)
        .filter(User.status == "active", User.role.in_(tuple(ROLE_LABELS)))
        .order_by(User.name, User.id)
        .all()
    )
    # o admin que vê só algumas empresas enxerga o nome só das dele (a lista já vem filtrada)
    companies = db.query(Company).filter(Company.active.is_(True)).order_by(Company.name)
    return {
        "screens": [{"id": key, "label": label} for key, label in SCREENS.items()],
        "companies": [{"id": c.id, "name": c.label} for c in companies],
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


def set_companies(
    db: Session, person_id: int, company_ids: list[int] | None, editor: User
) -> dict[str, Any]:
    """As empresas que a pessoa vê: None é todas. Vale no próximo pedido dela."""
    if editor.companyIds is not None:
        raise PayableConflict(ONLY_FULL_ACCESS)
    person = db.query(User).filter(User.id == person_id).with_for_update().one_or_none()
    if person is None or person.status != "active" or person.role not in ROLE_LABELS:
        raise PayableNotFound
    if person.id == editor.id:
        raise PayableConflict(OWN_COMPANIES)
    if not can_edit(editor, person):
        raise PayableConflict(NOT_YOUR_COMPANIES)
    names = "todas"
    text = None
    if company_ids is not None:
        chosen = sorted(set(company_ids))
        if not chosen:
            raise PayableInvalid(PICK_ONE)
        found = db.query(Company).filter(Company.id.in_(chosen)).order_by(Company.name).all()
        if len(found) != len(chosen):
            raise PayableInvalid("Empresa não encontrada")
        text = ",".join(str(company_id) for company_id in chosen)
        names = ", ".join(company.label for company in found)
    if text != person.companyAccessText:
        person.companyAccessText = text
        event = f"Empresas de {person.name}: {names}"
        db.add(
            RecordEvent(
                kind=COMPANIES_KIND, record_id=person.id, user_id=editor.id, text=event[:500]
            )
        )
    db.commit()
    return _row(person, editor)

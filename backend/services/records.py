"""Cadastros que classificam os lançamentos. Cadastro em uso não é excluído, só inativado."""

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.document import clean_cnpj, is_cpf_shaped, valid_cnpj
from models.payable import Payable, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
    RecordCounter,
    RecordEvent,
    Supplier,
)
from models.user import User
from schemas.records import ProjectIncentive, RecordIn
from services.payable import PayableConflict, PayableInvalid


class RecordNotFound(Exception):
    pass


@dataclass(frozen=True)
class Kind:
    model: Any
    one: str
    usage: tuple[Any, ...]


KINDS: dict[str, Kind] = {
    "suppliers": Kind(Supplier, "fornecedor", (Payable.supplier_id,)),
    "customers": Kind(Customer, "cliente", (Receivable.customer_id,)),
    "categories": Kind(ExpenseCategory, "conta", (Payable.category_id, Receivable.category_id)),
    "companies": Kind(
        Company,
        "empresa",
        (
            Payable.company_id,
            Receivable.company_id,
            BusinessUnit.company_id,
            BankAccount.company_id,
        ),
    ),
    "units": Kind(BusinessUnit, "unidade", (Payable.unit_id, Receivable.unit_id)),
    "costCenters": Kind(
        CostCenter, "centro de custo", (Payable.cost_center_id, Receivable.cost_center_id)
    ),
    "bankAccounts": Kind(
        BankAccount,
        "conta bancária",
        (PayablePayment.bank_account_id, ReceivablePayment.bank_account_id),
    ),
    "paymentMethods": Kind(
        PaymentMethod,
        "forma de pagamento",
        (
            Payable.payment_method_id,
            PayablePayment.payment_method_id,
            ReceivablePayment.payment_method_id,
        ),
    ),
}
_ARTICLE = {"suppliers": "um", "customers": "um", "companies": "uma"}
_ACTIVE = {"suppliers": "ativo", "customers": "ativo", "companies": "ativa"}
PARTY_KINDS = ("suppliers", "customers", "companies")
# Estes cadastros têm código gerado pelo sistema (o plano de contas tem o seu, escolhido à mão).
GENERATED_CODE = PARTY_KINDS
IN_USE_DETAIL = "Esse cadastro tem lançamentos — inative em vez de excluir"
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PHONE = re.compile(r"\+\d{2} \d{2} [\d-]{8,10}")


def _used_ids(db: Session, kind: str) -> set[int]:
    used: set[int] = set()
    for column in KINDS[kind].usage:
        used |= {value for (value,) in db.query(column).distinct() if value is not None}
    return used


def _out(record: Any, in_use: bool) -> dict[str, Any]:
    return {
        "id": record.id,
        "name": record.name,
        "active": record.active,
        "inUse": in_use,
        "nickname": getattr(record, "nickname", None),
        "code": getattr(record, "code", None),
        "companyId": getattr(record, "company_id", None),
        "document": getattr(record, "document", None),
        "contactName": getattr(record, "contactName", None),
        "phone": getattr(record, "phone", None),
        "email": getattr(record, "email", None),
        "paymentTerms": getattr(record, "paymentTerms", None),
        "kind": getattr(record, "kind", None),
    }


def list_records(db: Session, kind: str) -> list[dict[str, Any]]:
    used = _used_ids(db, kind)
    model = KINDS[kind].model
    records = db.query(model).order_by(model.name).all()
    return [_out(record, record.id in used) for record in records]


def _log(db: Session, kind: str, record_id: int, user: User, text: str) -> None:
    db.add(RecordEvent(kind=kind, record_id=record_id, user_id=user.id, text=text[:500]))


def _get(db: Session, kind: str, record_id: int) -> Any:
    record = db.query(KINDS[kind].model).filter_by(id=record_id).with_for_update().first()
    if record is None:
        raise RecordNotFound
    return record


def _filled(value: str | None) -> str | None:
    return (value or "").strip() or None


def _check_length(model: Any, attribute: str, value: str, label: str) -> None:
    limit = getattr(model, attribute).type.length
    if len(value) > limit:
        raise PayableInvalid(f"{label} pode ter até {limit} caracteres")


def _taken(db: Session, kind: str, record_id: int | None, *conditions: Any) -> bool:
    query = db.query(KINDS[kind].model).filter(*conditions)
    if record_id is not None:
        query = query.filter(KINDS[kind].model.id != record_id)
    return query.first() is not None


def _party_document(db: Session, kind: str, record_id: int | None, value: str | None) -> str | None:
    """CNPJ de fornecedor, cliente ou empresa do Grupo: só CNPJ, válido, e único entre os ativos."""
    if not _filled(value):
        return None
    document = clean_cnpj(value or "")
    if is_cpf_shaped(document):
        raise PayableInvalid("Por enquanto, só CNPJ: CPF não é guardado aqui")
    if not valid_cnpj(document):
        raise PayableInvalid("CNPJ inválido. Confira os dígitos")
    model = KINDS[kind].model
    if _taken(db, kind, record_id, model.document == document, model.active.is_(True)):
        raise PayableConflict(
            f"Já existe {_ARTICLE[kind]} {KINDS[kind].one} {_ACTIVE[kind]} com esse documento"
        )
    return document


def _company(db: Session, company_id: int | None) -> int:
    record = db.get(Company, company_id) if company_id else None
    if record is None or not record.active:
        raise PayableInvalid("Escolha a empresa")
    return record.id


def _next_code(db: Session, kind: str) -> str:
    """O próximo código do cadastro: 0001, 0002... Nunca repete nem volta atrás, nem ao excluir.
    O contador fica travado até o fim da transação: dois cadastros ao mesmo tempo não empatam."""
    counter = db.query(RecordCounter).filter_by(kind=kind).with_for_update().first()
    if counter is None:
        counter = RecordCounter(kind=kind, lastValue=0)
        db.add(counter)
        db.flush()
    model = KINDS[kind].model
    while True:
        counter.lastValue += 1
        code = f"{counter.lastValue:04d}"
        # um código digitado à mão antes deste contador não pode empatar com o novo
        if not _taken(db, kind, None, model.code == code):
            return code


def _fields(db: Session, kind: str, record_id: int | None, data: RecordIn) -> dict[str, Any]:
    model = KINDS[kind].model
    name = data.name.strip()
    if not name:
        raise PayableInvalid("Preencha o nome")
    _check_length(model, "name", name, "O nome")
    fields: dict[str, Any] = {"name": name}
    same_name = func.lower(model.name) == name.lower()

    if kind in ("suppliers", "customers"):
        nickname = (data.nickname or "").strip()
        if not nickname:
            raise PayableInvalid("Preencha o apelido")
        _check_length(model, "nickname", nickname, "O apelido")
        email = _filled(data.email)
        if email and not EMAIL.fullmatch(email):
            raise PayableInvalid("E-mail inválido")
        phone = _filled(data.phone)
        if phone and not PHONE.fullmatch(phone):
            raise PayableInvalid("Telefone no formato +55 41 99999-0000")
        fields.update(
            nickname=nickname,
            document=_party_document(db, kind, record_id, data.document),
            contactName=_filled(data.contactName),
            phone=phone,
            email=email,
        )
        if kind == "suppliers":
            fields["paymentTerms"] = _filled(data.paymentTerms)
    elif kind == "categories":
        code = (data.code or "").strip()
        if not code:
            raise PayableInvalid("Preencha o código da conta")
        _check_length(model, "code", code, "O código")
        if _taken(db, kind, record_id, model.code == code):
            raise PayableConflict("Já existe uma conta com esse código")
        fields["code"] = code
        fields["kind"] = data.kind or "despesa"
    elif kind in ("units", "bankAccounts"):
        company_id = _company(db, data.companyId)
        if _taken(db, kind, record_id, same_name, model.company_id == company_id):
            raise PayableConflict(f"Essa empresa já tem {KINDS[kind].one} com esse nome")
        fields["company_id"] = company_id
    elif _taken(db, kind, record_id, same_name):
        raise PayableConflict(f"Já existe {KINDS[kind].one} com esse nome")
    elif kind == "companies":
        short_name = _filled(data.nickname)
        if short_name:
            _check_length(model, "nickname", short_name, "O apelido")
        fields.update(
            nickname=short_name,
            document=_party_document(db, kind, record_id, data.document),
        )
    return fields


def create(db: Session, kind: str, data: RecordIn, user: User) -> dict[str, Any]:
    fields = _fields(db, kind, None, data)
    if kind in GENERATED_CODE:
        # o código vem do sistema; o que a tela mandar não vale. Depois de criado, nunca muda.
        fields["code"] = _next_code(db, kind)
    record = KINDS[kind].model(**fields)
    db.add(record)
    db.flush()
    _log(db, kind, record.id, user, f"Cadastrou {record.name}")
    db.commit()
    return _out(record, False)


def update(db: Session, kind: str, record_id: int, data: RecordIn, user: User) -> dict[str, Any]:
    record = _get(db, kind, record_id)
    fields = _fields(db, kind, record_id, data)
    in_use = record_id in _used_ids(db, kind)
    if in_use and "company_id" in fields and fields["company_id"] != record.company_id:
        raise PayableConflict("Esse cadastro tem lançamentos — a empresa não pode mudar")
    if in_use and "kind" in fields and fields["kind"] != record.kind:
        raise PayableConflict(
            "Essa conta tem lançamentos — o tipo (despesa ou receita) não pode mudar"
        )
    for attribute, value in fields.items():
        setattr(record, attribute, value)
    _log(db, kind, record_id, user, f"Editou {record.name}")
    db.commit()
    return _out(record, in_use)


def set_active(db: Session, kind: str, record_id: int, active: bool, user: User) -> dict[str, Any]:
    record = _get(db, kind, record_id)
    if (
        active
        and kind in PARTY_KINDS
        and record.document
        and _taken(
            db,
            kind,
            record_id,
            KINDS[kind].model.document == record.document,
            KINDS[kind].model.active,
        )
    ):
        raise PayableConflict(
            f"Já existe {_ARTICLE[kind]} {KINDS[kind].one} {_ACTIVE[kind]} com esse documento"
        )
    if record.active != active:
        record.active = active
        _log(db, kind, record_id, user, f"{'Reativou' if active else 'Inativou'} {record.name}")
    db.commit()
    return _out(record, record_id in _used_ids(db, kind))


def delete(db: Session, kind: str, record_id: int, user: User) -> None:
    record = _get(db, kind, record_id)
    if record_id in _used_ids(db, kind):
        raise PayableConflict(IN_USE_DETAIL)
    _log(db, kind, record_id, user, f"Excluiu {record.name}")
    db.delete(record)
    db.commit()


def _incentive_text(project: Project) -> str:
    kind = project.projectType or "sem tipo"
    if not project.hasIncentive:
        return f"{kind}, sem incentivo"
    return f"{kind}, incentivo em {project.incentiveDays} dias úteis"


def update_project(db: Session, project_id: int, data: ProjectIncentive, user: User) -> Project:
    """Só o tipo e o incentivo: o resto do projeto vem do Connect."""
    project = db.query(Project).filter_by(id=project_id).with_for_update().first()
    if project is None:
        raise RecordNotFound
    if data.hasIncentive and not data.incentiveDays:
        raise PayableInvalid("Informe o prazo do incentivo em dias úteis (de 1 a 30)")
    before = _incentive_text(project)
    project.projectType = data.projectType
    project.hasIncentive = data.hasIncentive
    project.incentiveDays = data.incentiveDays if data.hasIncentive else None
    _log(
        db,
        "projects",
        project_id,
        user,
        f"PRJ-{project.code}: {before} → {_incentive_text(project)}",
    )
    db.commit()
    return project

"""Cadastros que classificam os lançamentos. Cadastro em uso não é excluído, só inativado."""

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.document import clean_cnpj, is_cpf_shaped, valid_cnpj
from core.pix import is_valid_cpf
from models.bank_statement import BankStatement, BankTransaction
from models.payable import Payable, PayableAllocation, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    CustomerAttachment,
    ExpenseCategory,
    ExpenseCategoryGroup,
    PaymentMethod,
    Project,
    RecordCounter,
    RecordEvent,
    Supplier,
)
from models.user import User
from schemas.records import ProjectIn, ProjectIncentive, RecordIn
from services.cnpj_lookup import CPF_IN_TEXT
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
    # lançamento ou documento anexado (o documento só sai de forma lógica, então o cliente fica)
    "customers": Kind(
        Customer,
        "cliente",
        (Receivable.customer_id, CustomerAttachment.customer_id, Project.customer_id),
    ),
    "categories": Kind(ExpenseCategory, "conta", (Payable.category_id, Receivable.category_id)),
    # grupo com conta embaixo não se exclui (24/11)
    "categoryGroups": Kind(ExpenseCategoryGroup, "grupo", (ExpenseCategory.group_id,)),
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
    # também a unidade e o centro de custo padrão de um projeto contam como uso
    "units": Kind(BusinessUnit, "unidade", (Payable.unit_id, Receivable.unit_id, Project.unit_id)),
    # tem lançamento, ou tem sub-centro embaixo (parent_id): nos dois casos não se exclui
    "costCenters": Kind(
        CostCenter,
        "centro de custo",
        (
            Payable.cost_center_id,
            Receivable.cost_center_id,
            CostCenter.parent_id,
            Project.cost_center_id,
        ),
    ),
    "bankAccounts": Kind(
        BankAccount,
        "conta bancária",
        (
            PayablePayment.bank_account_id,
            ReceivablePayment.bank_account_id,
            BankStatement.bank_account_id,
            BankTransaction.bank_account_id,
        ),
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
# O resto da ficha do cliente: IE, telefones, e-mail alternativo, observações e endereço.
CUSTOMER_DETAILS = (
    "stateRegistration",
    "phone2",
    "phone3",
    "emailAlt",
    "notes",
    "addressCountry",
    "addressZip",
    "addressStreet",
    "addressNumber",
    "addressComplement",
    "addressDistrict",
    "addressCity",
    "addressState",
    "origin",
)
# Os dados da conta bancária: banco, agência, conta, tipo e saldo inicial com a data.
BANK_DETAILS = (
    "bankName",
    "agency",
    "accountNumber",
    "accountType",
    "impactsCashFlow",
    "openingBalance",
    "openingDate",
)
ACCOUNT_TYPES = ("cc", "ci", "interna", "credito")
BANK_NUMBER = re.compile(r"[0-9][0-9.\-/xX]*")
UFS = frozenset(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()
)
# Estes cadastros têm código gerado pelo sistema (o plano de contas tem o seu, escolhido à mão;
# os outros ainda não têm código).
GENERATED_CODE = (*PARTY_KINDS, "units")
IN_USE_DETAIL = "Esse cadastro tem lançamentos — inative em vez de excluir"
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PHONE = re.compile(r"\+\d{2} \d{2} [\d-]{8,10}")
CPF_MASKED = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}")


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
        "legacyCode": getattr(record, "legacyCode", None),
        "companyId": getattr(record, "company_id", None),
        "groupId": getattr(record, "group_id", None),
        "parentId": getattr(record, "parent_id", None),
        "document": getattr(record, "document", None),
        "personType": getattr(record, "personType", None),
        "contactName": getattr(record, "contactName", None),
        "phone": getattr(record, "phone", None),
        "email": getattr(record, "email", None),
        "paymentTerms": getattr(record, "paymentTerms", None),
        **{name: getattr(record, name, None) for name in (*CUSTOMER_DETAILS, *BANK_DETAILS)},
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
    model = KINDS[kind].model
    # `of=`: o centro de custo junta o superior com LEFT JOIN, e o Postgres não trava esse lado
    record = db.query(model).filter_by(id=record_id).with_for_update(of=model).first()
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


def _party_document(
    db: Session,
    kind: str,
    record_id: int | None,
    value: str | None,
    person_type: str | None,
    unique: bool = True,
) -> str | None:
    """CNPJ de fornecedor, cliente ou empresa do Grupo: só CNPJ, válido, e único entre os ativos.
    O da unidade (`unique=False`) pode repetir: no sistema antigo ela leva o CNPJ da empresa."""
    if not _filled(value):
        return None
    if person_type == "PF":
        raise PayableInvalid("Pessoa física fica sem documento: o CPF não é guardado aqui")
    document = clean_cnpj(value or "")
    if is_cpf_shaped(document):
        raise PayableInvalid("Por enquanto, só CNPJ: CPF não é guardado aqui")
    if not valid_cnpj(document):
        raise PayableInvalid("CNPJ inválido. Confira os dígitos")
    model = KINDS[kind].model
    if unique and _taken(db, kind, record_id, model.document == document, model.active.is_(True)):
        raise PayableConflict(
            f"Já existe {_ARTICLE[kind]} {KINDS[kind].one} {_ACTIVE[kind]} com esse documento"
        )
    return document


def _company(db: Session, company_id: int | None) -> int:
    record = db.get(Company, company_id) if company_id else None
    if record is None or not record.active:
        raise PayableInvalid("Escolha a empresa")
    return record.id


def _next_number(db: Session, key: str) -> int:
    """O próximo número do contador, travado até o fim da transação (nunca repete nem volta)."""
    counter = db.query(RecordCounter).filter_by(kind=key).with_for_update().first()
    if counter is None:
        counter = RecordCounter(kind=key, lastValue=0)
        db.add(counter)
        db.flush()
    counter.lastValue += 1
    return int(counter.lastValue)


def _category_group(db: Session, record_id: int | None, group_id: int | None) -> int | None:
    """O grupo da conta do plano de contas: um grupo ativo, ou nenhum. A conta que já estava num
    grupo depois inativado continua editável nele."""
    if group_id is None:
        return None
    current = db.get(ExpenseCategory, record_id) if record_id is not None else None
    if current is not None and current.group_id == group_id:
        return group_id
    group = db.get(ExpenseCategoryGroup, group_id)
    if group is None or not group.active:
        raise PayableInvalid("Escolha um grupo do plano de contas ativo")
    return int(group.id)


def _cost_center_parent(db: Session, record_id: int | None, parent_id: int | None) -> int | None:
    """O superior do centro de custo: só um principal ativo. Sem superior, o centro é principal."""
    if parent_id is None:
        return None
    if parent_id == record_id:
        raise PayableInvalid("Um centro de custo não pode ser superior dele mesmo")
    current = db.get(CostCenter, record_id) if record_id is not None else None
    if current is not None and current.parent_id == parent_id:
        # não mudou: o principal pode ter sido inativado depois, e o sub-centro segue editável
        return parent_id
    parent = db.get(CostCenter, parent_id)
    if parent is None or not parent.active:
        raise PayableInvalid("Escolha um centro de custo superior ativo")
    if parent.parent_id is not None:
        raise PayableInvalid("O superior precisa ser um centro principal: só há dois níveis")
    return parent.id


def _next_cost_center_code(db: Session, parent_id: int | None) -> str:
    """Principal: 001, 002... Sub-centro: o código do superior, um ponto e a ordem dentro dele."""
    if parent_id is None:
        key, prefix, width = "costCenters", "", 3
    else:
        parent = db.get(CostCenter, parent_id)
        if parent is None or not parent.code:
            raise PayableInvalid("Esse centro principal ainda não tem código")
        key, prefix, width = f"costCenters:{parent_id}", f"{parent.code}.", 3
    while True:
        code = f"{prefix}{_next_number(db, key):0{width}d}"
        # um código que já exista (digitado antes do contador) não pode empatar com o novo
        if not _taken(db, "costCenters", None, CostCenter.code == code):
            return code


def _next_code(db: Session, kind: str) -> str:
    """O próximo código do cadastro: 0001, 0002... Nunca repete nem volta atrás, nem ao excluir.
    O contador fica travado até o fim da transação: dois cadastros ao mesmo tempo não empatam."""
    model = KINDS[kind].model
    while True:
        code = f"{_next_number(db, kind):04d}"
        # um código digitado à mão antes deste contador não pode empatar com o novo
        if not _taken(db, kind, None, model.code == code):
            return code


def _state_registration(data: RecordIn) -> str | None:
    """A IE (cliente, empresa e unidade). CPF e RG não entram (Q23 e Q37)."""
    registration = _filled(data.stateRegistration)
    if registration and (
        CPF_MASKED.search(registration) or is_valid_cpf(re.sub(r"\D", "", registration))
    ):
        raise PayableInvalid("Informe só a inscrição estadual (IE): CPF e RG não são guardados")
    return registration


def _old_system(model: Any, data: RecordIn) -> dict[str, Any]:
    """Empresa, unidade, centro e cliente como no sistema antigo (24/11): o código de lá e a IE."""
    legacy = _filled(data.legacyCode)
    if legacy:
        _check_length(model, "legacyCode", legacy, "O código no sistema antigo")
    if not hasattr(model, "stateRegistration"):
        return {"legacyCode": legacy}  # centro de custo: só o código antigo
    return {"stateRegistration": _state_registration(data), "legacyCode": legacy}


def _customer_details(model: Any, data: RecordIn) -> dict[str, Any]:
    """O resto da ficha do cliente (e do fornecedor, desde 24/11), tudo opcional. CPF e RG nunca
    entram: a IE e as observações que parecem CPF são recusadas (Q23 e Q37)."""
    details: dict[str, Any] = {}
    for attribute, label in (("phone2", "Telefone 2"), ("phone3", "Telefone 3")):
        phone = _filled(getattr(data, attribute))
        if phone and not PHONE.fullmatch(phone):
            raise PayableInvalid(f"{label} no formato +55 41 99999-0000")
        details[attribute] = phone
    email = _filled(data.emailAlt)
    if email and not EMAIL.fullmatch(email):
        raise PayableInvalid("E-mail alternativo inválido")
    details["emailAlt"] = email
    details["stateRegistration"] = _state_registration(data)
    notes = _filled(data.notes)
    if notes and any(
        is_valid_cpf(re.sub(r"\D", "", found.group())) for found in CPF_IN_TEXT.finditer(notes)
    ):
        raise PayableInvalid("Não escreva CPF nas observações: ele não é guardado")
    details["notes"] = notes

    details["addressCountry"] = _filled(data.addressCountry)
    zip_digits = re.sub(r"\D", "", data.addressZip or "")
    if zip_digits and len(zip_digits) != 8:
        raise PayableInvalid("O CEP tem 8 números")
    details["addressZip"] = zip_digits or None
    state = (_filled(data.addressState) or "").upper()
    if state and state not in UFS:
        raise PayableInvalid("UF inválida")
    details["addressState"] = state or None
    for attribute, label in (
        ("addressStreet", "O endereço"),
        ("addressNumber", "O número"),
        ("addressComplement", "O complemento"),
        ("addressDistrict", "O bairro"),
        ("addressCity", "A cidade"),
    ):
        value = _filled(getattr(data, attribute))
        if value:
            _check_length(model, attribute, value, label)
        details[attribute] = value
    details["origin"] = _filled(data.origin)
    for attribute, label in (
        ("addressCountry", "O país"),
        ("notes", "As observações"),
        ("origin", "A origem"),
    ):
        if details[attribute]:
            _check_length(model, attribute, details[attribute], label)
    return details


def _bank_details(data: RecordIn) -> dict[str, Any]:
    """Banco, agência e conta, tipo e saldo inicial. São dados da conta da empresa. Como no sistema
    antigo (24/11): o banco é opcional (a Caixinha não tem) e, no cartão de crédito, a agência e a
    conta aceitam texto (a bandeira, "Master")."""
    bank = _filled(data.bankName)
    if bank:
        _check_length(BankAccount, "bankName", bank, "O banco")
    details: dict[str, Any] = {"bankName": bank}
    kind = data.accountType or "cc"
    for attribute, label in (("agency", "A agência"), ("accountNumber", "A conta")):
        value = _filled(getattr(data, attribute))
        if value:
            _check_length(BankAccount, attribute, value, label)
            if kind != "credito" and not BANK_NUMBER.fullmatch(value):
                raise PayableInvalid(f"{label} tem só números, hífen e o dígito (pode ser X)")
        details[attribute] = value
    details["accountType"] = kind
    details["impactsCashFlow"] = data.impactsCashFlow is not False
    balance = data.openingBalance if data.openingBalance is not None else Decimal("0")
    if balance != 0 and data.openingDate is None:
        raise PayableInvalid("Informe a data do saldo inicial")
    details["openingBalance"] = balance
    details["openingDate"] = data.openingDate
    return details


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
            personType=data.personType,
            document=_party_document(db, kind, record_id, data.document, data.personType),
            contactName=_filled(data.contactName),
            phone=phone,
            email=email,
        )
        if kind == "suppliers":
            fields["paymentTerms"] = _filled(data.paymentTerms)
        # a mesma ficha nos dois, como no sistema antigo (24/11)
        fields.update(_customer_details(model, data))
        fields.update(_old_system(model, data))
    elif kind == "categories":
        code = (data.code or "").strip()
        if not code:
            raise PayableInvalid("Preencha o código da conta")
        _check_length(model, "code", code, "O código")
        group_id = _category_group(db, record_id, data.groupId)
        # o código não repete sem grupo nem dentro do mesmo grupo (no sistema antigo, o 002.009
        # está em dois grupos)
        same_group = model.group_id == group_id if group_id else model.group_id.is_(None)
        if _taken(db, kind, record_id, model.code == code, same_group):
            raise PayableConflict(
                "Esse grupo já tem uma conta com esse código"
                if group_id
                else "Já existe uma conta com esse código"
            )
        fields["code"] = code
        fields["kind"] = data.kind or "despesa"
        fields["group_id"] = group_id
    elif kind == "categoryGroups":
        code = (data.code or "").strip()
        if not code:
            raise PayableInvalid("Preencha o código do grupo")
        _check_length(model, "code", code, "O código")
        if _taken(db, kind, record_id, model.code == code):
            raise PayableConflict("Já existe um grupo com esse código")
        fields["code"] = code
    elif kind in ("units", "bankAccounts"):
        company_id = _company(db, data.companyId)
        if _taken(db, kind, record_id, same_name, model.company_id == company_id):
            raise PayableConflict(f"Essa empresa já tem {KINDS[kind].one} com esse nome")
        fields["company_id"] = company_id
        if kind == "bankAccounts":
            fields.update(_bank_details(data))
            fields.update(_old_system(model, data))
        else:
            unit_nickname = _filled(data.nickname)
            if unit_nickname:
                _check_length(model, "nickname", unit_nickname, "O apelido")
            fields.update(
                nickname=unit_nickname,
                document=_party_document(db, kind, record_id, data.document, None, unique=False),
                **_old_system(model, data),
            )
    elif kind == "costCenters":
        parent_id = _cost_center_parent(db, record_id, data.parentId)
        same_parent = model.parent_id == parent_id if parent_id else model.parent_id.is_(None)
        if _taken(db, kind, record_id, same_name, same_parent):
            raise PayableConflict(
                "Esse superior já tem um centro de custo com esse nome"
                if parent_id
                else "Já existe centro de custo com esse nome"
            )
        fields["parent_id"] = parent_id
        fields.update(_old_system(model, data))
    elif _taken(db, kind, record_id, same_name):
        raise PayableConflict(f"Já existe {KINDS[kind].one} com esse nome")
    elif kind == "companies":
        short_name = _filled(data.nickname)
        if short_name:
            _check_length(model, "nickname", short_name, "O apelido")
        fields.update(
            nickname=short_name,
            personType=data.personType,
            document=_party_document(db, kind, record_id, data.document, data.personType),
            **_old_system(model, data),
        )
    return fields


def create(db: Session, kind: str, data: RecordIn, user: User) -> dict[str, Any]:
    record = add(db, kind, data, user)
    db.commit()
    return _out(record, False)


def add(db: Session, kind: str, data: RecordIn, user: User, origin: str = "") -> Any:
    """Valida e cria o cadastro na transação aberta, sem commit: a importação dos cadastros do
    sistema antigo grava o arquivo todo junto. `origin` vai no histórico, depois do nome."""
    fields = _fields(db, kind, None, data)
    if kind in GENERATED_CODE:
        # o código vem do sistema; o que a tela mandar não vale. Depois de criado, nunca muda.
        fields["code"] = _next_code(db, kind)
    elif kind == "costCenters":
        fields["code"] = _next_cost_center_code(db, fields["parent_id"])
    record = KINDS[kind].model(**fields)
    db.add(record)
    db.flush()
    if kind == "costCenters" and record.parent_id is None:
        # o contador dos sub-centros deste principal já nasce com ele: sem corrida na primeira vez
        db.add(RecordCounter(kind=f"costCenters:{record.id}", lastValue=0))
    _log(db, kind, record.id, user, f"Cadastrou {record.name}{origin}")
    return record


def update(db: Session, kind: str, record_id: int, data: RecordIn, user: User) -> dict[str, Any]:
    record = _get(db, kind, record_id)
    fields = _fields(db, kind, record_id, data)
    in_use = record_id in _used_ids(db, kind)
    if kind == "costCenters" and fields["parent_id"] != record.parent_id:
        raise PayableConflict("O superior não muda depois de cadastrado: o código depende dele")
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
    if (
        kind == "costCenters"
        and db.query(CostCenter.id).filter(CostCenter.parent_id == record_id).first()
    ):
        raise PayableConflict(
            "Esse centro de custo tem sub-centros: exclua os sub-centros antes, ou inative o centro"
        )
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


def _project_defaults(db: Session, data: ProjectIn) -> dict[str, Any]:
    """Unidade, cliente e centro de custo são obrigatórios (18/11, como na tela antiga), e cada um
    tem de existir e estar ativo. Recusa em pt-BR, como nos outros cadastros."""
    checks = (
        ("unitId", "unidade", BusinessUnit, "Unidade não encontrada ou inativa"),
        ("customerId", "cliente", Customer, "Cliente não encontrado ou inativo"),
        (
            "costCenterId",
            "centro de custo",
            CostCenter,
            "Centro de custo não encontrado ou inativo",
        ),
    )
    missing = [label for field, label, _, _ in checks if getattr(data, field) is None]
    if missing:
        raise PayableInvalid(f"Falta preencher: {', '.join(missing)}")
    for field, _, model, refusal in checks:
        record = db.get(model, getattr(data, field))
        if record is None or not record.active:
            raise PayableInvalid(refusal)
    if data.hasIncentive and not data.incentiveDays:
        raise PayableInvalid("Informe o prazo do incentivo em dias úteis (de 1 a 30)")
    return {
        "company_id": _unit_company(db, data.unitId),
        "notes": _filled(data.notes),
        "legacyCode": _filled(data.legacyCode),
        "customer_id": data.customerId,
        "unit_id": data.unitId,
        "cost_center_id": data.costCenterId,
        "projectType": data.projectType,
        "hasIncentive": data.hasIncentive,
        "incentiveDays": data.incentiveDays if data.hasIncentive else None,
    }


def _project_unique(
    db: Session, data: ProjectIn, project_id: int | None, company_id: int | None
) -> None:
    """O número do projeto não repete (com diferença de maiúscula), a não ser entre duas empresas
    diferentes, como no sistema antigo (24/11). O projeto sem empresa (o que chegou do Connect sem
    unidade) segura o número em todas."""
    # diferencia maiúscula, como no sistema antigo, que tem o "xxx" e o "XXX" (Bruno, 24/11)
    same_code = db.query(Project).filter(Project.code == data.code)
    if company_id:
        same_code = same_code.filter(
            or_(Project.company_id == company_id, Project.company_id.is_(None))
        )
    if project_id is not None:
        same_code = same_code.filter(Project.id != project_id)
    clash = same_code.first()
    if clash:
        where = " nessa empresa" if clash.company_id else ""
        raise PayableConflict(f"Já existe o projeto PRJ-{data.code}{where}")


def _unit_company(db: Session, unit_id: int | None) -> int | None:
    """A empresa da unidade escolhida (o número do projeto não repete dentro dela)."""
    unit = db.get(BusinessUnit, unit_id) if unit_id else None
    return int(unit.company_id) if unit else None


def add_project(db: Session, data: ProjectIn, user: User, origin: str = "") -> Project:
    """Valida e cria o projeto na transação aberta, sem commit (a importação do sistema antigo grava
    o arquivo todo junto). `origin` vai no histórico."""
    _project_unique(db, data, None, _unit_company(db, data.unitId))
    project = Project(code=data.code, title=data.title, **_project_defaults(db, data))
    db.add(project)
    db.flush()
    _log(db, "projects", project.id, user, f"Criou PRJ-{project.code} · {project.title}{origin}")
    return project


def create_project(db: Session, data: ProjectIn, user: User) -> Project:
    """Provisório (ADR 0021): o financeiro cadastra o projeto até o Connect mandar."""
    project = add_project(db, data, user)
    db.commit()
    return project


def _project_text(db: Session, project: Project) -> str:
    """Como o projeto fica no histórico: o que importa para o lançamento."""

    def name(model: Any, record_id: int | None) -> str:
        record = db.get(model, record_id) if record_id else None
        return getattr(record, "nickname", None) or getattr(record, "name", None) or "—"

    return (
        f"PRJ-{project.code} · {project.title}; cliente {name(Customer, project.customer_id)}; "
        f"unidade {name(BusinessUnit, project.unit_id)}; "
        f"centro {name(CostCenter, project.cost_center_id)}; {_incentive_text(project)}"
        f"{'' if project.active else '; inativo'}"
    )


def edit_project(db: Session, project_id: int, data: ProjectIn, user: User) -> Project:
    """Número, nome, padrões do lançamento e incentivo. As contas já lançadas não mudam: o padrão
    só vale para as próximas."""
    project = db.query(Project).filter_by(id=project_id).with_for_update().first()
    if project is None:
        raise RecordNotFound
    _project_unique(db, data, project_id, _unit_company(db, data.unitId))
    values = _project_defaults(db, data)
    before = _project_text(db, project)
    project.code = data.code
    project.title = data.title
    project.active = data.active
    for column, value in values.items():
        setattr(project, column, value)
    db.flush()
    after = _project_text(db, project)
    if after != before:
        _log(db, "projects", project_id, user, f"{before} → {after}")
    db.commit()
    return project


PROJECT_IN_USE = "Esse projeto tem lançamentos — inative em vez de excluir"


def delete_project(db: Session, project_id: int, user: User) -> None:
    """Só o projeto que nunca recebeu conta a pagar nem título a receber (18/11). Com lançamento, a
    saída é inativar: o histórico fica."""
    project = db.query(Project).filter_by(id=project_id).with_for_update().first()
    if project is None:
        raise RecordNotFound
    in_use = (
        db.query(PayableAllocation.id).filter(PayableAllocation.project_id == project_id).first()
        or db.query(Receivable.id).filter(Receivable.project_id == project_id).first()
    )
    if in_use:
        raise PayableConflict(PROJECT_IN_USE)
    _log(db, "projects", project_id, user, f"Excluiu PRJ-{project.code} · {project.title}")
    db.delete(project)
    db.commit()


def update_project(db: Session, project_id: int, data: ProjectIncentive, user: User) -> Project:
    """Só o tipo e o incentivo, sem tocar no resto do projeto."""
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

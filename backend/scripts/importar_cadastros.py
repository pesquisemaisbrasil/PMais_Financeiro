"""Popula os cadastros com o .csv que o sistema antigo (SGE4B) exporta, um tipo de cadastro por vez.

Tipos, nesta ordem: empresas, unidades (cada uma é de uma empresa), centros (de custo), clientes,
fornecedores, plano (de contas: os grupos e, embaixo deles, as contas), projetos (que precisam
da unidade, do centro de custo e do cliente já cadastrados) e contas (bancárias). O .csv das contas
não traz a empresa: ela vem de --empresa (todas) e --empresa-das-contas "IHEA=7,20,21,22".
Os outros entram conforme os arquivos do sistema antigo chegam.

Uso (o arquivo entra pela entrada padrão, é lido em memória e não fica guardado):
    python scripts/importar_cadastros.py --tipo empresas --email voce@... < Empresas.csv

Sem --gravar, só mostra a prévia. Cada linha passa pela mesma regra da tela de Cadastros, e o
cadastro fica igual ao do .csv: o código antigo vai à parte do gerado, e a coluna Inativo inativa.
O cadastro que já existe (o mesmo código antigo; sem ele, o mesmo nome, apelido ou CNPJ; a unidade,
na mesma empresa; o centro, no mesmo superior) fica como está, então rodar de novo só cria o que
falta. CPF nunca é guardado (Q23).
No banco vazio, os cadastros vêm antes do relatório (importar_relatorio_antigo.py), para as contas
usarem os cadastros de verdade.
"""

import argparse
import csv
import io
import re
import sys
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

sys.path.append(str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from core.document import clean_cnpj, valid_cnpj  # noqa: E402
from core.permissions import FINANCE_ROLES  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.reference import (  # noqa: E402
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    ExpenseCategoryGroup,
    Project,
)
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from schemas.records import ProjectIn, RecordIn  # noqa: E402
from services import records  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.payable import PayableConflict, PayableInvalid  # noqa: E402
from services.report_import import _norm, _without_cpf  # noqa: E402

ORIGIN = " (cadastro do sistema antigo)"
LISTED = 30  # acima disso, a prévia mostra só a contagem dos cadastros novos
INACTIVE = {"true", "sim", "s", "1"}


@dataclass
class Kind:
    """Um tipo de cadastro do sistema antigo: as colunas e como a linha vira o cadastro."""

    kind: str  # o tipo em services/records.py
    title: str
    required: tuple[str, ...]  # títulos das colunas, sem acento e em minúsculas; o 1º é o nome
    used: tuple[str, ...]  # as outras colunas lidas; as demais a prévia lista como não guardadas
    build: Callable[[Session, dict[str, str], list[str]], Any]  # RecordIn (ProjectIn no projeto)
    # a ordem de criar (o código gerado segue ela); sem isto, a ordem do arquivo
    order: Callable[[dict[str, str]], Any] | None = None
    # "já existe" só pelo nome (na mesma empresa ou no mesmo superior): a unidade repete o CNPJ da
    # empresa e o apelido dela é o código antigo; sem isto, também pelo apelido e pelo CNPJ
    by_name_only: bool = False
    # cadastro que pode ser de pessoa (cliente, fornecedor): a prévia mostra o código, nunca o nome
    personal: bool = False
    # "já existe" pelo código, que no plano de contas é o do sistema antigo (no mesmo grupo)
    by_code: bool = False
    # as linhas do arquivo que são deste tipo (o plano traz os grupos e as contas juntos)
    rows: Callable[[dict[str, str]], bool] | None = None
    # a coluna do código no sistema antigo (no projeto, "Projeto")
    code_column: str = "codigo"


@dataclass
class Line:
    number: int
    name: str
    inactive: bool = False
    data: Any = None  # RecordIn (ProjectIn no projeto)
    record: Any = None
    existing: Any = None
    notes: list[str] = field(default_factory=list)
    error: str | None = None


def _document(row: dict[str, str], person: str | None, notes: list[str]) -> str | None:
    """Só CNPJ válido. O CPF (pessoa física ou 11 dígitos) e o CNPJ inválido ficam de fora, com
    aviso, e o CNPJ zerado é "sem CNPJ"."""
    value = next((row[key] for key in DOCUMENT if row.get(key)), "")
    digits = clean_cnpj(value)
    if not digits.strip("0"):
        return None
    if person == "PF" or (digits.isdigit() and len(digits) == 11):
        notes.append("CPF não guardado")
        return None
    if not valid_cnpj(digits):
        notes.append("CNPJ inválido, não guardado")  # o cadastro entra; o CNPJ, não
        return None
    return value


def _person(row: dict[str, str]) -> Literal["PF", "PJ"] | None:
    person = (row.get("tipopessoa") or "").upper()
    return "PF" if person == "PF" else "PJ" if person == "PJ" else None


def _company(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    person = _person(row)
    return RecordIn(
        name=row["nome"],
        nickname=row.get("apelido") or None,
        personType=person,
        document=_document(row, person, notes),
        stateRegistration=row.get("ie") or None,
        legacyCode=row.get("codigo") or None,
    )


def _company_id(db: Session, text: str) -> int:
    """A empresa da linha, pelo nome, apelido ou código, como o relatório acha."""
    if not text:
        raise PayableInvalid("Sem empresa na linha")
    found = [
        company
        for company in db.query(Company)
        if _norm(text)
        in {
            _norm(company.name),
            _norm(company.nickname),
            _norm(company.code),
            _norm(company.legacyCode),
        }
    ]
    if not found:
        raise PayableInvalid(f"A empresa {text} não existe: importe as empresas antes")
    if len(found) > 1:
        raise PayableInvalid(f"A empresa {text} aparece mais de uma vez no cadastro")
    return int(found[0].id)


def _unit(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    return RecordIn(
        name=row["nome"],
        companyId=_company_id(db, row.get("empresa", "")),
        nickname=row.get("apelido") or None,
        document=_document(row, None, notes),
        stateRegistration=row.get("ie") or None,
        legacyCode=row.get("codigo") or None,
    )


def _center(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """Nível 1 é o centro principal; nível 2, o sub-centro, embaixo do principal da coluna Grupo."""
    parent_id = None
    group = row.get("grupo", "")
    if row.get("nivel", "1") != "1" or group:
        found = [
            center
            for center in db.query(CostCenter).filter(CostCenter.parent_id.is_(None))
            if _norm(center.name) == _norm(group)
        ]
        if not found:
            raise PayableInvalid(
                f"O centro principal {group} não existe no arquivo nem no cadastro"
            )
        parent_id = int(found[0].id)
    return RecordIn(name=row["nome"], parentId=parent_id, legacyCode=row.get("codigo") or None)


def _phone(value: str, label: str, notes: list[str]) -> str | None:
    """O telefone do sistema antigo vem em partes (+55|11|99999-0000): vira +55 11 99999-0000."""
    parts = [part.strip() for part in value.split("|")]
    if len(parts) != 3 or not parts[1] or not parts[2]:
        return None  # "+55||" ou só "+55": sem telefone
    country = re.sub(r"\D", "", parts[0]) or "55"
    phone = f"+{country} {parts[1]} {parts[2]}"
    if records.PHONE.fullmatch(phone):
        return phone
    notes.append(f"{label} fora do formato, não guardado")
    return None


def _email(value: str, label: str, notes: list[str]) -> str | None:
    if not value or records.EMAIL.fullmatch(value):
        return value or None
    notes.append(f"{label} inválido, não guardado")
    return None


def _customer(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """A ficha do cliente. O CPF nunca entra: nem como documento, nem nas observações."""
    person = _person(row)
    remarks, removed = _without_cpf(row.get("observacoes", ""))
    if removed:
        notes.append("CPF retirado das observações")
    zip_digits = re.sub(r"\D", "", row.get("cep", ""))
    if zip_digits and len(zip_digits) != 8:
        notes.append("CEP fora do formato, não guardado")
        zip_digits = ""
    return RecordIn(
        name=row["nome"],
        nickname=row.get("apelido") or row["nome"][:100],
        personType=person,
        document=_document(row, person, notes),
        stateRegistration=row.get("documento2") or None,
        phone=_phone(row.get("fone1", ""), "Fone 1", notes),
        phone2=_phone(row.get("fone2", ""), "Fone 2", notes),
        phone3=_phone(row.get("fone3", ""), "Fone 3", notes),
        email=_email(row.get("email1", ""), "E-mail 1", notes),
        emailAlt=_email(row.get("email2", ""), "E-mail 2", notes),
        notes=remarks.strip() or None,
        addressStreet=row.get("endereco") or None,
        addressNumber=row.get("numero") or None,
        addressComplement=row.get("complemento") or None,
        addressDistrict=row.get("bairro") or None,
        addressZip=zip_digits or None,
        addressCity=row.get("cidade") or None,
        addressState=(row.get("uf") or "").upper() or None,
        addressCountry=row.get("pais") or None,
        origin=row.get("origem") or None,
        legacyCode=row.get("codigo") or None,
    )


# Chave Pix e dados bancários de fornecedor não se guardam (Q23): a observação com eles fica fora.
PAYMENT_WORDS = re.compile(
    r"\bpix\b|\bbanco\b|\bbco\b|ag[eê]ncia|\bag\b|c/c|\bconta\b", re.IGNORECASE
)


def _supplier(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """A ficha do fornecedor, igual à do cliente; a observação com dados de pagamento não entra."""
    data = _customer(db, row, notes)
    if data.notes and PAYMENT_WORDS.search(data.notes):
        notes.append("observação com dados de pagamento não guardada (Q23)")
        data.notes = None
    return data


def _group(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """Grupo do plano de contas (nível 1): o código e o nome do sistema antigo."""
    return RecordIn(code=row.get("codigo") or None, name=row["nome"])


def _account(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """Conta do plano (nível 2), embaixo do grupo da coluna Grupo. O tipo vem do grupo: os grupos de
    receita (010 Receitas Líquida Operacional e 020 Outras Receitas E Entradas) são receita, e os
    outros, despesa (decisão do Bruno, 24/11)."""
    group = row.get("grupo", "")
    found = [g for g in db.query(ExpenseCategoryGroup) if _norm(g.name) == _norm(group)]
    if group and not found:
        raise PayableInvalid(f"O grupo {group} não existe no arquivo nem no cadastro")
    return RecordIn(
        code=row.get("codigo") or None,
        name=row["nome"],
        groupId=int(found[0].id) if found else None,
        kind="receita" if "receita" in _norm(group) else "despesa",
    )


def _one(records: list[Any], missing: str, repeated: str) -> Any:
    if not records:
        raise PayableInvalid(missing)
    if len(records) > 1:
        raise PayableInvalid(repeated)
    return records[0]


def _project(db: Session, row: dict[str, str], notes: list[str]) -> ProjectIn:
    """O projeto com a unidade, o centro de custo e o cliente obrigatórios (pedido do Bruno, 24/11):
    a empresa e a unidade pelo código antigo, o centro pelo código antigo e o cliente pelo nome."""
    company_id = _company_id(db, row.get("empresa", ""))
    unit_code, center_code = row.get("unidade", ""), row.get("ccusto", "")
    unit = _one(
        [
            u
            for u in db.query(BusinessUnit).filter_by(company_id=company_id)
            if u.legacyCode == unit_code
        ],
        f"A unidade {unit_code} não existe nessa empresa: importe as unidades antes",
        f"A unidade {unit_code} aparece mais de uma vez nessa empresa",
    )
    center = _one(
        [c for c in db.query(CostCenter) if c.legacyCode == center_code],
        f"O centro de custo {center_code} não existe: importe os centros de custo antes",
        f"O centro de custo {center_code} aparece mais de uma vez",
    )
    client = row.get("cliente", "")
    customer = _one(
        [c for c in db.query(Customer) if _norm(client) in {_norm(c.name), _norm(c.nickname)}],
        f"O cliente {client} não existe: importe os clientes antes",
        f"O cliente {client} aparece mais de uma vez no cadastro",
    )
    old = row.get("projeto", "")
    code = old.replace(" ", "_")  # decisão do Bruno, 24/11: CARPE DIEM vira CARPE_DIEM
    if code != old:
        notes.append(f"código com espaço: entrou como {code}")
    # o sistema antigo exporta a quebra de linha como o texto \r\n
    remarks = row.get("observacoes", "").replace("\\r\\n", "\n").replace("\\n", "\n").strip()
    return ProjectIn(
        code=code,
        title=row["nome"].strip(),
        hasIncentive=False,
        unitId=int(unit.id),
        costCenterId=int(center.id),
        customerId=int(customer.id),
        notes=remarks or None,
        legacyCode=old or None,
    )


ACCOUNT_KINDS = {"cc", "ci", "interna", "credito"}


def _bank_account(db: Session, row: dict[str, str], notes: list[str]) -> RecordIn:
    """A conta bancária como no sistema antigo: tipo (CC, CI, Interna, Crédito), saldo inicial com a
    data e se entra no fluxo de caixa. A empresa vem da linha de comando (o .csv não traz)."""
    kind = _norm(row.get("tipoconta"))
    if kind and kind not in ACCOUNT_KINDS:
        notes.append(f"tipo {row.get('tipoconta')} desconhecido: entrou como CC")
    balance = row.get("saldoinicial", "").replace(".", "").replace(",", ".") or "0"
    try:
        opening = Decimal(balance)
    except InvalidOperation:
        notes.append("saldo inicial fora do formato, não guardado")
        opening = Decimal("0")
    day: date | None = None
    if row.get("datasaldoinicial"):
        try:
            day = datetime.strptime(row["datasaldoinicial"], "%d/%m/%Y").date()
        except ValueError:
            notes.append("data do saldo fora do formato, não guardada")
    return RecordIn(
        name=row["nome"],
        companyId=_company_id(db, row.get("empresa", "")),
        bankName=row.get("banco") or None,
        agency=row.get("agencia") or None,
        accountNumber=row.get("conta") or None,
        accountType=kind if kind in ACCOUNT_KINDS else None,  # type: ignore[arg-type]
        openingBalance=opening,
        openingDate=day,
        impactsCashFlow=(row.get("impactafluxodecaixa") or "true").lower() in INACTIVE,
        legacyCode=row.get("codigo") or None,
    )


def _old_order(row: dict[str, str]) -> tuple[int, str]:
    """Na ordem do código antigo: num banco vazio, o código novo (0001...) segue o mesmo."""
    code = row.get("codigo", "")
    return (int(code), "") if code.isdigit() else (sys.maxsize, code)


DOCUMENT = ("cnpj", "cpf/cnpj", "cnpj/cpf", "documento1")
PLAN_COLUMNS = ("codigo", "nivel", "grupo", "ordem", "inativo")
# Cliente e fornecedor: o sistema antigo exporta as mesmas colunas
PARTY_COLUMNS = (
    "codigo",
    "apelido",
    "tipopessoa",
    "documento2",
    "fone1",
    "fone2",
    "fone3",
    "email1",
    "email2",
    "endereco",
    "numero",
    "complemento",
    "bairro",
    "cep",
    "cidade",
    "uf",
    "pais",
    "origem",
    "observacoes",
    "inativo",
    *DOCUMENT,
)
KINDS = {
    "empresas": Kind(
        "companies",
        "Empresas",
        ("nome",),
        ("codigo", "apelido", "tipopessoa", "ie", "inativo", *DOCUMENT),
        _company,
        order=_old_order,
    ),
    # o código antigo é por empresa (001 em cada uma): o gerado segue a ordem do arquivo
    "unidades": Kind(
        "units",
        "Unidades",
        ("nome", "empresa"),
        ("codigo", "apelido", "ie", "inativo", *DOCUMENT),
        _unit,
        by_name_only=True,
    ),
    # os principais antes dos sub-centros, cada nível na ordem do sistema antigo
    "centros": Kind(
        "costCenters",
        "Centros de custo",
        ("nome",),
        ("codigo", "nivel", "grupo", "ordem", "inativo"),
        _center,
        order=lambda row: (row.get("nivel", ""), row.get("ordem") or row.get("codigo", "")),
        by_name_only=True,
    ),
    "clientes": Kind(
        "customers",
        "Clientes",
        ("nome",),
        PARTY_COLUMNS,
        _customer,
        personal=True,
    ),
    "fornecedores": Kind(
        "suppliers",
        "Fornecedores",
        ("nome",),
        PARTY_COLUMNS,
        _supplier,
        personal=True,
    ),
    # O plano de contas vem num arquivo só: os grupos (nível 1) antes, depois as contas (nível 2)
    "plano-grupos": Kind(
        "categoryGroups",
        "Grupos do plano de contas",
        ("nome",),
        PLAN_COLUMNS,
        _group,
        by_code=True,
        rows=lambda row: row.get("nivel") == "1",
    ),
    "plano-contas": Kind(
        "categories",
        "Contas do plano de contas",
        ("nome",),
        PLAN_COLUMNS,
        _account,
        by_code=True,
        rows=lambda row: row.get("nivel") != "1",
    ),
    "projetos": Kind(
        "projects",
        "Projetos",
        ("nome", "projeto", "unidade", "ccusto", "cliente"),
        ("empresa", "observacoes", "inativo"),
        _project,
        code_column="projeto",
    ),
    "contas": Kind(
        "bankAccounts",
        "Contas bancárias",
        ("nome",),
        (
            "codigo",
            "banco",
            "agencia",
            "conta",
            "tipoconta",
            "encerrada",
            "datasaldoinicial",
            "saldoinicial",
            "impactafluxodecaixa",
            "empresa",
        ),
        _bank_account,
    ),
}
# O tipo da linha de comando e os tipos de cadastro que ele importa, na ordem
TIPOS = {
    **{
        tipo: (tipo,)
        for tipo in (
            "empresas",
            "unidades",
            "centros",
            "clientes",
            "fornecedores",
            "projetos",
            "contas",
        )
    },
    "plano": ("plano-grupos", "plano-contas"),
}


def _decode(content: bytes) -> str:
    if content[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return content.decode("utf-16")
    if content[1:2] == b"\x00":
        return content.decode("utf-16-le")  # como o sistema antigo exporta: UTF-16 sem BOM
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1252")


def _read(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = _decode(content)
    first = text.split("\n", 1)[0]
    reader = csv.reader(io.StringIO(text), delimiter=";" if ";" in first else ",")
    titles = next(reader, [])
    keys = [_norm(title) for title in titles]
    rows = [
        dict(zip(keys, (cell.strip() for cell in row), strict=False))
        for row in reader
        if any(cell.strip() for cell in row)
    ]
    return titles, rows


def _existing(
    kind: Kind, data: Any, pool: list[Any], repeated: set[str], company_id: int | None
) -> Any:
    """O cadastro que já existe, entre os do banco e os criados agora (`pool`). Pelo código antigo,
    exato ("Abc" e "ABC" são dois); se o código se repete no arquivo, o nome também tem de bater."""

    def names(name: Any, nickname: Any) -> set[str]:
        return {_norm(name)} if kind.by_name_only else {_norm(name), _norm(nickname)} - {""}

    def name_of(item: Any) -> Any:
        return getattr(item, "name", None) or getattr(item, "title", None)

    wanted = names(name_of(data), getattr(data, "nickname", None))
    raw_document = getattr(data, "document", None)
    document = clean_cnpj(raw_document) if raw_document and not kind.by_name_only else None
    for record in pool:
        if company_id is not None and record.company_id != company_id:
            continue  # unidade e projeto: o mesmo nome em outra empresa é outro cadastro
        if isinstance(record, CostCenter) and record.parent_id != data.parentId:
            continue  # centro: o mesmo nome em outro superior é outro centro
        if isinstance(record, ExpenseCategory) and record.group_id != data.groupId:
            continue  # conta: o mesmo código em outro grupo é outra conta
        if kind.by_code:
            if (record.code or "") == (data.code or ""):
                return record
            continue
        if data.legacyCode:
            # o código antigo é único (na empresa ou no superior): cliente pode repetir o nome
            # exato: no sistema antigo, "Abc" e "ABC" são dois cadastros
            same_code = (getattr(record, "legacyCode", None) or "") == data.legacyCode
            if same_code and (
                data.legacyCode not in repeated or _norm(name_of(record)) == _norm(name_of(data))
            ):
                return record
            continue
        same_name = wanted & names(name_of(record), getattr(record, "nickname", None))
        if same_name or (document and getattr(record, "document", None) == document):
            return record
    return None


def _summary(db: Session, kind: Kind, titles: list[str], lines: list[Line], write: bool) -> str:
    companies = {c.id: c.label for c in db.query(Company)}

    def _shown(record: Any) -> str:
        nickname = f" ({record.nickname})" if getattr(record, "nickname", None) else ""
        company = companies.get(getattr(record, "company_id", None))
        document = getattr(record, "document", None)
        # o centro mostra o caminho; o projeto não tem nome, tem título
        label = getattr(record, "path", None) or getattr(record, "name", None) or record.title
        return (
            f"{getattr(record, 'code', None) or '—'} {label}{nickname}"
            + (f" · antigo {legacy}" if (legacy := getattr(record, "legacyCode", None)) else "")
            + (f" · {company}" if company else "")
            + (f" · CNPJ {document}" if document else "")
        )

    new = [line for line in lines if line.record is not None]
    old = [line for line in lines if line.existing is not None]
    wrong = [line for line in lines if line.error]
    ignored = [title for title in titles if _norm(title) not in {*kind.required, *kind.used}]
    out = [f"{kind.title}: {len(lines)} linhas no arquivo"]
    if ignored:
        out.append(f"Colunas que o Financeiro não guarda: {', '.join(ignored)}")
    out.append(f"{'Cadastrados' if write else 'Serão cadastrados'}: {len(new)}")
    if len(new) <= LISTED and not kind.personal:
        out += [
            f"  {_shown(line.record)}" + (f" · {'; '.join(line.notes)}" if line.notes else "")
            for line in new
        ]
    noted = [note for line in new for note in line.notes]
    if (len(new) > LISTED or kind.personal) and noted:
        out.append(f"  Avisos: {', '.join(f'{n}x {t}' for t, n in Counter(noted).items())}")
    out.append(f"Já existem (ficam como estão): {len(old)}")
    if old and len(old) <= LISTED and not kind.personal:
        out += [f"  linha {line.number} ({line.name}) = {_shown(line.existing)}" for line in old]
    out.append(f"Ficam de fora: {len(wrong)}")
    out += [f"  linha {line.number} ({line.name}): {line.error}" for line in wrong]
    out.append("Gravado." if write else "Nada foi gravado. Para gravar, rode de novo com --gravar.")
    return "\n".join(out)


SAME_NAME_IN_PARENT = "Esse superior já tem um centro de custo com esse nome"


def _add(db: Session, kind: Kind, line: Line, user: User) -> Any:
    """Cria o cadastro. O sub-centro com o nome repetido no mesmo superior (o "Health Full Service"
    005.012 do sistema antigo) entra com o código antigo no nome (decisão do Bruno, 24/11)."""
    try:
        return records.add(db, kind.kind, line.data, user, ORIGIN)
    except PayableConflict as exc:
        if str(exc) != SAME_NAME_IN_PARENT or not line.data.legacyCode:
            raise
        line.data.name = f"{line.data.name} ({line.data.legacyCode})"[:100]
        line.notes.append(f"nome repetido no superior: entrou como {line.data.name}")
        return records.add(db, kind.kind, line.data, user, ORIGIN)


def _pass(db: Session, kind: Kind, user: User, rows: list[dict[str, str]]) -> list[Line]:
    """Uma passada do arquivo para um tipo de cadastro, sem commit."""
    pool = list(db.query(Project if kind.kind == "projects" else records.KINDS[kind.kind].model))
    codes = Counter(row.get(kind.code_column, "") for row in rows)
    repeated = {code for code, n in codes.items() if n > 1}
    numbered = [
        (number, row)
        for number, row in enumerate(rows, start=2)
        if kind.rows is None or kind.rows(row)
    ]
    order = kind.order
    if order:
        numbered.sort(key=lambda pair: order(pair[1]))
    lines: list[Line] = []
    for number, row in numbered:
        line = Line(
            number=number,
            # de pessoa: o código antigo, para o nome não sair na tela nem no terminal
            name=(row.get("codigo") or "sem código") if kind.personal else row.get("nome", ""),
            inactive=(row.get("inativo") or row.get("encerrada") or "").lower() in INACTIVE,
        )
        lines.append(line)
        try:
            line.data = kind.build(db, row, line.notes)
            company_id = getattr(line.data, "companyId", None)
            if kind.kind == "projects":
                company_id = db.get(BusinessUnit, line.data.unitId).company_id
            line.existing = _existing(kind, line.data, pool, repeated, company_id)
            if line.existing is None:
                if kind.kind == "projects":
                    line.record = records.add_project(db, line.data, user, ORIGIN)
                else:
                    line.record = _add(db, kind, line, user)
                pool.append(line.record)
        except (PayableInvalid, PayableConflict) as exc:
            line.error = str(exc)
        except ValidationError as exc:
            where = ", ".join(str(error["loc"][0]) for error in exc.errors())
            line.error = f"Campo fora do tamanho ou do formato: {where}"
    # Inativo no fim: o sub-centro precisa do principal ativo para ser cadastrado
    for line in lines:
        if line.record is not None and line.inactive:
            line.record.active = False
            line.notes.append("inativo")
            records._log(db, kind.kind, line.record.id, user, f"Inativou{ORIGIN}")
    lines.sort(key=lambda line: line.number)
    return lines


def importar(
    db: Session,
    tipo: str,
    email: str,
    content: bytes,
    write: bool,
    company: str = "",
    companies: dict[str, str] | None = None,
) -> str:
    """Prévia (sem gravar) ou importação, num commit só com todas as linhas boas. `company` e
    `companies` (código antigo → empresa) dão a empresa à linha que não traz (as contas)."""
    kinds = [KINDS[name] for name in TIPOS[tipo]]
    user = (
        db.query(User).filter(User.email == normalize_email(email), User.status == "active").first()
    )
    if user is None or user.role not in FINANCE_ROLES:
        raise PayableInvalid(f"Não achei uma conta ativa do Financeiro com o e-mail {email}")
    titles, rows = _read(content)
    if company or companies:
        for row in rows:
            if not row.get("empresa"):
                row["empresa"] = (companies or {}).get(row.get("codigo", ""), company)
    missing = [name for name in kinds[0].required if name not in {_norm(t) for t in titles}]
    if missing:
        raise PayableInvalid(f"O arquivo não tem a coluna {', '.join(missing)}")
    done: list[tuple[Kind, list[Line]]] = []
    try:
        for kind in kinds:
            done.append((kind, _pass(db, kind, user, rows)))
        if write:
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    return "\n\n".join(_summary(db, kind, titles, lines, write) for kind, lines in done)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tipo", required=True, choices=sorted(TIPOS))
    parser.add_argument("--email", required=True, help="quem importa (vai para o histórico)")
    parser.add_argument("--gravar", action="store_true", help="sem isto, só a prévia")
    parser.add_argument("--empresa", default="", help="a empresa da linha que não traz (contas)")
    parser.add_argument(
        "--empresa-das-contas",
        action="append",
        default=[],
        help='outra empresa para alguns códigos: "IHEA=7,20,21,22" (pode repetir)',
    )
    args = parser.parse_args()
    companies = {
        code.strip(): name.strip()
        for item in args.empresa_das_contas
        for name, codes in [item.split("=", 1)]
        for code in codes.split(",")
    }
    if sys.stdin.isatty():
        sys.exit("Mande o arquivo pela entrada: ... --tipo empresas < Empresas.csv")
    content = sys.stdin.buffer.read()
    db = SessionLocal()
    try:
        print(importar(db, args.tipo, args.email, content, args.gravar, args.empresa, companies))
    except (PayableInvalid, PayableConflict) as exc:
        sys.exit(str(exc))
    finally:
        db.close()


if __name__ == "__main__":
    main()

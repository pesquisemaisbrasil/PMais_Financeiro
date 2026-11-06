"""Importar planilha de incentivos ou de folha de campo para o Contas a pagar.

A planilha é lida em memória e descartada. Só ficam nome e valor de cada pessoa, e o resumo
criptográfico do arquivo, para avisar quando ela for importada de novo. Chave Pix e CPF nunca são
lidos: só as colunas abaixo saem do arquivo (pergunta Q22).
"""

import csv
import hashlib
import io
import re
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from itertools import islice
from typing import Any

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from core.business_days import add_business_days
from core.text import format_brl, format_date_br
from models.payable import Payable, PayableAllocation, PayableItem
from models.reference import (
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.user import User
from schemas.payable import ImportFields
from services import payable as payable_service
from services.payable import PayableConflict, PayableInvalid, _active, today

MAX_BYTES = 5 * 1024 * 1024
MAX_UNZIPPED_BYTES = 50 * 1024 * 1024
MAX_ROWS = 5000
# Com 5.000 linhas, este teto mantém o total dentro do que a coluna de valor aceita.
MAX_LINE_AMOUNT = Decimal("1000000")
# shortcut: 11% fixos, sem o teto do INSS; trocar quando a contabilidade responder a N3.
INSS_RATE = Decimal("0.11")
CENTS = Decimal("0.01")


@dataclass(frozen=True)
class Dim:
    """Um campo de classificação do lançamento. Cada um pode vir de uma coluna da planilha."""

    key: str
    model: type[Any]
    title: str  # nas mensagens: "Projeto 9999 não existe"
    label: str  # nome da coluna
    one: str  # "A planilha não tem a coluna ... Escolha um só projeto"


# A ordem importa: a unidade só se resolve depois da empresa.
DIMS = (
    Dim("project", Project, "Projeto", "projeto", "um só projeto"),
    Dim("company", Company, "Empresa", "empresa", "uma só empresa"),
    Dim("unit", BusinessUnit, "Unidade", "unidade", "uma só unidade"),
    Dim("center", CostCenter, "Centro de custo", "centro de custo", "um só centro de custo"),
    Dim("category", ExpenseCategory, "Categoria", "categoria", "uma só categoria"),
    Dim(
        "method",
        PaymentMethod,
        "Forma de pagamento",
        "forma de pagamento",
        "uma só forma de pagamento",
    ),
)
# As colunas de classificação são opcionais: com elas, uma planilha serve a vários projetos,
# empresas, unidades, centros de custo, categorias e formas de pagamento.
DIM_COLUMNS = {
    "projeto": "project",
    "codigo do projeto": "project",
    "codigo projeto": "project",
    "cod. projeto": "project",
    "cod projeto": "project",
    "empresa": "company",
    "unidade": "unit",
    "centro de custo": "center",
    "categoria": "category",
    "plano de contas": "category",
    "forma de pagamento": "method",
    "forma": "method",
}
INCENTIVE_COLUMNS = {
    "nome": "name",
    "valor": "amount",
    "data da pesquisa": "surveyDate",
    "data da resposta": "surveyDate",
    "data de pagamento": "payDate",
    **DIM_COLUMNS,
}
PAYROLL_COLUMNS = {
    "nome": "name",
    "documento": "document",
    "valor": "amount",
    "numero da nf": "invoiceNumber",
    "emissao": "invoiceDate",
    **DIM_COLUMNS,
}
PAYROLL_DOCUMENTS = {"nf": "NF", "rpa": "RPA", "incentivo": "Incentivo", "sem nf": "Sem NF"}

MONEY_FORMATS = (
    re.compile(r"\d{1,3}(\.\d{3})+(,\d{1,2})?"),
    re.compile(r"\d+(,\d{1,2})?"),
)
DECIMAL_DOT = re.compile(r"\d+\.\d{1,2}")


@dataclass
class Line:
    line: int
    name: str
    amount: Decimal | None = None
    documentType: str = "Incentivo"
    gross: Decimal | None = None
    invoiceNumber: str | None = None
    invoiceDate: date | None = None
    surveyDate: date | None = None
    givenPayDate: date | None = None
    payDate: date | None = None
    typed: dict[str, str] = field(default_factory=dict)  # o que a planilha escreveu, por campo
    refs: dict[str, Any] = field(default_factory=dict)  # o cadastro que cada campo achou
    skipped: bool = False  # fora do que a pessoa marcou: não é erro, só não entra
    errors: list[str] = field(default_factory=list)

    @property
    def project(self) -> Project | None:
        return self.refs.get("project")


def _folded(text: str) -> str:
    plain = unicodedata.normalize("NFD", text)
    return "".join(c for c in plain if not unicodedata.combining(c)).strip().casefold()


def _unreadable() -> PayableInvalid:
    return PayableInvalid("Não foi possível ler a planilha. Confira se o arquivo está inteiro")


def _xlsx_rows(content: bytes) -> list[tuple[Any, ...]]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            # Arquivo pequeno que vira gigabytes ao abrir derrubaria o servidor.
            if sum(entry.file_size for entry in archive.infolist()) > MAX_UNZIPPED_BYTES:
                raise _unreadable()
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        try:
            return list(islice(workbook.worksheets[0].iter_rows(values_only=True), MAX_ROWS + 2))
        finally:
            workbook.close()
    except PayableInvalid:
        raise
    except Exception as exc:  # o arquivo vem de fora: qualquer falha ao abrir é arquivo ruim
        raise _unreadable() from exc


def _csv_rows(content: bytes) -> list[tuple[Any, ...]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252", errors="replace")  # como o Excel salva CSV no Brasil
    first = text.split("\n", 1)[0]
    delimiter = ";" if ";" in first else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        return [tuple(row) for row in islice(reader, MAX_ROWS + 2)]
    except csv.Error as exc:
        raise _unreadable() from exc


def _rows(filename: str, content: bytes) -> list[tuple[Any, ...]]:
    name = filename.lower()
    if name.endswith(".xlsx"):
        rows = _xlsx_rows(content)
    elif name.endswith(".csv"):
        rows = _csv_rows(content)
    else:
        raise PayableInvalid("Envie a planilha em .xlsx ou .csv")
    if len(rows) > MAX_ROWS + 1:
        raise PayableInvalid(f"A planilha passa de {MAX_ROWS} linhas. Divida em arquivos menores")
    return rows


def _money(value: Any) -> tuple[Decimal | None, str | None]:
    if value is None or value == "":
        return None, "Valor inválido"
    if isinstance(value, bool):
        return None, "Valor inválido"
    if isinstance(value, int | float | Decimal):
        # A célula numérica chega como float: pelo texto dela, o valor continua exato.
        text = format(Decimal(str(value)).normalize(), "f")
        amount = Decimal(text)
    else:
        text = str(value).strip()
        if re.search(r"[^\d.,\s]", text):
            return None, "Use só números no valor"
        if any(pattern.fullmatch(text) for pattern in MONEY_FORMATS):
            amount = Decimal(text.replace(".", "").replace(",", "."))
        elif DECIMAL_DOT.fullmatch(text):
            amount = Decimal(text)
        else:
            return None, "Valor inválido"
    try:
        exact = amount.quantize(CENTS) == amount
    except InvalidOperation:
        return None, "Valor inválido"
    if not exact or amount <= 0 or amount > MAX_LINE_AMOUNT:
        return None, "Valor inválido"
    return amount.quantize(CENTS), None


def _date(value: Any) -> tuple[date | None, bool]:
    """A data da célula, e se ela é válida. Célula vazia é válida e não tem data."""
    if value is None or str(value).strip() == "":
        return None, True
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        for pattern in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(str(value).strip(), pattern).date()
                break
            except ValueError:
                continue
        else:
            return None, False
    return (parsed, True) if 2000 <= parsed.year <= 2100 else (None, False)


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _table(
    rows: list[tuple[Any, ...]], columns: dict[str, str]
) -> list[tuple[int, dict[str, Any]]]:
    """Só as colunas conhecidas saem daqui: CPF, chave Pix e o resto da planilha ficam para trás."""
    if not rows:
        raise PayableInvalid("A planilha está vazia")
    positions = {}
    for index, title in enumerate(rows[0]):
        key = columns.get(_folded(_text(title)))
        if key and key not in positions:
            positions[key] = index
    table = []
    for number, row in enumerate(rows[1:], start=2):
        if all(_text(cell) == "" for cell in row):
            continue
        table.append(
            (
                number,
                {key: row[pos] if pos < len(row) else None for key, pos in positions.items()},
            )
        )
    if not all(key in positions for key in ("name", "amount")):
        missing = "nome" if "name" not in positions else "valor"
        raise PayableInvalid(f'A planilha precisa da coluna "{missing}"')
    return table


def _project_code(value: Any) -> str | None:
    """`1790`, `1790.0` (célula numérica), `PRJ-1790` e `prj 1790` são o mesmo código."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    code = re.sub(r"^prj[\s_-]*", "", _text(value), flags=re.IGNORECASE)
    return code or None


def _dim_text(dim: Dim, value: Any) -> str | None:
    return _project_code(value) if dim.key == "project" else _text(value) or None


def _base_line(number: int, cells: dict[str, Any]) -> Line:
    typed = {}
    for dim in DIMS:
        text = _dim_text(dim, cells.get(dim.key))
        if text:
            typed[dim.key] = text
    line = Line(line=number, name=_text(cells.get("name")), typed=typed)
    if not line.name:
        line.errors.append("Nome vazio")
    elif len(line.name) > 200:
        line.errors.append("Nome muito longo")
    line.amount, error = _money(cells.get("amount"))
    if error:
        line.errors.append(error)
    return line


def _incentive_lines(rows: list[tuple[Any, ...]]) -> list[Line]:
    titles = {_folded(_text(title)) for title in rows[0]} if rows else set()
    table = _table(rows, INCENTIVE_COLUMNS)
    if not titles & {"data da pesquisa", "data da resposta", "data de pagamento"}:
        raise PayableInvalid('A planilha precisa da coluna "data da pesquisa"')
    lines = []
    for number, cells in table:
        line = _base_line(number, cells)
        line.surveyDate, survey_ok = _date(cells.get("surveyDate"))
        line.givenPayDate, pay_ok = _date(cells.get("payDate"))
        if not pay_ok:
            line.errors.append("Data de pagamento inválida")
        elif not survey_ok:
            line.errors.append("Data da pesquisa inválida")
        elif not line.givenPayDate and not line.surveyDate:
            line.errors.append("Sem data de pagamento e sem data da pesquisa")
        elif line.givenPayDate and line.surveyDate and line.givenPayDate < line.surveyDate:
            line.errors.append("Pagamento antes da data da pesquisa")
        lines.append(line)
    return lines


def _payroll_lines(rows: list[tuple[Any, ...]]) -> list[Line]:
    lines = []
    for number, cells in _table(rows, PAYROLL_COLUMNS):
        line = _base_line(number, cells)
        document = PAYROLL_DOCUMENTS.get(_folded(_text(cells.get("document"))))
        if document is None:
            line.errors.append("Documento inválido: use NF, RPA, Incentivo ou Sem NF")
        else:
            line.documentType = document
        if document == "RPA" and line.amount is not None:
            line.gross = line.amount
            discount = (line.gross * INSS_RATE).quantize(CENTS, rounding=ROUND_HALF_UP)
            line.amount = line.gross - discount
        if document == "NF":
            line.invoiceNumber = _text(cells.get("invoiceNumber"))[:50] or None
            line.invoiceDate, invoice_ok = _date(cells.get("invoiceDate"))
            if not invoice_ok:
                line.errors.append("Data de emissão inválida")
        lines.append(line)
    return lines


def _source(group: list[Line]) -> str:
    given = sum(1 for line in group if line.givenPayDate)
    if given == len(group):
        return "informada na planilha"
    return "informada em parte, o resto calculado" if given else "calculada pelo prazo"


def _deadline(project: Project) -> int | None:
    return project.incentiveDays if project.hasIncentive else None


def _groups(lines: list[Line], days: int | None) -> dict[date, list[Line]]:
    """Um lançamento por data de pagamento: a da planilha, ou a da pesquisa mais o prazo."""
    groups: dict[date, list[Line]] = {}
    for line in lines:
        line.payDate = line.givenPayDate
        if line.payDate is None and line.surveyDate is not None and days:
            line.payDate = add_business_days(line.surveyDate, days)
        if line.payDate is not None:
            groups.setdefault(line.payDate, []).append(line)
    return dict(sorted(groups.items()))


def _project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise PayableInvalid("Projeto não encontrado")
    if project.status == "encerrado":
        raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
    return project


def _read(kind: str, filename: str, content: bytes) -> tuple[list[Line], set[str]]:
    """As linhas da planilha e quais campos de classificação ela traz em coluna."""
    rows = _rows(filename, content)
    titles = {_folded(_text(title)) for title in rows[0]} if rows else set()
    lines = _incentive_lines(rows) if kind == "incentivos" else _payroll_lines(rows)
    return lines, {DIM_COLUMNS[title] for title in titles if title in DIM_COLUMNS}


def _selected(db: Session, fields: ImportFields) -> dict[str, list[Any]]:
    """Os cadastros que a pessoa marcou na tela, já conferidos. Vazio = todos os da planilha."""
    ids = {
        "project": fields.projectIds,
        "company": fields.companyIds,
        "unit": fields.unitIds,
        "center": fields.costCenterIds,
        "category": fields.categoryIds,
        "method": fields.paymentMethodIds,
    }
    chosen: dict[str, list[Any]] = {}
    for dim in DIMS:
        records = []
        for record_id in dict.fromkeys(ids[dim.key]):
            if dim.key == "project":
                records.append(_project(db, record_id))
                continue
            record = _active(db, dim.model, record_id, dim.title)
            if dim.key == "category" and record.kind != "despesa":
                raise PayableInvalid("Contas a pagar usam conta de despesa")
            records.append(record)
        chosen[dim.key] = records
    return chosen


def _record_name(dim: Dim, record: Any) -> str:
    return record.code if dim.key == "project" else record.name


def _lookup(db: Session, dim: Dim) -> dict[str, list[Any]]:
    """Os cadastros por texto, sem acento nem caixa. Categoria também casa pelo código."""
    found: dict[str, list[Any]] = {}
    for record in db.query(dim.model).all():
        names = [_record_name(dim, record)]
        if dim.key == "category":
            names += [record.code, f"{record.code} {record.name}"]
        for name in dict.fromkeys(names):
            found.setdefault(_folded(name), []).append(record)
    return found


def _problem(dim: Dim, record: Any) -> str | None:
    if dim.key == "project":
        return f"Projeto PRJ-{record.code} está fechado" if record.status == "encerrado" else None
    if not record.active:
        return f"{dim.title} {record.name}: cadastro inativo"
    if dim.key == "category" and record.kind != "despesa":
        return f"Categoria {record.name}: contas a pagar usam conta de despesa"
    return None


def _resolve_one(
    line: Line, dim: Dim, chosen: list[Any], lookup: dict[str, list[Any]] | None
) -> None:
    text = line.typed.get(dim.key)
    if text and lookup is not None:
        found = lookup.get(_folded(text), [])
        company = line.refs.get("company")
        if dim.key == "unit" and company is not None:
            found = [unit for unit in found if unit.company_id == company.id]
        if not found:
            line.errors.append(f"{dim.title} {text} não existe")
            return
        if len(found) > 1:
            line.errors.append(f"{dim.title} {text} aparece mais de uma vez no cadastro")
            return
        record = found[0]
    elif len(chosen) == 1:
        record = chosen[0]
    else:
        line.errors.append(f"Sem {dim.label} na linha")
        return
    if chosen and record.id not in {item.id for item in chosen}:
        line.skipped = True
        return
    problem = _problem(dim, record)
    if problem:
        line.errors.append(problem)
        return
    line.refs[dim.key] = record


def _resolve(
    db: Session, lines: list[Line], selected: dict[str, list[Any]], columns: set[str]
) -> None:
    """Diz o projeto, a empresa, a unidade, o centro de custo, a categoria e a forma de cada linha.

    Campo sem coluna na planilha vale para ela toda e exige um só marcado na tela. Com a coluna,
    cada linha traz o seu, e célula vazia vale o marcado, se houver um só. Com cadastros marcados,
    linha de outro cadastro fica de fora sem ser erro.
    """
    for dim in DIMS:
        if dim.key not in columns and len(selected[dim.key]) != 1:
            raise PayableInvalid(
                f'A planilha não tem a coluna "{dim.label}". '
                f"Escolha {dim.one} na tela ou inclua a coluna na planilha"
            )
    if not {"company", "unit"} & columns:
        if selected["unit"][0].company_id != selected["company"][0].id:
            raise PayableInvalid("A unidade não é dessa empresa")
    lookups = {dim.key: _lookup(db, dim) for dim in DIMS if dim.key in columns}
    for line in lines:
        for dim in DIMS:
            # Empresa que não se resolveu já deixou o erro (ou a linha de fora): a unidade, que
            # depende dela, não ganha um segundo erro.
            if dim.key == "unit" and "company" in columns and "company" not in line.refs:
                continue
            _resolve_one(line, dim, selected[dim.key], lookups.get(dim.key))
        company, unit = line.refs.get("company"), line.refs.get("unit")
        if company is not None and unit is not None and unit.company_id != company.id:
            line.errors.append(f"A unidade {unit.name} não é da empresa {company.name}")


def _enters(line: Line) -> bool:
    return not line.errors and not line.skipped and all(dim.key in line.refs for dim in DIMS)


def _classification(refs: dict[str, Any]) -> str:
    category = refs["category"]
    return " · ".join(
        [
            refs["company"].name,
            refs["unit"].name,
            refs["center"].name,
            f"{category.code} {category.name}",
            refs["method"].name,
        ]
    )


def _buckets(lines: list[Line]) -> list[tuple[dict[str, Any], list[Line]]]:
    """As linhas que entram, uma lista por combinação de campos: cada uma vira lançamento."""
    grouped: dict[tuple[int, ...], tuple[dict[str, Any], list[Line]]] = {}
    for line in lines:
        key = tuple(line.refs[dim.key].id for dim in DIMS)
        grouped.setdefault(key, (line.refs, []))[1].append(line)
    return sorted(
        grouped.values(),
        key=lambda pair: (pair[0]["project"].code, _classification(pair[0])),
    )


def _by_project(lines: list[Line]) -> list[tuple[Project, list[Line]]]:
    """As linhas que entram, por projeto, na ordem do código."""
    grouped: dict[int, tuple[Project, list[Line]]] = {}
    for line in lines:
        if line.project is not None:
            grouped.setdefault(line.project.id, (line.project, []))[1].append(line)
    return sorted(grouped.values(), key=lambda pair: pair[0].code)


def _missing_deadline(project: Project, lines: list[Line]) -> bool:
    return not _deadline(project) and any(line.givenPayDate is None for line in lines)


def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _line_classification(line: Line, columns: set[str]) -> str | None:
    """O que a planilha disse de empresa, unidade, centro, categoria e forma nesta linha."""
    names = []
    for dim in DIMS:
        record = line.refs.get(dim.key)
        if dim.key != "project" and dim.key in columns and record is not None:
            names.append(record.code if dim.key == "category" else record.name)
    return " · ".join(names) or None


def preview(db: Session, fields: ImportFields, filename: str, content: bytes) -> dict[str, Any]:
    """Confere a planilha sem gravar nada."""
    kind = fields.kind
    selected = _selected(db, fields)
    lines, columns = _read(kind, filename, content)
    _resolve(db, lines, selected, columns)
    good = [line for line in lines if _enters(line)]
    incentives = kind == "incentivos"
    projects = []
    for project, project_lines in _by_project(good):
        projects.append(
            {
                "id": project.id,
                "code": project.code,
                "title": project.title,
                "projectType": project.projectType,
                "deadlineDays": _deadline(project),
                "missingDeadline": incentives and _missing_deadline(project, project_lines),
                "count": len(project_lines),
                "total": sum((x.amount for x in project_lines if x.amount), Decimal("0")),
            }
        )
    groups = []
    for refs, bucket_lines in _buckets(good) if incentives else []:
        project = refs["project"]
        for pay_date, group in _groups(bucket_lines, _deadline(project)).items():
            groups.append(
                {
                    "projectId": project.id,
                    "projectCode": project.code,
                    "projectTitle": project.title,
                    "classification": _classification(refs),
                    "payDate": pay_date,
                    "surveyDates": sorted({g.surveyDate for g in group if g.surveyDate}),
                    "count": len(group),
                    "total": sum((g.amount for g in group if g.amount), Decimal("0")),
                    "source": _source(group),
                }
            )
    groups.sort(key=lambda g: (g["payDate"], g["projectCode"], g["classification"]))
    return {
        "kind": kind,
        "columns": [dim.label for dim in DIMS if dim.key in columns],
        "hasProjectColumn": "project" in columns,
        "hasClassificationColumns": bool(columns - {"project"}),
        "projects": projects,
        "missingDeadline": any(project["missingDeadline"] for project in projects),
        "alreadyImported": db.query(Payable)
        .filter(
            Payable.importHash == _file_hash(content),
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
        )
        .first()
        is not None,
        "total": sum((line.amount for line in good if line.amount), Decimal("0")),
        "goodCount": len(good),
        "errorCount": sum(1 for line in lines if line.errors),
        "skippedCount": sum(1 for line in lines if line.skipped and not line.errors),
        "payableCount": len(groups) if incentives else len(_buckets(good)),
        "groups": groups,
        "lines": [
            {
                "line": line.line,
                "name": line.name,
                "documentType": line.documentType,
                "invoiceNumber": line.invoiceNumber,
                "gross": line.gross,
                "amount": line.amount,
                "surveyDate": line.surveyDate,
                "payDate": line.payDate,
                "payDateGiven": line.givenPayDate is not None,
                "projectCode": line.project.code if line.project else line.typed.get("project"),
                "classification": _line_classification(line, columns),
                "skipped": line.skipped and not line.errors,
                "errors": line.errors,
            }
            for line in lines
        ],
    }


def _items(lines: list[Line]) -> list[PayableItem]:
    items = []
    for line in lines:
        status = None
        if line.documentType == "NF":
            status = "Recebida" if line.invoiceNumber else "Pendente"
        items.append(
            PayableItem(
                name=line.name,
                documentType=line.documentType,
                amount=line.amount,
                grossAmount=line.gross,
                invoiceNumber=line.invoiceNumber,
                invoiceDate=line.invoiceDate,
                surveyDate=line.surveyDate,
                invoiceStatus=status,
            )
        )
    return items


def _create(
    db: Session,
    refs: dict[str, Any],
    user: User,
    *,
    origin: str,
    payee: str,
    description: str,
    due: date,
    competence: str,
    file_hash: str,
    lines: list[Line],
) -> Payable:
    project = refs["project"]
    total = sum((line.amount for line in lines if line.amount), Decimal("0"))
    payable = Payable(
        origin=origin,
        payeeName=payee,
        category_id=refs["category"].id,
        company_id=refs["company"].id,
        unit_id=refs["unit"].id,
        cost_center_id=refs["center"].id,
        payment_method_id=refs["method"].id,
        issueDate=today(),
        dueDate=due,
        amount=total,
        description=description,
        competence=competence,
        docsReceivedOn=today(),
        importHash=file_hash,
        created_by_user_id=user.id,
        allocations=[PayableAllocation(project_id=project.id, amount=total)],
        items=_items(lines),
    )
    db.add(payable)
    db.flush()
    return payable


def confirm(
    db: Session, fields: ImportFields, filename: str, content: bytes, user: User
) -> dict[str, Any]:
    """Cria os lançamentos, todos ou nenhum. A planilha é lida de novo e não fica guardada."""
    selected = _selected(db, fields)
    lines, columns = _read(fields.kind, filename, content)
    _resolve(db, lines, selected, columns)
    good = [line for line in lines if _enters(line)]
    if not good:
        raise PayableInvalid("Nenhuma linha da planilha pode entrar. Corrija e envie de novo")
    shown_name = re.split(r"[\\/]", filename)[-1][:100]
    file_hash = _file_hash(content)
    created: list[Payable] = []
    per_project = _by_project(good)
    buckets = _buckets(good)

    if fields.kind == "incentivos":
        without_deadline = [
            p for p, project_lines in per_project if _missing_deadline(p, project_lines)
        ]
        if without_deadline:
            where = (
                "no projeto"
                if len(without_deadline) == 1
                else "nos projetos " + ", ".join(f"PRJ-{p.code}" for p in without_deadline)
            )
            raise PayableConflict(
                f"Defina o prazo do incentivo {where} antes de importar a planilha"
            )
        for refs, bucket_lines in buckets:
            project = refs["project"]
            for pay_date, group in _groups(bucket_lines, _deadline(project)).items():
                surveys = sorted({line.surveyDate for line in group if line.surveyDate})
                payable = _create(
                    db,
                    refs,
                    user,
                    origin="incentivo",
                    payee=f"Incentivos ({_people(len(group))})",
                    description=f"Incentivos · PRJ-{project.code} · pagar {pay_date:%d/%m}",
                    due=pay_date,
                    competence=(surveys[0] if surveys else pay_date).strftime("%Y-%m"),
                    file_hash=file_hash,
                    lines=group,
                )
                days_text = " e ".join(format_date_br(day)[:5] for day in surveys)
                origin_text = f" das pesquisas de {days_text}" if surveys else ""
                payable_service.audit(
                    db,
                    payable,
                    user,
                    f"Criado pela planilha {shown_name}: "
                    f"{_count(len(group), 'incentivo', 'incentivos')}{origin_text}, "
                    f"{format_brl(payable.amount)}, vence {format_date_br(pay_date)} "
                    f"(data {_source(group)})",
                )
                created.append(payable)
    else:
        description = (fields.description or "").strip()
        if not description:
            raise PayableInvalid("Informe a descrição do lançamento")
        if fields.dueDate is None:
            raise PayableInvalid("Informe o vencimento")
        per_project_count = Counter(refs["project"].id for refs, _ in buckets)
        for refs, project_lines in buckets:
            # Mais de um lançamento na planilha: o código do projeto distingue, e a classificação
            # também quando o mesmo projeto tem mais de um.
            shown = description
            if len(buckets) > 1:
                shown += f" · PRJ-{refs['project'].code}"
                if per_project_count[refs["project"].id] > 1:
                    shown += f" · {_classification(refs)}"
            payable = _create(
                db,
                refs,
                user,
                origin="folha",
                payee=f"Folha de campo ({_people(len(project_lines))})",
                description=shown[:200],
                due=fields.dueDate,
                competence=fields.dueDate.strftime("%Y-%m"),
                file_hash=file_hash,
                lines=project_lines,
            )
            payable_service.audit(
                db,
                payable,
                user,
                f"Criado pela planilha {shown_name}: "
                f"{_count(len(project_lines), 'item', 'itens')}, {format_brl(payable.amount)}",
            )
            created.append(payable)

    db.commit()
    return {
        "count": len(created),
        "items": len(good),
        "total": sum((p.amount for p in created), Decimal("0")),
    }


def _count(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


def _people(count: int) -> str:
    return _count(count, "pessoa", "pessoas")

"""Importar planilha de incentivos ou de folha de campo para o Contas a pagar.

A planilha é lida em memória e descartada. Só ficam nome e valor de cada pessoa, e o resumo
criptográfico do arquivo, para avisar quando ela for importada de novo. O CPF nunca é lido, e a
chave Pix do respondente (só na planilha de incentivos) fica **mascarada** (3 primeiros e 2 últimos
caracteres): a chave completa não é guardada, não vai para a prévia nem para o log (pergunta Q22,
provisório até o DPO decidir). Só as colunas abaixo saem do arquivo, e o STATUS da planilha serve
apenas para deixar de fora quem já foi pago: ele não é guardado.
"""

import csv
import hashlib
import io
import re
import unicodedata
import zipfile
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from itertools import islice
from typing import Any

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from core import company_scope
from core.business_days import NO_EXTRA, add_business_days, next_business_day, why_not_business
from core.pix import hash_pix, mask_pix_key, normalize_pix_key
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
from services import period_lock, tax_rates
from services.holidays import holiday_names
from services.payable import PayableConflict, PayableInvalid, _active, inactive_project, today

MAX_BYTES = 5 * 1024 * 1024
MAX_UNZIPPED_BYTES = 50 * 1024 * 1024
MAX_ROWS = 5000
# Com 5.000 linhas, este teto mantém o total dentro do que a coluna de valor aceita.
MAX_LINE_AMOUNT = Decimal("1000000")
# shortcut: o INSS do RPA é um percentual só (Cadastros → Impostos retidos, 11% hoje), sem o teto
# do INSS; trocar quando a contabilidade responder a N3.
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
    Dim("category", ExpenseCategory, "Plano de contas", "plano de contas", "uma só conta do plano"),
    Dim(
        "method",
        PaymentMethod,
        "Forma de pagamento",
        "forma de pagamento",
        "uma só forma de pagamento",
    ),
)
COMPANY = DIMS[1]
# No incentivo, o que a linha e a tela não dizem vem do cadastro do projeto (Carregar incentivos).
FROM_PROJECT = frozenset({"company", "unit", "center"})
# E estes três têm de vir preenchidos em cada linha da planilha: marcar na tela não os substitui.
SHEET_ONLY = frozenset({"project", "category", "method"})
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
# Inclui os títulos da planilha de incentivos que o financeiro já usa.
INCENTIVE_COLUMNS = {
    "nome": "name",
    "beneficiario": "name",
    "nome completo": "fullName",  # reserva: vale quando o beneficiário vem vazio
    "valor": "amount",
    "valor total": "amount",
    "data da pesquisa": "surveyDate",
    "data da resposta": "surveyDate",
    "data de realizacao da pesquisa": "surveyDate",
    "data de pagamento": "payDate",
    "pagar": "payDate",
    "pagar (preenchido pelo financeiro)": "payDate",
    "chave pix": "pix",
    "pix": "pixOther",  # as duas vêm juntas na planilha atual: ver _pix_cell
    "status": "status",
    **DIM_COLUMNS,
}
# A célula de Pix que diz só o tipo da chave: a chave de verdade está na outra coluna.
PIX_KEY_TYPES = frozenset(
    {
        "aleatoria",
        "aleatorio",
        "celular",
        "chave aleatoria",
        "cnpj",
        "cpf",
        "cpf/cnpj",
        "e-mail",
        "email",
        "telefone",
    }
)
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
    # A chave Pix da planilha, já mascarada, e o HMAC dela para casar o comprovante: a completa
    # nunca fica na linha (nem em `typed`)
    pixMasked: str | None = None
    pixHash: str | None = None
    # A data da planilha caía em dia não útil: de que dia veio e por quê (sábado, feriado...)
    shiftedFrom: date | None = None
    shiftReason: str | None = None
    typed: dict[str, str] = field(default_factory=dict)  # o que a planilha escreveu, por campo
    refs: dict[str, Any] = field(default_factory=dict)  # o cadastro que cada campo achou
    skipped: bool = False  # fora do que a pessoa marcou: não é erro, só não entra
    alreadyPaid: bool = False  # a planilha diz que já recebeu: também fica de fora, sem ser erro
    errors: list[str] = field(default_factory=list)

    @property
    def project(self) -> Project | None:
        return self.refs.get("project")


def _folded(text: str) -> str:
    plain = unicodedata.normalize("NFD", text)
    return "".join(c for c in plain if not unicodedata.combining(c)).strip().casefold()


def _title(value: Any) -> str:
    """Título de coluna ou palavra da célula sem acento, caixa, espaços a mais e ":" no fim."""
    return " ".join(_folded(_text(value)).rstrip(" :").split())


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
        # a data escrita como texto: 27/11/2026, 27/11/26, 27-11-2026, 27.11.2026 ou 2026-11-27,
        # com ou sem a hora depois (reunião de 26/11/2026: a planilha não vinha no formato único)
        text = str(value).strip().split()[0]
        for pattern in ("%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(text, pattern).date()
                break
            except ValueError:
                continue
        else:
            return None, False
    return (parsed, True) if 2000 <= parsed.year <= 2100 else (None, False)


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _pix(value: Any) -> tuple[str | None, str | None]:
    """A chave Pix da célula mascarada e o HMAC dela, ou (None, None) sem chave. A completa não sai
    daqui."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # CPF digitado como número no Excel: sem o ".0" no fim
    key = _text(value)
    if not key:
        return None, None
    normalized = normalize_pix_key(key)
    return mask_pix_key(normalized)[:255], hash_pix(normalized)


def _pix_cell(cells: Mapping[str, Any]) -> Any:
    """A célula com a chave: a planilha atual tem duas colunas de Pix, e uma pode trazer só o tipo
    da chave (CPF, e-mail, celular...)."""
    for key in ("pix", "pixOther"):
        if _text(cells.get(key)) and _title(cells.get(key)) not in PIX_KEY_TYPES:
            return cells.get(key)
    return None


def _already_paid(value: Any) -> bool:
    """O STATUS da planilha diz que a pessoa já recebeu ("Pago", "PAGO em 10/11")."""
    return _title(value).split(" ")[0] in {"pago", "paga"}


def _table(
    rows: list[tuple[Any, ...]], columns: dict[str, str]
) -> list[tuple[int, dict[str, Any]]]:
    """Só as colunas conhecidas saem daqui: o CPF e o resto da planilha ficam para trás (a chave Pix
    só entra na de incentivos, e mascarada)."""
    if not rows:
        raise PayableInvalid("A planilha está vazia")
    positions = {}
    for index, title in enumerate(rows[0]):
        key = columns.get(_title(title))
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
    if "name" not in positions and "fullName" not in positions:
        raise PayableInvalid('A planilha precisa da coluna "nome"')
    if "amount" not in positions:
        raise PayableInvalid('A planilha precisa da coluna "valor"')
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
    name = _text(cells.get("name")) or _text(cells.get("fullName"))
    line = Line(line=number, name=name, typed=typed)
    if not line.name:
        line.errors.append("Nome vazio")
    elif len(line.name) > 200:
        line.errors.append("Nome muito longo")
    line.amount, error = _money(cells.get("amount"))
    if error:
        line.errors.append(error)
    return line


def _incentive_lines(rows: list[tuple[Any, ...]]) -> list[Line]:
    keys = {INCENTIVE_COLUMNS.get(_title(title)) for title in rows[0]} if rows else set()
    table = _table(rows, INCENTIVE_COLUMNS)
    if not keys & {"surveyDate", "payDate"}:
        raise PayableInvalid('A planilha precisa da coluna "data da pesquisa"')
    lines = []
    for number, cells in table:
        line = _base_line(number, cells)
        line.pixMasked, line.pixHash = _pix(_pix_cell(cells))
        if not line.pixHash:
            # a baixa sai pelos comprovantes, casados pela chave (27/11/2026)
            line.errors.append("Sem chave Pix: a baixa casa o comprovante com a pessoa pela chave")
        line.surveyDate, survey_ok = _date(cells.get("surveyDate"))
        line.givenPayDate, pay_ok = _date(cells.get("payDate"))
        if not pay_ok:
            line.errors.append("Data de pagamento inválida: use dia/mês/ano, como 27/11/2026")
        elif not survey_ok:
            line.errors.append("Data da pesquisa inválida: use dia/mês/ano, como 27/11/2026")
        elif not line.givenPayDate and not line.surveyDate:
            line.errors.append("Sem data de pagamento e sem data da pesquisa")
        elif line.givenPayDate and line.surveyDate and line.givenPayDate < line.surveyDate:
            line.errors.append("Pagamento antes da data da pesquisa")
        if _already_paid(cells.get("status")):
            # Quem já recebeu não entra, para não pagar duas vezes: o resto da linha não importa.
            line.alreadyPaid = line.skipped = True
            line.errors.clear()
        lines.append(line)
    return lines


def _payroll_lines(rows: list[tuple[Any, ...]], inss_rate: Decimal) -> list[Line]:
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
            discount = (line.gross * inss_rate).quantize(CENTS, rounding=ROUND_HALF_UP)
            line.amount = line.gross - discount
        if document == "NF":
            line.invoiceNumber = _text(cells.get("invoiceNumber"))[:50] or None
            line.invoiceDate, invoice_ok = _date(cells.get("invoiceDate"))
            if not invoice_ok:
                line.errors.append("Data de emissão inválida: use dia/mês/ano, como 27/11/2026")
        lines.append(line)
    return lines


def _source(group: list[Line]) -> str:
    given = sum(1 for line in group if line.givenPayDate)
    if given == len(group):
        return "informada na planilha"
    return "informada em parte, o resto calculado" if given else "calculada pelo prazo"


def _deadline(project: Project) -> int | None:
    return project.incentiveDays if project.hasIncentive else None


def _groups(
    lines: list[Line], days: int | None, extra: Mapping[date, str] = NO_EXTRA
) -> dict[date, list[Line]]:
    """Um lançamento por data de pagamento: a da planilha, ou a da pesquisa mais o prazo em dias
    úteis. A data da planilha que cai em fim de semana ou feriado vai para o próximo dia útil
    (a linha guarda de onde veio, para a prévia avisar); `extra` são os feriados cadastrados."""
    groups: dict[date, list[Line]] = {}
    for line in lines:
        line.payDate = line.givenPayDate
        line.shiftedFrom = line.shiftReason = None
        if line.payDate is None and line.surveyDate is not None and days:
            line.payDate = add_business_days(line.surveyDate, days, extra)
        elif line.payDate is not None:
            reason = why_not_business(line.payDate, extra)
            if reason:
                line.shiftedFrom, line.shiftReason = line.payDate, reason
                line.payDate = next_business_day(line.payDate, extra)
        if line.payDate is not None:
            groups.setdefault(line.payDate, []).append(line)
    return dict(sorted(groups.items()))


def _shifts(group: list[Line]) -> list[dict[str, Any]]:
    """As datas da planilha deste grupo que foram para o próximo dia útil, e por quê."""
    found = {
        (line.shiftedFrom, line.shiftReason)
        for line in group
        if line.shiftedFrom and line.shiftReason
    }
    return [{"day": day, "reason": reason} for day, reason in sorted(found)]


def _shift_text(group: list[Line], pay_date: date) -> str:
    """Para o histórico do lançamento: de que data da planilha ele foi ajustado e por quê."""
    shifts = _shifts(group)
    if not shifts:
        return ""
    moved = ", ".join(f"{format_date_br(s['day'])} ({s['reason']})" for s in shifts)
    return f"; data da planilha ajustada para {format_date_br(pay_date)}: {moved}"


def _project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None or not company_scope.sees_project(db, project):
        raise PayableInvalid("Projeto não encontrado")
    if project.status == "encerrado":
        raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
    if not project.active:
        raise PayableConflict(inactive_project(project))
    return project


def _read(db: Session, kind: str, filename: str, content: bytes) -> tuple[list[Line], set[str]]:
    """As linhas da planilha e quais campos de classificação ela traz em coluna."""
    rows = _rows(filename, content)
    titles = {_title(title) for title in rows[0]} if rows else set()
    if kind == "incentivos":
        lines = _incentive_lines(rows)
    else:
        lines = _payroll_lines(rows, tax_rates.rate_of(db, "inss") / 100)
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
        elif dim.key == "center":
            # o sub-centro também casa pelo caminho (Administrativo › Geral) e pelo código (001.001)
            names.append(record.path)
            if record.code:
                names += [record.code, f"{record.code} {record.name}"]
        for name in dict.fromkeys(names):
            found.setdefault(_folded(name), []).append(record)
    return found


def _problem(dim: Dim, record: Any) -> str | None:
    if dim.key == "project":
        if record.status == "encerrado":
            return f"Projeto PRJ-{record.code} está fechado"
        return None if record.active else f"Projeto PRJ-{record.code} está inativo"
    if not record.active:
        return f"{dim.title} {record.name}: cadastro inativo"
    if dim.key == "category" and record.kind != "despesa":
        return f"Plano de contas {record.name}: contas a pagar usam conta de despesa"
    return None


def _accept(line: Line, dim: Dim, record: Any, chosen: list[Any]) -> None:
    if chosen and record.id not in {item.id for item in chosen}:
        line.skipped = True
        return
    problem = _problem(dim, record)
    if problem:
        line.errors.append(problem)
        return
    line.refs[dim.key] = record


def _project_record(db: Session, line: Line, dim: Dim) -> Any | None:
    """A unidade ou o centro de custo do cadastro do projeto da linha."""
    project = line.project
    if project is None:  # o projeto já deixou o erro, ou a linha ficou de fora
        return None
    record_id = project.unit_id if dim.key == "unit" else project.cost_center_id
    record = db.get(dim.model, record_id) if record_id else None
    if record is None:
        line.errors.append(f"Projeto PRJ-{project.code} sem {dim.label} no cadastro")
    return record


def _resolve_one(
    line: Line,
    dim: Dim,
    chosen: list[Any],
    lookup: dict[str, list[Any]] | None,
    project_db: Session | None = None,
    *,
    sheet_only: bool = False,
) -> None:
    """`project_db`: o campo que, sem nada na linha nem na tela, sai do cadastro do projeto.
    `sheet_only`: o campo que só vale preenchido na planilha."""
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
            hint = ": escreva o código dele" if dim.key == "center" else ""
            line.errors.append(f"{dim.title} {text} aparece mais de uma vez no cadastro{hint}")
            return
        record = found[0]
    elif len(chosen) == 1 and not sheet_only:
        record = chosen[0]
    elif project_db is not None:
        record = _project_record(project_db, line, dim)
        if record is None:
            return
    else:
        line.errors.append(f"Sem {dim.label} na linha")
        return
    _accept(line, dim, record, chosen)


def _missing_columns(labels: list[str]) -> str:
    quoted = [f'"{label}"' for label in labels]
    if len(quoted) == 1:
        return f"A planilha precisa da coluna {quoted[0]}"
    return f"A planilha precisa das colunas {', '.join(quoted[:-1])} e {quoted[-1]}"


def _resolve(
    db: Session,
    lines: list[Line],
    selected: dict[str, list[Any]],
    columns: set[str],
    *,
    incentives: bool = False,
) -> None:
    """Diz o projeto, a empresa, a unidade, o centro de custo, a categoria e a forma de cada linha.

    Campo sem coluna na planilha vale para ela toda e exige um só marcado na tela. Com a coluna,
    cada linha traz o seu, e célula vazia vale o marcado, se houver um só. Com cadastros marcados,
    linha de outro cadastro fica de fora sem ser erro.

    Nos `incentives`, projeto, plano de contas e forma de pagamento têm de vir em cada linha da
    planilha. A unidade e o centro de custo que a linha e a tela não dizem saem do cadastro do
    projeto, e a empresa sai da unidade da linha.
    """
    inherited = FROM_PROJECT if incentives else frozenset()
    required = SHEET_ONLY if incentives else frozenset()
    missing = [dim.label for dim in DIMS if dim.key in required and dim.key not in columns]
    if missing:
        raise PayableInvalid(_missing_columns(missing))
    for dim in DIMS:
        if dim.key not in inherited and dim.key not in columns and len(selected[dim.key]) != 1:
            raise PayableInvalid(
                f'A planilha não tem a coluna "{dim.label}". '
                f"Escolha {dim.one} na tela ou inclua a coluna na planilha"
            )
    if not {"company", "unit"} & columns and len(selected["company"]) == len(selected["unit"]) == 1:
        if selected["unit"][0].company_id != selected["company"][0].id:
            raise PayableInvalid("A unidade não é dessa empresa")
    lookups = {dim.key: _lookup(db, dim) for dim in DIMS if dim.key in columns}
    for line in lines:
        if line.alreadyPaid:
            continue
        # Sem empresa na linha nem uma só marcada na tela, ela sai da unidade, resolvida depois.
        from_unit = incentives and not line.typed.get("company") and len(selected["company"]) != 1
        for dim in DIMS:
            if dim.key == "company" and from_unit:
                continue
            # Empresa que não se resolveu já deixou o erro (ou a linha de fora): a unidade, que
            # depende dela, não ganha um segundo erro.
            waiting = "company" in columns and "company" not in line.refs and not from_unit
            if dim.key == "unit" and waiting:
                continue
            _resolve_one(
                line,
                dim,
                selected[dim.key],
                lookups.get(dim.key),
                db if dim.key in inherited else None,
                sheet_only=dim.key in required,
            )
        if from_unit and "unit" in line.refs:
            owner = db.get(Company, line.refs["unit"].company_id)
            _accept(line, COMPANY, owner, selected["company"])
        company, unit = line.refs.get("company"), line.refs.get("unit")
        if company is not None and unit is not None and unit.company_id != company.id:
            line.errors.append(f"A unidade {unit.name} não é da empresa {company.label}")


def _enters(line: Line) -> bool:
    return not line.errors and not line.skipped and all(dim.key in line.refs for dim in DIMS)


def _classification(refs: dict[str, Any]) -> str:
    category = refs["category"]
    return " · ".join(
        [
            refs["company"].label,
            refs["unit"].name,
            refs["center"].path,
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
    lines, columns = _read(db, kind, filename, content)
    _resolve(db, lines, selected, columns, incentives=kind == "incentivos")
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
    extra = holiday_names(db)
    for refs, bucket_lines in _buckets(good) if incentives else []:
        project = refs["project"]
        for pay_date, group in _groups(bucket_lines, _deadline(project), extra).items():
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
                    "shifts": _shifts(group),
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
        "alreadyImported": company_scope.unscoped(
            db.query(Payable.id).filter(
                Payable.importHash == _file_hash(content),
                Payable.deletedAt.is_(None),
                Payable.canceledAt.is_(None),
            )
        ).first()
        is not None,
        "total": sum((line.amount for line in good if line.amount), Decimal("0")),
        "goodCount": len(good),
        "errorCount": sum(1 for line in lines if line.errors),
        "skippedCount": sum(
            1 for line in lines if line.skipped and not line.errors and not line.alreadyPaid
        ),
        "alreadyPaidCount": sum(1 for line in lines if line.alreadyPaid),
        "payableCount": len(groups) if incentives else len(_buckets(good)),
        "shiftedCount": sum(1 for line in good if line.shiftedFrom),
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
                "skipped": line.skipped and not line.errors and not line.alreadyPaid,
                "alreadyPaid": line.alreadyPaid,
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
                pix_masked=line.pixMasked,
                pix_hash=line.pixHash,
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
    period_lock.ensure_open(db, refs["company"].id, today())
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
        # incentivo com a chave de todas as pessoas: a baixa só sai pelos comprovantes (27/11/2026)
        paidByReceipts=origin == "incentivo" and all(line.pixHash for line in lines),
    )
    db.add(payable)
    db.flush()
    return payable


def confirm(
    db: Session, fields: ImportFields, filename: str, content: bytes, user: User
) -> dict[str, Any]:
    """Cria os lançamentos, todos ou nenhum. A planilha é lida de novo e não fica guardada."""
    selected = _selected(db, fields)
    lines, columns = _read(db, fields.kind, filename, content)
    _resolve(db, lines, selected, columns, incentives=fields.kind == "incentivos")
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
            # O prazo não se marca mais na tela do projeto (18/11): a saída é a data na planilha.
            where = (
                "o projeto não tem"
                if len(without_deadline) == 1
                else "os projetos "
                + ", ".join(f"PRJ-{p.code}" for p in without_deadline)
                + " não têm"
            )
            raise PayableConflict(
                "Use uma planilha com a data de pagamento de cada pessoa: "
                f"{where} prazo de incentivo marcado"
            )
        extra = holiday_names(db)
        planned = [
            (refs, pay_date, group)
            for refs, bucket_lines in buckets
            for pay_date, group in _groups(bucket_lines, _deadline(refs["project"]), extra).items()
        ]
        for refs, pay_date, group in planned:
            project = refs["project"]
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
                f"(data {_source(group)}){_shift_text(group, pay_date)}",
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

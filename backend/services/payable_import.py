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
from models.reference import Project
from models.user import User
from schemas.payable import ImportFields
from services import payable as payable_service
from services.payable import PayableConflict, PayableInvalid, today

MAX_BYTES = 5 * 1024 * 1024
MAX_UNZIPPED_BYTES = 50 * 1024 * 1024
MAX_ROWS = 5000
# Com 5.000 linhas, este teto mantém o total dentro do que a coluna de valor aceita.
MAX_LINE_AMOUNT = Decimal("1000000")
# shortcut: 11% fixos, sem o teto do INSS; trocar quando a contabilidade responder a N3.
INSS_RATE = Decimal("0.11")
CENTS = Decimal("0.01")

INCENTIVE_COLUMNS = {
    "nome": "name",
    "valor": "amount",
    "data da pesquisa": "surveyDate",
    "data da resposta": "surveyDate",
    "data de pagamento": "payDate",
}
PAYROLL_COLUMNS = {
    "nome": "name",
    "documento": "document",
    "valor": "amount",
    "numero da nf": "invoiceNumber",
    "emissao": "invoiceDate",
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
    errors: list[str] = field(default_factory=list)


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


def _base_line(number: int, cells: dict[str, Any]) -> Line:
    line = Line(line=number, name=_text(cells.get("name")))
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


def _read(kind: str, filename: str, content: bytes) -> list[Line]:
    rows = _rows(filename, content)
    return _incentive_lines(rows) if kind == "incentivos" else _payroll_lines(rows)


def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def preview(
    db: Session, kind: str, project_id: int, filename: str, content: bytes
) -> dict[str, Any]:
    """Confere a planilha sem gravar nada."""
    project = _project(db, project_id)
    lines = _read(kind, filename, content)
    good = [line for line in lines if not line.errors]
    days = _deadline(project)
    incentives = kind == "incentivos"
    groups = _groups(good, days) if incentives else {}
    return {
        "kind": kind,
        "projectType": project.projectType,
        "deadlineDays": days,
        "missingDeadline": incentives
        and not days
        and any(line.givenPayDate is None for line in good),
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
        "errorCount": len(lines) - len(good),
        "groups": [
            {
                "payDate": pay_date,
                "surveyDates": sorted({g.surveyDate for g in group if g.surveyDate}),
                "count": len(group),
                "total": sum((g.amount for g in group if g.amount), Decimal("0")),
                "source": _source(group),
            }
            for pay_date, group in groups.items()
        ],
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
    fields: ImportFields,
    project: Project,
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
    total = sum((line.amount for line in lines if line.amount), Decimal("0"))
    payable = Payable(
        origin=origin,
        payeeName=payee,
        category_id=fields.categoryId,
        company_id=fields.companyId,
        unit_id=fields.unitId,
        cost_center_id=fields.costCenterId,
        payment_method_id=fields.paymentMethodId,
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
    payable_service.check_classification(
        db,
        categoryId=fields.categoryId,
        companyId=fields.companyId,
        unitId=fields.unitId,
        costCenterId=fields.costCenterId,
        paymentMethodId=fields.paymentMethodId,
    )
    project = _project(db, fields.projectId)
    good = [line for line in _read(fields.kind, filename, content) if not line.errors]
    if not good:
        raise PayableInvalid("Nenhuma linha da planilha pode entrar. Corrija e envie de novo")
    shown_name = re.split(r"[\\/]", filename)[-1][:100]
    file_hash = _file_hash(content)
    created: list[Payable] = []

    if fields.kind == "incentivos":
        days = _deadline(project)
        if not days and any(line.givenPayDate is None for line in good):
            raise PayableConflict(
                "Defina o prazo do incentivo no projeto antes de importar a planilha"
            )
        for pay_date, group in _groups(good, days).items():
            surveys = sorted({line.surveyDate for line in group if line.surveyDate})
            payable = _create(
                db,
                fields,
                project,
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
        payable = _create(
            db,
            fields,
            project,
            user,
            origin="folha",
            payee=f"Folha de campo ({_people(len(good))})",
            description=description,
            due=fields.dueDate,
            competence=fields.dueDate.strftime("%Y-%m"),
            file_hash=file_hash,
            lines=good,
        )
        payable_service.audit(
            db,
            payable,
            user,
            f"Criado pela planilha {shown_name}: {_count(len(good), 'item', 'itens')}, "
            f"{format_brl(payable.amount)}",
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

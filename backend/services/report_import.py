"""Importar o relatório "Lançamentos a Pagar" do sistema antigo (SGE4B) para o Contas a pagar.

Cada linha do relatório vira uma conta (origem "relatorio"); a linha paga cria também a baixa. O
arquivo é lido em memória e descartado: ficam só as contas e, em cada uma, uma chave (HMAC) da
linha, para reenviar o relatório (ou um mais novo) só criar o que ainda não existe. CPF nunca é
guardado. As regras estão em `docs/specs/contas-a-pagar.md` (Ajustes de 16/11/2026).
"""

import csv
import io
import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from html.parser import HTMLParser
from itertools import islice
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.pix import is_valid_cpf
from core.security import hash_statement_key
from core.text import format_brl, format_date_br
from models.payable import Payable, PayableAllocation, PayablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User
from schemas.payable import ReportFields
from services import payable as payable_service
from services import period_lock
from services.cnpj_lookup import CPF_IN_TEXT
from services.payable import PayableConflict, PayableInvalid, _active, inactive_project, today
from services.payable_import import (
    MAX_ROWS,
    _date,
    _file_hash,
    _folded,
    _money,
    _project_code,
    _rows,
    _text,
    _unreadable,
)

ZERO = Decimal("0")
HEADER_SCAN = 30
KEY_CHUNK = 500
PAYMENT_NOTE = "Importada do relatório do sistema antigo"
HEADER_MISSING = (
    "Não achei o cabeçalho do relatório: ele precisa das colunas "
    "Programação, Fornecedor e R$ Líquido"
)
OLE2_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")
OLD_XLS = (
    "Este .xls é do formato antigo do Excel, que o sistema não lê. "
    "Abra o arquivo no Excel e salve como .xlsx ou .csv"
)
# O Excel, ao salvar como página da web, grava os dados numa pasta ao lado ("..._arquivos").
EXCEL_PAGE = (
    "Este arquivo é só a capa de uma página salva pelo Excel, sem os dados. "
    "Abra o relatório no Excel e salve como .xlsx"
)
# A linha digitável do boleto (banco ou concessionária), que o sistema antigo guarda na descrição.
BARCODES = (
    re.compile(r"(?<!\d)\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}(?!\d)"),
    re.compile(r"(?<!\d)(?:\d{11}-\d\s+){3}\d{11}-\d(?!\d)"),
    re.compile(r"(?<!\d)\d{44,48}(?!\d)"),
)
CANCELLED = "Cancelada no relatório"
ALREADY = "Já importada antes"
CPF_REMOVED = "(CPF retirado)"

# Os títulos das colunas, sem acento, em minúsculas e com um espaço só entre as palavras.
COLUMNS = {
    "programacao": "scheduled",
    "vencimento": "due",
    "pagamento": "paidOn",
    "data de pagamento": "paidOn",
    "fornecedor": "supplier",
    "plano de contas": "category",
    "plano de conta": "category",
    "categoria": "category",
    "r$ liquido": "net",
    "valor liquido": "net",
    "liquido": "net",
    "r$ pago": "paid",
    "valor pago": "paid",
    "pago": "paid",
    "r$ pendente": "pending",
    "valor pendente": "pending",
    "pendente": "pending",
    "projeto": "project",
    "unidade": "unit",
    "ccusto": "center",
    "c.custo": "center",
    "c. custo": "center",
    "centro de custo": "center",
    "empresa": "company",
    "conta": "account",
    "conta bancaria": "account",
    "situacao": "situation",
    "descricao": "description",
    "documento": "document",
    "forma pagto": "method",
    "forma de pagamento": "method",
    "forma": "method",
}
REQUIRED = {"scheduled", "supplier", "net"}
LABELS = {
    "scheduled": "Programação",
    "due": "Vencimento",
    "paidOn": "Pagamento",
    "supplier": "Fornecedor",
    "category": "Plano de Contas",
    "net": "R$ Líquido",
    "paid": "R$ Pago",
    "pending": "R$ Pendente",
    "project": "Projeto",
    "unit": "Unidade",
    "center": "CCusto",
    "company": "Empresa",
    "account": "Conta",
    "situation": "Situação",
    "description": "Descrição",
    "document": "Documento",
    "method": "Forma de pagamento",
}
# Os campos de texto que se ligam a um cadastro, na ordem em que aparecem na tela.
TEXT_KEYS = ("project", "unit", "center", "company", "category", "account", "method")


@dataclass
class Row:
    """Uma linha do relatório: o que ela diz, o que o sistema achou e o que decidiu."""

    row: int
    supplierText: str = ""
    description: str = ""
    scheduled: date | None = None
    due: date | None = None
    paidOn: date | None = None
    net: Decimal | None = None
    paid: Decimal = ZERO
    situation: str = ""
    document: str | None = None
    barcode: str | None = None
    texts: dict[str, str] = field(default_factory=dict)
    key: str | None = None
    skipped: str | None = None
    notes: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    usedDefault: bool = False
    supplier: Supplier | None = None
    project: Project | None = None
    category: ExpenseCategory | None = None
    center: CostCenter | None = None
    method: PaymentMethod | None = None
    unit: BusinessUnit | None = None
    company: Company | None = None
    account: BankAccount | None = None

    @property
    def enters(self) -> bool:
        return not self.errors and self.skipped is None


Index = dict[str, list[Any]]


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", _folded(_text(value)))


def _index(records: list[Any], keys: Callable[[Any], list[str | None]]) -> Index:
    found: Index = {}
    for record in records:
        for name in dict.fromkeys(key for key in keys(record) if key):
            found.setdefault(_norm(name), []).append(record)
    return found


# ---- Ler o arquivo ----


def _csv_rows(content: bytes) -> list[tuple[Any, ...]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252", errors="replace")  # como o Excel salva CSV no Brasil
    # O título do relatório vem antes do cabeçalho: o separador sai da linha dos nomes das colunas.
    lines = text.splitlines()
    header = next((line for line in lines[:HEADER_SCAN] if "fornecedor" in _folded(line)), "")
    delimiter = ";" if ";" in header else ","
    try:
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        return [tuple(row) for row in islice(reader, MAX_ROWS + 2)]
    except csv.Error as exc:
        raise _unreadable() from exc


class _TableReader(HTMLParser):
    """Lê a primeira tabela de um HTML. O sistema antigo exporta HTML com a extensão .xls (o Excel
    abre). Não busca nada na rede nem expande entidade externa: só junta o texto das células."""

    def __init__(self, limit: int) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[tuple[str, ...]] = []
        self._limit = limit
        self._depth = 0  # tabela dentro de tabela: só vale a primeira
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self._depth += 1
        elif self._depth == 1 and tag == "tr":
            self._row = []
        elif self._depth == 1 and tag in ("td", "th") and self._row is not None:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "table":
            self._depth -= 1
        elif self._depth == 1 and tag in ("td", "th") and self._cell is not None:
            if self._row is not None:
                # como o Excel mostra: a quebra de linha que ele põe no meio do texto vira espaço
                self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif self._depth == 1 and tag == "tr" and self._row is not None:
            if len(self.rows) < self._limit:
                self.rows.append(tuple(self._row))
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def _html_rows(content: bytes) -> list[tuple[Any, ...]]:
    if content[:8] == OLE2_MAGIC:
        raise PayableInvalid(OLD_XLS)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252", errors="replace")
    if "<" not in text[:2000]:
        raise _unreadable()
    if "<frameset" in text.lower():
        raise PayableInvalid(EXCEL_PAGE)
    reader = _TableReader(MAX_ROWS + 2)
    reader.feed(text)
    reader.close()
    if len(reader.rows) > MAX_ROWS + 1:
        raise PayableInvalid(f"A planilha passa de {MAX_ROWS} linhas. Divida em arquivos menores")
    return list(reader.rows)


def _sheet(filename: str, content: bytes) -> list[tuple[Any, ...]]:
    name = filename.lower()
    if name.endswith((".xls", ".html", ".htm")):
        return _html_rows(content)
    if name.endswith(".csv"):
        rows = _csv_rows(content)
        if len(rows) > MAX_ROWS + 1:
            raise PayableInvalid(
                f"A planilha passa de {MAX_ROWS} linhas. Divida em arquivos menores"
            )
        return rows
    if name.endswith(".xlsx"):
        return _rows(filename, content)
    raise PayableInvalid("Envie o relatório em .xls, .xlsx ou .csv")


def _header(rows: list[tuple[Any, ...]]) -> tuple[int, dict[str, int]]:
    for at, row in enumerate(rows[:HEADER_SCAN]):
        positions: dict[str, int] = {}
        for index, title in enumerate(row):
            key = COLUMNS.get(_norm(title))
            if key and key not in positions:
                positions[key] = index
        if REQUIRED <= positions.keys():
            return at, positions
    raise PayableInvalid(HEADER_MISSING)


def _optional_money(value: Any) -> tuple[Decimal, bool]:
    """R$ Pago: vazio e zero valem zero. O segundo valor diz se o que veio é um valor em reais."""
    if value is None or _text(value) == "":
        return ZERO, True
    amount, error = _money(value)
    if error is None and amount is not None:
        return amount, True
    zero = (
        Decimal(str(value)) == 0
        if isinstance(value, int | float | Decimal) and not isinstance(value, bool)
        else bool(re.fullmatch(r"0+([.,]0+)?", _text(value)))
    )
    return (ZERO, True) if zero else (ZERO, False)


def _without_cpf(value: str) -> tuple[str, bool]:
    """Tira o CPF do texto (o sistema antigo põe "PIX CPF ..." na descrição). O CPF nunca é
    guardado, nem entra na chave da linha: no lugar fica um aviso, e a conta entra normalmente."""
    removed = False

    def swap(found: re.Match[str]) -> str:
        nonlocal removed
        if not is_valid_cpf(re.sub(r"\D", "", found.group())):
            return found.group()
        removed = True
        return CPF_REMOVED

    return CPF_IN_TEXT.sub(swap, value), removed


def _clean(line: Row, key: str, text: str) -> str:
    """O texto da coluna sem CPF; se havia um, a linha ganha o aviso."""
    text, found = _without_cpf(text)
    if found:
        line.notes.append(f"CPF retirado da coluna {LABELS[key]}: o sistema não guarda CPF")
    return text


def _parse(rows: list[tuple[Any, ...]], at: int, positions: dict[str, int]) -> list[Row]:
    def cell(row: tuple[Any, ...], key: str) -> Any:
        pos = positions.get(key)
        return row[pos] if pos is not None and pos < len(row) else None

    on = today()
    seen: Counter[str] = Counter()
    lines: list[Row] = []
    for number, values in enumerate(rows[at + 1 :], start=at + 2):
        identity = [
            _text(cell(values, key)) for key in ("scheduled", "supplier", "category", "description")
        ]
        if not any(identity) or _norm(identity[0]).startswith("total"):
            continue  # linha em branco ou de total (TOTAL PAGO, PENDENTE e GERAL no fim)
        line = Row(row=number)
        line.supplierText = _clean(line, "supplier", _text(cell(values, "supplier")))[:200]
        if not line.supplierText:
            line.errors.append("Sem fornecedor")
        description = re.sub(r"\s+", " ", _text(cell(values, "description")))
        for pattern in BARCODES:
            found = pattern.search(description)
            if found:
                # A linha digitável do boleto tem campo próprio: sai da descrição e vai para ele
                line.barcode = re.sub(r"\s+", " ", found.group())[:60]
                rest = f"{description[: found.start()]} {description[found.end() :]}"
                description = re.sub(r"\s+", " ", rest).strip(" -·;,")
                break
        description = _clean(line, "description", description)
        line.description = description[:255]
        line.document = _clean(line, "document", _text(cell(values, "document")))[:50] or None
        line.situation = _norm(cell(values, "situation"))
        for key in TEXT_KEYS:
            text = (
                _project_code(cell(values, key)) if key == "project" else _text(cell(values, key))
            )
            if text:
                line.texts[key] = _clean(line, key, text)

        scheduled, valid = _date(cell(values, "scheduled"))
        if not valid or scheduled is None:
            line.errors.append("Programação inválida ou vazia")
        line.scheduled = scheduled
        line.due = scheduled
        if "due" in positions:
            due, valid = _date(cell(values, "due"))
            if not valid:
                line.errors.append("Vencimento inválido")
            line.due = due or scheduled
        net, error = _money(cell(values, "net"))
        if error:
            line.errors.append("R$ Líquido inválido")
        line.net = net
        line.paid, valid = _optional_money(cell(values, "paid"))
        if not valid:
            line.errors.append("R$ Pago inválido")
        line.paidOn, valid = _date(cell(values, "paidOn"))
        if not valid:
            line.errors.append("Data de Pagamento inválida")

        if "cancel" in line.situation:
            line.skipped = CANCELLED
            line.errors.clear()  # linha cancelada fica de fora, mesmo com outro problema
            lines.append(line)
            continue
        if line.net is not None and line.paid > line.net:
            line.errors.append("R$ Pago é maior que o R$ Líquido")
        if line.paid > 0 and line.paidOn is None and valid:
            line.errors.append("Linha paga sem data de Pagamento")
        if line.paidOn is not None and line.paidOn > on:
            line.errors.append("A data de Pagamento não pode ser no futuro")
        if line.situation in ("pago", "paga") and line.paid <= 0:
            line.errors.append("A Situação diz PAGO, mas R$ Pago está vazio")

        if line.scheduled and line.due and line.net is not None:
            base = "|".join(
                [
                    line.scheduled.isoformat(),
                    line.due.isoformat(),
                    _norm(line.supplierText),
                    _norm(line.texts.get("category")),
                    str(line.net),
                    _norm(line.texts.get("project")),
                    _norm(line.texts.get("unit")),
                    _norm(line.texts.get("center")),
                    _norm(line.texts.get("company")),
                    _norm(description),
                    _norm(line.barcode),
                    _norm(line.document),
                ]
            )
            seen[base] += 1  # duas linhas iguais no arquivo são duas contas
            line.key = hash_statement_key(f"relatorio|{base}#{seen[base]}")
        lines.append(line)
    return lines


# ---- Achar cada cadastro ----


@dataclass
class Lookups:
    companies: Index
    companiesById: dict[int, Company]
    units: Index
    centers: Index
    categories: Index
    methods: Index
    suppliers: Index
    accounts: list[BankAccount]
    projects: Index
    category: ExpenseCategory | None
    method: PaymentMethod | None
    unit: BusinessUnit | None
    center: CostCenter | None
    project: Project | None
    account: BankAccount | None
    registerPayments: bool
    closed: dict[tuple[int, str], bool] = field(default_factory=dict)


def _lookups(db: Session, fields: ReportFields, positions: dict[str, int]) -> Lookups:
    category = None
    if fields.categoryId is not None:
        category = _active(db, ExpenseCategory, fields.categoryId, "Plano de contas")
        if category.kind != "despesa":
            raise PayableInvalid("Contas a pagar usam conta de despesa")
    method = (
        _active(db, PaymentMethod, fields.paymentMethodId, "Forma de pagamento")
        if fields.paymentMethodId is not None
        else None
    )
    if method is None and "method" not in positions:
        raise PayableInvalid("O relatório não traz a forma de pagamento. Marque uma na tela")
    project = None
    if fields.projectId is not None:
        project = db.get(Project, fields.projectId)
        if project is None:
            raise PayableInvalid("Projeto não encontrado")
        if project.status == "encerrado":
            raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
        if not project.active:
            raise PayableConflict(inactive_project(project))

    def active(model: Any) -> list[Any]:
        return db.query(model).filter(model.active.is_(True)).all()

    companies = db.query(Company).all()
    categories = [c for c in active(ExpenseCategory) if c.kind == "despesa"]
    return Lookups(
        companies=_index(
            [c for c in companies if c.active], lambda c: [c.name, c.nickname, c.code]
        ),
        companiesById={c.id: c for c in companies},
        units=_index(active(BusinessUnit), lambda u: [u.name]),
        centers=_index(
            active(CostCenter),
            lambda c: [c.name, c.path, c.code, f"{c.code} {c.name}" if c.code else None],
        ),
        categories=_index(categories, lambda c: [c.code, c.name, f"{c.code} {c.name}"]),
        methods=_index(active(PaymentMethod), lambda m: [m.name]),
        suppliers=_index(active(Supplier), lambda s: [s.nickname, s.name, s.code]),
        accounts=active(BankAccount),
        projects=_index(db.query(Project).all(), lambda p: [p.code, f"PRJ-{p.code}", p.title]),
        category=category,
        method=method,
        unit=_active(db, BusinessUnit, fields.unitId, "Unidade") if fields.unitId else None,
        center=_active(db, CostCenter, fields.costCenterId, "Centro de custo")
        if fields.costCenterId
        else None,
        project=project,
        account=_active(db, BankAccount, fields.bankAccountId, "Conta bancária")
        if fields.bankAccountId
        else None,
        registerPayments=fields.registerPayments,
    )


def _match(index: Index, text: str | None) -> list[Any]:
    return index.get(_norm(text), []) if text else []


def _by_name(
    line: Row,
    index: Index,
    key: str,
    default: Any,
    title: str,
    article: str,
    name: Callable[[Any], str],
    lowest: bool = False,
) -> Any | None:
    """Plano de contas, centro de custo e forma de pagamento: pelo nome do relatório; sem achar,
    o padrão marcado na tela; sem padrão, a linha fica de fora. Com `lowest`, o nome repetido no
    cadastro usa o de código menor (o plano de contas do sistema antigo tem contas repetidas)."""
    text = line.texts.get(key, "")
    found = _match(index, text)
    if len(found) == 1:
        return found[0]
    if len(found) > 1 and lowest:
        chosen = min(found, key=lambda record: (record.code, record.id))
        line.notes.append(f"{title} {text} aparece mais de uma vez: usada {name(chosen)}")
        return chosen
    if len(found) > 1:
        line.errors.append(f"{title} {text} aparece mais de uma vez no cadastro")
        return None
    if default is not None:
        if text:
            line.notes.append(f"{title} {text} não existe: usado {name(default)}")
            line.usedDefault = True
        return default
    line.errors.append(
        f"{title} {text} não existe. Cadastre ou marque um padrão na tela"
        if text
        else f"Sem {article} na linha e nenhum padrão marcado na tela"
    )
    return None


def _unit_and_company(line: Row, look: Lookups) -> None:
    """A empresa vem da unidade. A coluna Empresa só ajuda quando o mesmo nome de unidade existe em
    mais de uma empresa."""
    typed_company = _match(look.companies, line.texts.get("company"))
    company = typed_company[0] if len(typed_company) == 1 else None
    text = line.texts.get("unit", "")
    candidates = _match(look.units, text)
    if company is not None:
        candidates = [unit for unit in candidates if unit.company_id == company.id]
    unit: BusinessUnit
    if len(candidates) == 1:
        unit = candidates[0]
    elif len(candidates) > 1:
        line.errors.append(
            f"Unidade {text} existe em mais de uma empresa: o relatório precisa trazer a empresa"
        )
        return
    elif look.unit is not None:
        unit = look.unit
        if company is not None and unit.company_id != company.id:
            line.errors.append(f"A unidade padrão {unit.name} não é da empresa {company.label}")
            return
        if text:
            line.notes.append(f"Unidade {text} não existe: usada {unit.name}")
            line.usedDefault = True
    else:
        line.errors.append(
            f"Unidade {text} não existe. Cadastre ou marque um padrão na tela"
            if text
            else "Sem unidade na linha e nenhuma unidade padrão marcada na tela"
        )
        return
    owner = look.companiesById.get(unit.company_id)
    if owner is None or not owner.active:
        line.errors.append(f"A empresa da unidade {unit.name} está inativa")
        return
    line.unit, line.company = unit, owner


def _bank_account(line: Row, look: Lookups) -> None:
    """A conta da linha paga: pelo nome da conta ou do banco, entre as da empresa."""
    if line.company is None:
        return
    text = line.texts.get("account", "")
    typed = _norm(text)
    mine = [a for a in look.accounts if a.company_id == line.company.id]
    found = [a for a in mine if typed and typed in {_norm(a.name), _norm(a.bankName)}]
    if not found and typed:
        # "Banco Itaú" acha a conta "Itaú · PPlus" (o texto sem "Banco" dentro do nome da conta) e a
        # conta de banco "Itaú" (o nome do banco dentro do texto).
        core = re.sub(r"^banco\s+", "", typed)
        found = [
            a for a in mine if core in _norm(a.name) or (a.bankName and _norm(a.bankName) in typed)
        ]
    default = look.account
    if len(found) > 1 and default in found:
        found = [default]
    if len(found) == 1:
        line.account = found[0]
    elif len(found) > 1:
        line.errors.append(
            f"Conta {text} aparece mais de uma vez na empresa {line.company.label}: "
            "marque a conta padrão na tela"
        )
    elif default is not None and default.company_id == line.company.id:
        line.account = default
        if text:
            line.notes.append(f"Conta {text} não existe: usada {default.name}")
            line.usedDefault = True
    elif default is not None:
        line.errors.append(f"A conta padrão {default.name} não é da empresa {line.company.label}")
    else:
        line.errors.append(
            f"Conta bancária {text} não existe na empresa {line.company.label}"
            if text
            else "Linha paga sem conta bancária e nenhuma conta padrão marcada na tela"
        )


def _project(line: Row, look: Lookups) -> None:
    text = line.texts.get("project", "")
    found = _match(look.projects, text)
    if len(found) > 1 and line.company is not None:
        # o mesmo número em duas empresas (24/11): vale o da empresa da linha
        found = [p for p in found if p.company_id == line.company.id] or found
    if len(found) > 1:
        line.errors.append(f"Projeto {text} aparece mais de uma vez no cadastro")
    elif len(found) == 1 and found[0].status != "encerrado" and found[0].active:
        line.project = found[0]
    elif len(found) == 1:
        why = "fechado" if found[0].status == "encerrado" else "inativo"
        line.notes.append(f"Projeto {text} está {why}: a conta entra sem projeto")
    elif look.project is not None:
        line.project = look.project
        if text:
            line.notes.append(f"Projeto {text} não existe: usado PRJ-{look.project.code}")
            line.usedDefault = True
    elif text:
        line.notes.append(f"Projeto {text} não existe: a conta entra sem projeto")


def _closed_text(day: date) -> str:
    return f"O período de {period_lock.month_name(day.strftime('%Y-%m'))} está fechado"


def _closed(db: Session, look: Lookups, company: Company, day: date) -> bool:
    key = (company.id, day.strftime("%Y-%m"))
    if key not in look.closed:
        look.closed[key] = period_lock.is_closed(db, company.id, day)
    return look.closed[key]


def _resolve(db: Session, look: Lookups, lines: list[Row]) -> None:
    for line in lines:
        if line.skipped is not None:
            continue  # a prévia mostra todos os problemas da linha de uma vez
        found = _match(look.suppliers, line.supplierText)
        if len(found) > 1:
            # dois cadastros com o mesmo nome (o sistema antigo tem): a conta não fica de fora,
            # entra só com o nome, como a do fornecedor que não está nos cadastros (24/11)
            line.notes.append(
                f"Fornecedor {line.supplierText} aparece mais de uma vez no cadastro: "
                "entra só com o nome"
            )
        elif found:
            line.supplier = found[0]
        else:
            line.notes.append(
                f"Fornecedor {line.supplierText} não está nos cadastros: entra só com o nome"
            )
        line.category = _by_name(
            line,
            look.categories,
            "category",
            look.category,
            "Plano de contas",
            "plano de contas",
            lambda c: f"{c.code} {c.name}",
            lowest=True,  # decisão do Bruno, 24/11: a conta repetida usa a de código menor
        )
        line.center = _by_name(
            line,
            look.centers,
            "center",
            look.center,
            "Centro de custo",
            "centro de custo",
            lambda c: c.path,
        )
        line.method = _by_name(
            line,
            look.methods,
            "method",
            look.method,
            "Forma de pagamento",
            "forma de pagamento",
            lambda m: m.name,
        )
        _unit_and_company(line, look)
        _project(line, look)  # depois da empresa: o número pode repetir em outra
        if line.company is None:
            continue
        if line.scheduled is not None and _closed(db, look, line.company, line.scheduled):
            line.errors.append(_closed_text(line.scheduled))
        if line.paid > 0 and look.registerPayments:
            _bank_account(line, look)
            if line.paidOn is not None and _closed(db, look, line.company, line.paidOn):
                message = _closed_text(line.paidOn)
                if message not in line.errors:  # programação e pagamento no mesmo mês: um aviso só
                    line.errors.append(message)


def _mark_already_imported(db: Session, lines: list[Row]) -> None:
    keys = [line.key for line in lines if line.key and line.skipped is None]
    existing: set[str] = set()
    for start in range(0, len(keys), KEY_CHUNK):
        chunk = keys[start : start + KEY_CHUNK]
        rows = db.query(Payable.importKey).filter(Payable.importKey.in_(chunk)).all()
        existing.update(key for (key,) in rows)
    for line in lines:
        if line.key in existing and line.skipped is None:
            line.skipped = ALREADY


def _prepare(
    db: Session, fields: ReportFields, filename: str, content: bytes
) -> tuple[list[Row], dict[str, int]]:
    rows = _sheet(filename, content)
    at, positions = _header(rows)
    look = _lookups(db, fields, positions)
    lines = _parse(rows, at, positions)
    _mark_already_imported(db, lines)
    _resolve(db, look, lines)
    return lines, positions


# ---- Prévia e importação ----


def _will_pay(line: Row, fields: ReportFields) -> bool:
    return line.enters and line.paid > 0 and fields.registerPayments


def preview(db: Session, fields: ReportFields, filename: str, content: bytes) -> dict[str, Any]:
    """Confere o relatório, sem gravar nada."""
    lines, positions = _prepare(db, fields, filename, content)
    good = [line for line in lines if line.enters]
    paying = [line for line in good if _will_pay(line, fields)]
    total = sum((line.net for line in good if line.net), ZERO)
    paid_total = sum((line.paid for line in paying), ZERO)
    return {
        "columns": [LABELS[key] for key in LABELS if key in positions],
        "goodCount": len(good),
        "paidCount": len(paying),
        "pendingCount": len(good) - len(paying),
        "errorCount": sum(1 for line in lines if line.errors),
        "cancelledCount": sum(1 for line in lines if line.skipped == CANCELLED),
        "alreadyCount": sum(1 for line in lines if line.skipped == ALREADY),
        "supplierOnlyNameCount": sum(1 for line in good if line.supplier is None),
        "noProjectCount": sum(1 for line in good if line.project is None),
        "usedDefaultCount": sum(1 for line in good if line.usedDefault),
        "total": total,
        "paidTotal": paid_total,
        "pendingTotal": total - paid_total,
        "lines": [_line(line, fields) for line in lines],
    }


def _classification(line: Row) -> str | None:
    if not (line.company and line.unit and line.center and line.category):
        return None
    return " · ".join(
        [
            line.company.label,
            line.unit.name,
            line.center.path,
            f"{line.category.code} {line.category.name}",
        ]
    )


def _line(line: Row, fields: ReportFields) -> dict[str, Any]:
    return {
        "line": line.row,
        "scheduled": line.scheduled,
        "dueDate": line.due,
        "paidOn": line.paidOn if line.paid > 0 else None,
        "supplier": line.supplierText,
        "description": line.description,
        "net": line.net,
        "paid": line.paid,
        "classification": _classification(line),
        "account": line.account.name if line.account else None,
        "project": f"PRJ-{line.project.code}" if line.project else None,
        "willPay": _will_pay(line, fields),
        "skipped": line.skipped,
        "notes": line.notes,
        "errors": line.errors,
    }


def _payable(user: User, line: Row, fields: ReportFields, file_hash: str) -> Payable:
    assert line.scheduled and line.due and line.net is not None  # só entra linha sem erro
    assert line.company and line.unit and line.center and line.category and line.method
    payments = []
    if _will_pay(line, fields):
        assert line.account and line.paidOn
        payments.append(
            PayablePayment(
                paidOn=line.paidOn,
                amount=line.paid,
                bank_account_id=line.account.id,
                payment_method_id=line.method.id,
                note=PAYMENT_NOTE,
                created_by_user_id=user.id,
            )
        )
    return Payable(
        type="real",
        origin="relatorio",
        supplier_id=line.supplier.id if line.supplier else None,
        payeeName=None if line.supplier else line.supplierText,
        category_id=line.category.id,
        company_id=line.company.id,
        unit_id=line.unit.id,
        cost_center_id=line.center.id,
        payment_method_id=line.method.id,
        issueDate=line.scheduled,
        dueDate=line.due,
        amount=line.net,
        description=line.description or f"{line.supplierText} · {line.category.name}"[:255],
        documentNumber=line.document,
        barcode=line.barcode,
        competence=line.due.strftime("%Y-%m"),
        importHash=file_hash,
        importKey=line.key,
        created_by_user_id=user.id,
        allocations=[PayableAllocation(project_id=line.project.id, amount=line.net)]
        if line.project
        else [],
        payments=payments,
    )


def confirm(
    db: Session, fields: ReportFields, filename: str, content: bytes, user: User
) -> dict[str, Any]:
    """Cria as contas (e as baixas das pagas), todas ou nenhuma. O arquivo não fica guardado."""
    lines, _ = _prepare(db, fields, filename, content)
    good = [line for line in lines if line.enters]
    if not good:
        if any(line.skipped == ALREADY for line in lines) and not any(
            line.errors for line in lines
        ):
            raise PayableInvalid("Todas as linhas deste relatório já foram importadas antes")
        raise PayableInvalid("Nenhuma linha do relatório pode entrar. Corrija e envie de novo")
    shown_name = re.split(r"[\\/]", filename)[-1][:100]
    file_hash = _file_hash(content)
    paying = [line for line in good if _will_pay(line, fields)]
    try:
        for line in good:
            payable = _payable(user, line, fields, file_hash)
            db.add(payable)
            db.flush()
            paid = (
                f"; paga em {format_date_br(line.paidOn)}, {format_brl(line.paid)}"
                if line.paidOn and _will_pay(line, fields)
                else ""
            )
            payable_service.audit(
                db,
                payable,
                user,
                f"Importado do relatório do sistema antigo ({shown_name}, linha {line.row}){paid}",
            )
    except IntegrityError as exc:
        raise PayableConflict(
            "Parte deste relatório acabou de ser importada por outra pessoa. "
            "Confira de novo e envie outra vez"
        ) from exc
    db.commit()
    total = sum((line.net for line in good if line.net), ZERO)
    paid_total = sum((line.paid for line in paying), ZERO)
    return {
        "count": len(good),
        "paidCount": len(paying),
        "total": total,
        "paidTotal": paid_total,
        "pendingTotal": total - paid_total,
    }

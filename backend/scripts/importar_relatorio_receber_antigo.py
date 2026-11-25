"""Popula o Contas a receber com o relatório "Lançamentos a Receber" do sistema antigo (SGE4B).

É o mesmo relatório do "Lançamentos a Pagar", com Cliente no lugar de Fornecedor, e a mesma leitura
(services/report_import.py): linhas TOTAL e canceladas ficam de fora, o CPF sai do texto, a linha
digitável do boleto sai da descrição. Cada linha vira um título a receber; a linha paga ganha o
recebimento (data do Pagamento, R$ Pago, a conta bancária da coluna Conta e a forma "Não informada
(sistema antigo)"). Os cadastros vêm antes (importar_cadastros.py): cliente, plano de contas de
receita, empresa, unidade, centro de custo e projeto são achados pelo nome ou pelo código antigo;
só a conta bancária e a forma de recebimento são criadas se faltarem.

Uso (o arquivo entra pela entrada padrão, é lido em memória e não fica guardado):
    python scripts/importar_relatorio_receber_antigo.py --email voce@... --nome rel.htm < rel.htm

Sem --gravar, só mostra a prévia. Rodar de novo não repete: o título com o mesmo cliente, documento,
valor e vencimento já está lá.
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from core.permissions import FINANCE_ROLES  # noqa: E402
from core.text import format_brl, format_date_br  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.receivable import Receivable, ReceivablePayment  # noqa: E402
from models.reference import (  # noqa: E402
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from schemas.receivable import ReceivableCreate  # noqa: E402
from services import period_lock, records, report_import  # noqa: E402
from services import receivable as receivable_service  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.payable import PayableConflict, PayableInvalid  # noqa: E402
from services.payable_import import MAX_BYTES  # noqa: E402
from services.report_import import COLUMNS, HEADER_SCAN, Row, _index, _match, _norm  # noqa: E402

METHOD = "Não informada (sistema antigo)"
NOTE = "Importado do relatório do sistema antigo"
# O relatório a receber traz Cliente onde o a pagar traz Fornecedor; o resto é igual.
RECEIVABLE_COLUMNS = {**COLUMNS, "cliente": "supplier"}
DOCUMENT_TYPES = (("nf", "NF"), ("fatura", "Fatura"), ("invoice", "Invoice"))


@dataclass
class Line:
    row: Row
    data: ReceivableCreate | None = None
    account: BankAccount | None = None
    errors: list[str] = field(default_factory=list)
    skipped: str | None = None


def _header(rows: list[tuple[Any, ...]]) -> tuple[int, dict[str, int]]:
    for at, row in enumerate(rows[:HEADER_SCAN]):
        positions: dict[str, int] = {}
        for index, title in enumerate(row):
            key = RECEIVABLE_COLUMNS.get(_norm(title))
            if key and key not in positions:
                positions[key] = index
        if {"scheduled", "supplier", "net"} <= positions.keys():
            return at, positions
    raise PayableInvalid(
        "Não achei o cabeçalho do relatório: ele precisa das colunas Programação, Cliente e "
        "R$ Líquido"
    )


def _one(found: list[Any], what: str, text: str, required: bool, line: Line) -> Any:
    if len(found) == 1:
        return found[0]
    if len(found) > 1:
        line.errors.append(f"{what} {text} aparece mais de uma vez no cadastro")
    elif text or required:
        line.errors.append(
            f"{what} {text} não existe: importe os cadastros antes"
            if text
            else f"Sem {what.lower()}"
        )
    return None


def _document(text: str | None, day: Any) -> dict[str, Any]:
    """ "NF 1482" é nota fiscal, "FATURA 392" é fatura. A NF precisa da data de emissão, que o
    relatório não traz: fica a da programação."""
    if not text:
        return {"documentType": "Sem documento"}
    for prefix, kind in DOCUMENT_TYPES:
        found = re.match(rf"{prefix}\b\.?\s*(.*)", text, re.IGNORECASE)
        if found and found.group(1):
            return {
                "documentType": kind,
                "documentNumber": found.group(1)[:100],
                "documentDate": day if kind == "NF" else None,
            }
    return {"documentType": "Sem documento", "documentNumber": text[:100]}


class _Registers:
    """Os cadastros, lidos uma vez e achados como o relatório a pagar acha."""

    def __init__(self, db: Session) -> None:
        def active(model: Any) -> list[Any]:
            return list(db.query(model).filter(model.active.is_(True)))

        self.db = db
        self.customers = _index(
            active(Customer), lambda c: [c.nickname, c.name, c.code, c.legacyCode]
        )
        incomes = [c for c in active(ExpenseCategory) if c.kind == "receita"]
        self.categories = _index(incomes, lambda c: [c.code, c.name, f"{c.code} {c.name}"])
        self.companies = _index(
            active(Company), lambda c: [c.name, c.nickname, c.code, c.legacyCode]
        )
        self.units = _index(active(BusinessUnit), lambda u: [u.name, u.legacyCode])
        self.centers = _index(active(CostCenter), lambda c: [c.name, c.path, c.code, c.legacyCode])
        self.projects = _index(
            list(db.query(Project)), lambda p: [p.code, f"PRJ-{p.code}", p.title, p.legacyCode]
        )
        self.accounts = active(BankAccount)
        self.created: list[str] = []
        self.method = self._method()

    def _method(self) -> PaymentMethod:
        for method in self.db.query(PaymentMethod).filter(PaymentMethod.active.is_(True)):
            if _norm(method.name) == _norm(METHOD):
                return method
        method = PaymentMethod(name=METHOD)
        self.db.add(method)
        self.db.flush()
        self.created.append(f"Forma de pagamento: {METHOD}")
        return method

    def account(self, company: Company, text: str, user: User) -> BankAccount:
        """A conta do recebimento: pelo nome da conta ou do banco, entre as da empresa; sem achar,
        cria (como o relatório a pagar)."""
        typed = _norm(text)
        core = re.sub(r"^banco\s+", "", typed)
        mine = [a for a in self.accounts if a.company_id == company.id]
        found = [a for a in mine if typed in {_norm(a.name), _norm(a.bankName)}] or [
            a for a in mine if core and core in _norm(a.name)
        ]
        if found:
            return found[0]
        account = BankAccount(company_id=company.id, name=text[:100])
        self.db.add(account)
        self.db.flush()
        records._log(
            self.db, "bankAccounts", account.id, user, f"Cadastrou {account.name} ({NOTE})"
        )
        self.accounts.append(account)
        self.created.append(f"Conta bancária: {account.name} ({company.label})")
        return account


def _resolve(db: Session, look: _Registers, line: Line, user: User) -> None:
    row = line.row
    texts = row.texts
    customer = _one(
        _match(look.customers, row.supplierText), "Cliente", row.supplierText, True, line
    )
    found = _match(look.categories, texts.get("category"))
    # o plano antigo tem contas repetidas: vale a de código menor (decisão do Bruno, 24/11)
    category = min(found, key=lambda c: (c.code, c.id)) if found else None
    if category is None:
        line.errors.append(
            f"Plano de contas {texts.get('category', '')} não existe entre as contas de receita"
        )
    company = _one(
        _match(look.companies, texts.get("company")),
        "Empresa",
        texts.get("company", ""),
        True,
        line,
    )
    unit = None
    if company is not None and texts.get("unit"):
        mine = [u for u in _match(look.units, texts["unit"]) if u.company_id == company.id]
        unit = _one(mine, "Unidade", texts["unit"], False, line)
    center = _one(
        _match(look.centers, texts.get("center")),
        "Centro de custo",
        texts.get("center", ""),
        True,
        line,
    )
    project = None
    if texts.get("project"):
        found = _match(look.projects, texts["project"])
        if company is not None and len(found) > 1:
            found = [p for p in found if p.company_id == company.id] or found
        project = found[0] if len(found) == 1 and found[0].active else None
    if line.errors or customer is None or category is None or company is None or center is None:
        return
    assert row.scheduled and row.net is not None
    if row.paid > 0 and row.paidOn is not None:
        line.account = look.account(company, texts.get("account") or "Conta não informada", user)
        if period_lock.is_closed(db, company.id, row.paidOn):
            line.errors.append(f"O período de {row.paidOn.strftime('%m/%Y')} está fechado")
            return
    try:
        line.data = ReceivableCreate(
            customerId=customer.id,
            projectId=project.id if project else None,
            companyId=company.id,
            unitId=unit.id if unit else None,
            costCenterId=center.id,
            categoryId=category.id,
            description=row.description or f"{row.supplierText} · {category.name}"[:255],
            issueDate=row.scheduled,
            dueDate=row.due or row.scheduled,
            amount=row.net,
            **_document(row.document, row.scheduled),
        )
    except ValidationError as exc:
        line.errors.append(f"Linha inválida: {', '.join(str(e['loc'][0]) for e in exc.errors())}")


def _already(db: Session, data: ReceivableCreate) -> bool:
    return (
        db.query(Receivable.id)
        .filter_by(
            customer_id=data.customerId,
            documentNumber=data.documentNumber,
            amount=data.amount,
            dueDate=data.dueDate,
        )
        .first()
        is not None
    )


def importar(db: Session, email: str, filename: str, content: bytes, write: bool) -> str:
    """Prévia (sem gravar) ou importação, num commit só com todas as linhas boas."""
    if len(content) > MAX_BYTES:
        raise PayableInvalid("O relatório passa de 5 MB. Divida em arquivos menores")
    user = (
        db.query(User).filter(User.email == normalize_email(email), User.status == "active").first()
    )
    if user is None or user.role not in FINANCE_ROLES:
        raise PayableInvalid(f"Não achei uma conta ativa do Financeiro com o e-mail {email}")
    rows = report_import._sheet(filename, content)
    at, positions = _header(rows)
    lines = [Line(row) for row in report_import._parse(rows, at, positions)]
    try:
        look = _Registers(db)
        for line in lines:
            # a leitura é a do relatório a pagar: lá a coluna se chama Fornecedor
            line.errors = [e.replace("Sem fornecedor", "Sem cliente") for e in line.row.errors]
            line.skipped = line.row.skipped
            if line.skipped is None and not line.errors:
                _resolve(db, look, line, user)
            if line.data is not None and _already(db, line.data):
                line.skipped = "Já importada antes"
        good = [line for line in lines if line.data and not line.errors and not line.skipped]
        for line in good:
            assert line.data is not None
            receivable = receivable_service.new_receivable(db, line.data, user)
            receivable_service.audit(
                db, receivable, user, f"{NOTE} ({filename[:100]}, linha {line.row.row})"
            )
            if line.account is not None and line.row.paidOn is not None:
                db.add(
                    ReceivablePayment(
                        receivable_id=receivable.id,
                        receivedOn=line.row.paidOn,
                        amount=line.row.paid,
                        bank_account_id=line.account.id,
                        payment_method_id=look.method.id,
                        note=NOTE,
                        created_by_user_id=user.id,
                    )
                )
                receivable_service.audit(
                    db,
                    receivable,
                    user,
                    f"Recebimento de {format_brl(line.row.paid)} em "
                    f"{format_date_br(line.row.paidOn)} ({line.account.name}; {NOTE})",
                )
        if write:
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    return _summary(lines, good, look.created, filename, write)


def _summary(
    lines: list[Line], good: list[Line], created: list[str], filename: str, write: bool
) -> str:
    total = sum((line.row.net or Decimal("0") for line in good), Decimal("0"))
    received = sum((line.row.paid for line in good if line.account), Decimal("0"))
    out = [f"Relatório a receber {filename}"]
    if created:
        out.append(f"{'Cadastrados' if write else 'Serão cadastrados'} (não existiam):")
        out += [f"  {item}" for item in created]

    def count(reason: str) -> int:
        return sum(1 for line in lines if line.skipped == reason)

    wrong = [line for line in lines if line.errors and not line.skipped]
    out.append(
        f"Títulos: {len(good)} entram ({sum(1 for line in good if line.account)} recebidos, com a "
        f"baixa) · {count(report_import.CANCELLED)} cancelados · {count('Já importada antes')} já "
        f"importados antes · {len(wrong)} com erro"
    )
    out.append(
        f"Total {format_brl(total)}, recebido {format_brl(received)}, "
        f"a receber {format_brl(total - received)}"
    )
    if wrong:
        out.append("Ficam de fora:")
        out += [f"  linha {line.row.row}: {'; '.join(line.errors)}" for line in wrong]
    out.append("Gravado." if write else "Nada foi gravado. Para gravar, rode de novo com --gravar.")
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="quem importa (vai para o histórico)")
    parser.add_argument(
        "--nome", required=True, help="o nome do arquivo: .xls, .htm, .xlsx ou .csv"
    )
    parser.add_argument("--gravar", action="store_true", help="sem isto, só a prévia")
    args = parser.parse_args()
    if sys.stdin.isatty():
        sys.exit("Mande o relatório pela entrada: ... --nome relatorio.htm < relatorio.htm")
    content = sys.stdin.buffer.read(MAX_BYTES + 1)
    db = SessionLocal()
    try:
        print(importar(db, args.email, args.nome, content, args.gravar))
    except (PayableInvalid, PayableConflict) as exc:
        sys.exit(str(exc))
    finally:
        db.close()


if __name__ == "__main__":
    main()

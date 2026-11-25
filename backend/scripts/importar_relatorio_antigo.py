"""Popula o Contas a pagar com o relatório "Lançamentos a Pagar" do sistema antigo (SGE4B).

Para o banco que começa vazio (Q51): cria os cadastros que o relatório usa e ainda não existem
(empresa, unidade, centro de custo, plano de contas, conta bancária e a forma de pagamento
"Não informada (sistema antigo)") e importa as contas com a mesma regra da tela Importar planilha.
Fornecedor e projeto não são cadastrados: a conta guarda o nome do fornecedor e fica sem projeto.

Uso (o arquivo entra pela entrada padrão, é lido em memória e não fica guardado):
    python scripts/importar_relatorio_antigo.py --email voce@... --nome rel.xls < rel.xls

Sem --gravar, só mostra a prévia. Rodar de novo (ou com um relatório mais novo) só cria o que falta.
No servidor: make importar-relatorio (guia: DEPLOY.md).
"""

import argparse
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session  # noqa: E402

from core.permissions import FINANCE_ROLES  # noqa: E402
from core.text import format_brl  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.reference import (  # noqa: E402
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    RecordCounter,
)
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from schemas.payable import ReportFields  # noqa: E402
from services import records, report_import  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.payable import PayableConflict, PayableInvalid  # noqa: E402
from services.payable_import import MAX_BYTES  # noqa: E402
from services.report_import import Lookups, Row, _match, _norm  # noqa: E402

METHOD = "Não informada (sistema antigo)"
CATEGORY_PREFIX = "SGE-"
ORIGIN = " (relatório do sistema antigo)"


class _Created:
    """O que o relatório usa e não existia: cria na sessão aberta (sem commit) e anota."""

    def __init__(self, db: Session, user: User) -> None:
        self.db, self.user = db, user
        self.items: dict[str, list[str]] = {}

    def add(self, kind: str, title: str, record: Any, shown: str) -> Any:
        self.db.add(record)
        self.db.flush()
        records._log(self.db, kind, record.id, self.user, f"Cadastrou {record.name}{ORIGIN}")
        self.items.setdefault(title, []).append(shown)
        return record


def _index(index: dict[str, list[Any]], text: str, record: Any) -> None:
    index.setdefault(_norm(text), []).append(record)


def _category_codes(db: Session) -> Callable[[], str]:
    taken = {code for (code,) in db.query(ExpenseCategory.code)}
    number = 0

    def following() -> str:
        nonlocal number
        while True:
            number += 1
            code = f"{CATEGORY_PREFIX}{number:03d}"
            if code not in taken:
                taken.add(code)
                return code

    return following


def _company(new: _Created, look: Lookups, text: str) -> Company | None:
    found = _match(look.companies, text)
    if found:
        return found[0] if len(found) == 1 else None  # repetido: a importação diz na linha
    company = new.add(
        "companies",
        "Empresas",
        Company(name=text[:200], code=records._next_code(new.db, "companies")),
        text[:200],
    )
    _index(look.companies, text, company)
    return company


def _unit(new: _Created, look: Lookups, company: Company, text: str) -> None:
    if any(unit.company_id == company.id for unit in _match(look.units, text)):
        return
    unit = BusinessUnit(
        company_id=company.id, name=text[:100], code=records._next_code(new.db, "units")
    )
    new.add("units", "Unidades", unit, f"{unit.name} ({company.label})")
    _index(look.units, text, unit)


def _center(new: _Created, look: Lookups, text: str) -> None:
    if _match(look.centers, text):
        return
    center = CostCenter(name=text[:100], code=records._next_cost_center_code(new.db, None))
    new.add("costCenters", "Centros de custo", center, f"{center.code} {center.name}")
    # o contador dos sub-centros nasce com o principal, como em Cadastros
    new.db.add(RecordCounter(kind=f"costCenters:{center.id}", lastValue=0))
    _index(look.centers, text, center)


def _category(new: _Created, look: Lookups, text: str, code: Callable[[], str]) -> None:
    if _match(look.categories, text):
        return
    category = ExpenseCategory(code=code(), name=text[:100], kind="despesa")
    new.add("categories", "Plano de contas", category, f"{category.code} {category.name}")
    _index(look.categories, text, category)


def _account(new: _Created, look: Lookups, company: Company, text: str) -> None:
    probe = Row(row=0, texts={"account": text})
    probe.company = company
    report_import._bank_account(probe, look)  # procura como a importação procura
    if probe.errors != [f"Conta bancária {text} não existe na empresa {company.label}"]:
        return  # achou, ou achou mais de uma (a importação diz na linha)
    account = BankAccount(company_id=company.id, name=text[:100])
    new.add("bankAccounts", "Contas bancárias", account, f"{account.name} ({company.label})")
    look.accounts.append(account)


def _method(new: _Created) -> PaymentMethod:
    found = [
        method
        for method in new.db.query(PaymentMethod).filter(PaymentMethod.active.is_(True))
        if _norm(method.name) == _norm(METHOD)
    ]
    if found:
        return found[0]
    return new.add("paymentMethods", "Forma de pagamento", PaymentMethod(name=METHOD), METHOD)


def _registers(new: _Created, filename: str, content: bytes) -> ReportFields:
    """Cria os cadastros que as linhas usam e não existem; devolve os padrões da importação."""
    rows = report_import._sheet(filename, content)
    at, positions = report_import._header(rows)
    fields = ReportFields(paymentMethodId=_method(new).id, registerPayments=True)
    look = report_import._lookups(new.db, fields, positions)
    code = _category_codes(new.db)
    for line in report_import._parse(rows, at, positions):
        if line.skipped is not None or line.errors:
            continue  # cancelada ou com erro na leitura: não entra, não cadastra nada
        texts = line.texts
        if texts.get("center"):
            _center(new, look, texts["center"])
        if texts.get("category"):
            _category(new, look, texts["category"], code)
        company = _company(new, look, texts["company"]) if texts.get("company") else None
        if company is None:
            continue  # sem empresa, a unidade não tem dono: a importação diz o motivo na linha
        if texts.get("unit"):
            _unit(new, look, company, texts["unit"])
        if line.paid > 0 and texts.get("account"):
            _account(new, look, company, texts["account"])
    return fields


def _summary(result: dict[str, Any], new: _Created, filename: str, write: bool) -> str:
    verb = "Cadastrados" if write else "Serão cadastrados"
    out = [f"Relatório {filename}"]
    if new.items:
        out.append(f"{verb} (não existiam):")
        out += [f"  {title}: {', '.join(names)}" for title, names in new.items.items()]
    else:
        out.append("Todos os cadastros que o relatório usa já existem.")
    out.append(
        f"Contas: {result['goodCount']} entram ({result['paidCount']} pagas, com a baixa;"
        f" {result['pendingCount']} a pagar) · {result['cancelledCount']} canceladas ·"
        f" {result['alreadyCount']} já importadas antes · {result['errorCount']} com erro"
    )
    out.append(
        f"Total {format_brl(result['total'])}, pago {format_brl(result['paidTotal'])},"
        f" a pagar {format_brl(result['pendingTotal'])}"
    )
    out.append(
        f"Entram só com o nome do fornecedor: {result['supplierOnlyNameCount']} ·"
        f" sem projeto: {result['noProjectCount']}"
    )
    wrong = [line for line in result["lines"] if line["errors"]]
    if wrong:
        out.append("Ficam de fora:")
        out += [f"  linha {line['line']}: {'; '.join(line['errors'])}" for line in wrong]
    out.append("Gravado." if write else "Nada foi gravado. Para gravar, rode de novo com --gravar.")
    return "\n".join(out)


def importar(db: Session, email: str, filename: str, content: bytes, write: bool) -> str:
    """Prévia (sem gravar) ou importação, num commit só com os cadastros e as contas."""
    if len(content) > MAX_BYTES:
        raise PayableInvalid("O relatório passa de 5 MB. Divida em arquivos menores")
    user = (
        db.query(User).filter(User.email == normalize_email(email), User.status == "active").first()
    )
    if user is None or user.role not in FINANCE_ROLES:
        raise PayableInvalid(f"Não achei uma conta ativa do Financeiro com o e-mail {email}")
    new = _Created(db, user)
    try:
        fields = _registers(new, filename, content)
        # a prévia sempre, para listar as linhas que ficam de fora também quando grava
        result = report_import.preview(db, fields, filename, content)
        if write:
            report_import.confirm(db, fields, filename, content, user)
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    return _summary(result, new, filename, write)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="quem importa (vai para o histórico)")
    parser.add_argument("--nome", required=True, help="o nome do arquivo: .xls, .xlsx ou .csv")
    parser.add_argument("--gravar", action="store_true", help="sem isto, só a prévia")
    args = parser.parse_args()
    if sys.stdin.isatty():
        sys.exit("Mande o relatório pela entrada: ... --nome relatorio.xls < relatorio.xls")
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

"""Os percentuais dos impostos retidos que toda conta a pagar nova já traz (Bruno, 19/11/2026).

A tela calcula cada imposto sobre o valor principal, e a pessoa pode mudar o valor na conta. Sem
linha na tabela, vale o padrão abaixo; trocar em Cadastros grava a linha e o histórico, e vale para
as contas novas daqui para frente.
"""

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models.reference import RecordEvent, TaxRate
from models.user import User
from schemas.tax_rates import TaxRateIn
from services.payable import PayableInvalid

KIND = "taxRates"
# Na ordem da janela de impostos.
DEFAULTS: tuple[tuple[str, str, Decimal], ...] = (
    ("pis", "PIS", Decimal("0.65")),
    ("cofins", "COFINS", Decimal("3.00")),
    ("csll", "CSLL", Decimal("1.00")),
    ("ir", "IR", Decimal("1.50")),
)
NAMES = {code: name for code, name, _ in DEFAULTS}
INVALID_RATE = "Use um percentual entre 0 e 100, com até 2 casas, como 1,5"


def _percent(rate: Decimal) -> str:
    """ "1.50" vira "1,5%", "3.00" vira "3%"."""
    return f"{rate.normalize():f}".replace(".", ",") + "%"


def list_rates(db: Session) -> list[dict[str, Any]]:
    stored = {row.code: row.rate for row in db.query(TaxRate).all()}
    return [
        {"code": code, "name": name, "rate": stored.get(code, default)}
        for code, name, default in DEFAULTS
    ]


def _check(items: list[TaxRateIn]) -> None:
    seen: set[str] = set()
    for item in items:
        if item.code not in NAMES:
            raise PayableInvalid("Imposto desconhecido")
        if item.code in seen:
            raise PayableInvalid("Cada imposto aparece uma vez só")
        seen.add(item.code)
        exponent = item.rate.as_tuple().exponent
        if (
            not item.rate.is_finite()
            or item.rate < 0
            or item.rate > 100
            or (isinstance(exponent, int) and exponent < -2)
        ):
            raise PayableInvalid(INVALID_RATE)


def update_rates(db: Session, items: list[TaxRateIn], user: User) -> list[dict[str, Any]]:
    _check(items)
    current = {row["code"]: row["rate"] for row in list_rates(db)}
    changes = []
    for item in items:
        row = db.query(TaxRate).filter(TaxRate.code == item.code).with_for_update().one_or_none()
        if row is None:
            db.add(TaxRate(code=item.code, rate=item.rate))
        elif row.rate != item.rate:
            row.rate = item.rate
        if current[item.code] != item.rate:
            changes.append(
                f"{NAMES[item.code]} {_percent(current[item.code])} → {_percent(item.rate)}"
            )
    if changes:
        # Sem um cadastro só para apontar: o histórico guarda a troca inteira numa linha.
        text = "Impostos retidos: " + "; ".join(changes)
        db.add(RecordEvent(kind=KIND, record_id=0, user_id=user.id, text=text[:500]))
    db.commit()
    return list_rates(db)

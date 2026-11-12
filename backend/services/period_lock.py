"""A trava do mês fechado: baixa, estorno, recebimento e lançamento com data de um mês fechado da
empresa são recusados, para todos. Só um administrador reabre (`services/period_closing.py`)."""

from datetime import date

from sqlalchemy.orm import Session

from models.period_closing import PeriodClosing
from services.payable import PayableConflict

MONTHS = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]


def month_name(month: str) -> str:
    """ "2026-11" vira "novembro/2026"."""
    year, number = month.split("-")
    return f"{MONTHS[int(number) - 1]}/{year}"


def is_closed(db: Session, company_id: int, day: date) -> bool:
    month = day.strftime("%Y-%m")
    return (
        db.query(PeriodClosing.id).filter_by(company_id=company_id, month=month).first() is not None
    )


def ensure_open(db: Session, company_id: int, day: date) -> None:
    """Recusa (409) o que tem data de um mês já fechado da empresa."""
    if is_closed(db, company_id, day):
        raise PayableConflict(
            f"O período de {month_name(day.strftime('%Y-%m'))} está fechado. "
            "Só um administrador pode reabrir"
        )

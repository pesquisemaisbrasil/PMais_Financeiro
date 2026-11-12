from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DifferenceDay(BaseModel):
    day: date
    extract: Decimal
    system: Decimal
    difference: Decimal


class DifferenceItem(BaseModel):
    on: date
    description: str
    amount: Decimal
    # na linha do extrato sem par: "pendente" ou "exceção"
    note: str | None = None


class DifferenceGroup(BaseModel):
    count: int
    total: Decimal
    # as primeiras, para a tela mostrar o que é
    items: list[DifferenceItem]


class Difference(BaseModel):
    """As saídas do extrato contra as baixas do sistema, no mês, com o que explica a diferença."""

    month: str
    imported: bool
    extractTotal: Decimal
    systemTotal: Decimal
    difference: Decimal
    byDay: list[DifferenceDay]
    # saídas do extrato que não são de nenhum lançamento (pendentes e exceções)
    linesWithoutPair: DifferenceGroup
    # baixas do sistema (nesta conta) que ainda não têm linha conciliada no extrato
    paymentsWithoutLine: DifferenceGroup
    # Pix devolvido no mês: a saída está no extrato e a devolução entra como crédito
    returns: DifferenceGroup


class AccountBalance(BaseModel):
    id: int
    name: str
    company: str
    accountType: str | None
    # o saldo no começo do mês: o saldo inicial da conta mais o que o extrato moveu até lá
    opening: Decimal
    income: Decimal
    expense: Decimal
    closing: Decimal
    # o saldo contando só as linhas já conciliadas (ou exceção)
    bySystem: Decimal
    toCheck: Decimal
    imported: bool


class BalanceTotals(BaseModel):
    opening: Decimal
    income: Decimal
    expense: Decimal
    closing: Decimal
    bySystem: Decimal
    toCheck: Decimal


class Balances(BaseModel):
    month: str
    accounts: list[AccountBalance]
    total: BalanceTotals

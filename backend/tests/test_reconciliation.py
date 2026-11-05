from datetime import date
from decimal import Decimal

from services.reconciliation import PendingReceipt, QueueItem, Reconciliation, reconcile


def receipt(id: int, amount: str, day: int, person: int = 1, page: int = 1) -> PendingReceipt:
    return PendingReceipt(id, person, Decimal(amount), date(2026, 2, day), page)


def queue(*amounts: str) -> list[QueueItem]:
    return [QueueItem(id=i, amount=Decimal(a)) for i, a in enumerate(amounts, start=1)]


def test_non_matching_receipt_does_not_consume_the_queue() -> None:
    # exemplo 1 do handoff/08: Pix de 30, 20, 20 e 20 para duas entrevistas de 20
    result = reconcile(
        [
            receipt(1, "30.00", 1),
            receipt(2, "20.00", 2),
            receipt(3, "20.00", 3),
            receipt(4, "20.00", 4),
        ],
        {1: queue("20.00", "20.00")},
    )
    assert [result[i].status for i in (1, 2, 3, 4)] == [
        "nao_fecha",
        "bate",
        "bate",
        "pago_a_mais",
    ]
    assert result[2].item_ids == [1]
    assert result[3].item_ids == [2]
    assert result[4].message == "Valor maior que o a pagar. Lance a produção antes de dar baixa"


def test_receipts_are_reconciled_by_payment_date_not_page() -> None:
    # exemplo 2: a página 1 tem o Pix de 40 (20/02); a página 2 tem o de 20 (18/02)
    result = reconcile(
        [receipt(1, "40.00", 20, page=1), receipt(2, "20.00", 18, page=2)],
        {1: queue("20.00", "40.00")},
    )
    assert result[2] == Reconciliation("bate", item_ids=[1])
    assert result[1] == Reconciliation("bate", item_ids=[2])


def test_one_receipt_can_pay_several_items() -> None:
    result = reconcile([receipt(1, "40.00", 1)], {1: queue("10.00", "10.00", "20.00", "5.00")})
    assert result[1] == Reconciliation("bate", item_ids=[1, 2, 3])


def test_each_person_has_their_own_queue() -> None:
    result = reconcile(
        [receipt(1, "20.00", 1, person=1), receipt(2, "20.00", 1, person=2)],
        {1: queue("20.00"), 2: queue("20.00")},
    )
    assert result[1].status == result[2].status == "bate"


def test_person_without_anything_to_pay_is_paid_too_much() -> None:
    assert reconcile([receipt(1, "20.00", 1)], {})[1].status == "pago_a_mais"


def test_cents_are_exact_with_decimal() -> None:
    # 0,10 + 0,20 não pode virar 0,30000000000000004
    result = reconcile([receipt(1, "0.30", 1)], {1: queue("0.10", "0.20")})
    assert result[1].status == "bate"


def test_receipt_without_a_date_goes_first_and_ties_break_by_page_then_id() -> None:
    sem_data = PendingReceipt(9, 1, Decimal("20.00"), None, 5)
    result = reconcile([receipt(1, "20.00", 1), sem_data], {1: queue("20.00", "20.00")})
    assert result[9].item_ids == [1]
    assert result[1].item_ids == [2]

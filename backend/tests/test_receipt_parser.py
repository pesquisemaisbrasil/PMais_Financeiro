import unicodedata
from datetime import date
from decimal import Decimal

import pytest

from services.receipt_parser import UnreadablePdf, extract_pdf_pages, parse_receipts


def receipt_text(
    *,
    name: str = "FULANA DE TESTE",
    key: str = "fulana.teste@gmail com",
    amount: str = "R$ 40,00",
    day: str = "18/02/2026",
    e2e: str = "E00000000202601011200TESTE000001",
) -> str:
    """Texto fictício no layout do Itaú/Sispag, como o pypdf o extrai."""
    return f"""Comprovante de Transferência
dados do pagador
nome do pagador:  EMPRESA FICTICIA LTDA
CPF / CNPJ do pagador:  11.222.333/0001-81
chave:  11222333000181
dados do recebedor
nome do recebedor:  {name}
chave:  {key}
CPF / CNPJ do recebedor:  *****000000-**
dados da transação
valor:  {amount}
data da transferência:  {day}
autenticação no comprovante:
A0000000000000000000000000000000000000A0
ID da transação:
{e2e}
controle:
"""


def test_reads_the_receiver_block_and_never_the_payer() -> None:
    (parsed,) = parse_receipts([receipt_text()])
    assert parsed.pix_key == "fulana.teste@gmail.com"  # e não a chave do pagador
    assert parsed.payee_name == "FULANA DE TESTE"
    assert parsed.amount == Decimal("40.00")
    assert parsed.paid_at == date(2026, 2, 18)
    assert parsed.e2e_id == "E00000000202601011200TESTE000001"
    assert parsed.error is None


def test_two_receipts_on_one_page_and_one_split_across_pages() -> None:
    um = receipt_text(e2e="E1")
    dois = receipt_text(e2e="E2", amount="R$ 1.234,50")
    cortado_na_metade = dois.splitlines()
    primeira = "\n".join(cortado_na_metade[:12])
    segunda = "\n".join(cortado_na_metade[12:])
    result = parse_receipts([um + dois, primeira, segunda])
    # os dois da página 1, e o terceiro (da página 2) começa no título dela
    assert [r.e2e_id for r in result][:2] == ["E1", "E2"]
    assert result[1].amount == Decimal("1234.50")


def test_page_offset_shows_the_page_of_the_original_pdf() -> None:
    (parsed,) = parse_receipts([receipt_text()], page_offset=50)
    assert parsed.page == 51


def test_text_before_the_first_title_is_ignored() -> None:
    (parsed,) = parse_receipts(["Página de rosto\nvalor: R$ 99,99\n" + receipt_text()])
    assert parsed.amount == Decimal("40.00")


def test_labels_are_read_without_accents() -> None:
    texto = (
        receipt_text().replace("transferência", "TRANSFERENCIA").replace("transação", "transacao")
    )
    (parsed,) = parse_receipts([texto])
    assert parsed.paid_at == date(2026, 2, 18)
    assert parsed.e2e_id and parsed.error is None


@pytest.mark.parametrize(
    ("mudanca", "faltando"),
    [
        ({"key": ""}, "chave"),
        ({"amount": "R$ 40"}, "valor"),
        ({"e2e": "controle:"}, "ID da transação"),
    ],
)
def test_missing_required_field_is_a_reading_error(mudanca: dict[str, str], faltando: str) -> None:
    texto = receipt_text(**mudanca)
    if "e2e" in mudanca:
        texto = texto.replace("controle:\ncontrole:", "controle:")
    (parsed,) = parse_receipts([texto])
    assert parsed.error is not None and faltando in parsed.error


def test_invalid_date_is_empty_not_an_error() -> None:
    (parsed,) = parse_receipts([receipt_text(day="31/02/2026")])
    assert parsed.paid_at is None and parsed.error is None


def minimal_pdf(lines: list[str]) -> bytes:
    """PDF de uma página só com texto, montado à mão: nada de arquivo real nos testes."""
    stream = "BT /F1 10 Tf 12 780 Td 12 TL " + " ".join(f"({t}) '" for t in lines) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    body = b"%PDF-1.4\n"
    offsets = []
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body += f"{number} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(body)
    body += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    body += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    body += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return body


def test_reads_the_text_of_a_generated_pdf_and_parses_it() -> None:
    sem_acento = unicodedata.normalize("NFKD", receipt_text()).encode("ascii", "ignore").decode()
    texto = [linha for linha in sem_acento.splitlines() if linha]
    pages = extract_pdf_pages(minimal_pdf(texto))
    (parsed,) = parse_receipts(pages)
    assert parsed.amount == Decimal("40.00") and parsed.e2e_id


def test_refuses_what_is_not_a_pdf() -> None:
    with pytest.raises(UnreadablePdf, match="não é um PDF"):
        extract_pdf_pages(b"PK\x03\x04 planilha")

import pytest

from core.pix import is_valid_cpf, mask_pix_key, normalize_pix_key


@pytest.mark.parametrize(
    ("entrada", "saida"),
    [
        ("  Fulano@Gmail.com ", "fulano@gmail.com"),
        ("123.456.789-09", "12345678909"),
        ("11.222.333/0001-81", "11222333000181"),
        ("(11) 98765-4321", "+5511987654321"),
        ("5511987654321", "+5511987654321"),
        ("+55 11 98765-4321", "+5511987654321"),
        ("123E4567-E89B-12D3-A456-426614174000", "123e4567-e89b-12d3-a456-426614174000"),
        ("chave livre ", "chave livre"),
    ],
)
def test_normalize_pix_key(entrada: str, saida: str) -> None:
    assert normalize_pix_key(entrada) == saida


def test_11_digits_that_are_not_a_cpf_become_a_phone() -> None:
    assert is_valid_cpf("12345678909")
    assert not is_valid_cpf("11111111111")
    assert normalize_pix_key("11987654321") == "+5511987654321"


@pytest.mark.parametrize(
    ("chave", "mascara"),
    [
        ("hmoura@gmail.com", "hmo***@gmail.com"),
        ("12345678909", "123***09"),
        ("+5511987654321", "+55***21"),
        ("abc12", "***"),
    ],
)
def test_mask_never_shows_the_whole_key(chave: str, mascara: str) -> None:
    assert mask_pix_key(chave) == mascara

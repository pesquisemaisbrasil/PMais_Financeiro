"""CNPJ, inclusive o alfanumérico que a Receita passou a emitir em 2026."""

import re

CNPJ_SHAPE = re.compile(r"[0-9A-Z]{12}\d{2}")
FIRST_WEIGHTS = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
SECOND_WEIGHTS = (6, *FIRST_WEIGHTS)


def clean_cnpj(value: str) -> str:
    return re.sub(r"[\s./-]", "", value).upper()


def is_cpf_shaped(document: str) -> bool:
    return document.isdigit() and len(document) == 11


def _check_digit(base: str, weights: tuple[int, ...]) -> str:
    # Cada caractere vale o código dele menos 48: "0" é 0, "9" é 9 e "A" é 17.
    total = sum((ord(char) - 48) * weight for char, weight in zip(base, weights, strict=True))
    rest = total % 11
    return "0" if rest < 2 else str(11 - rest)


def valid_cnpj(document: str) -> bool:
    if not CNPJ_SHAPE.fullmatch(document) or len(set(document)) == 1:
        return False
    first = _check_digit(document[:12], FIRST_WEIGHTS)
    second = _check_digit(document[:12] + first, SECOND_WEIGHTS)
    return document[12:] == first + second

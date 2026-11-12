import pytest

from core.security import dummy_verify_password, hash_password, verify_password

# Hash feito pela versão antiga (passlib) para uma senha fictícia: as já gravadas continuam valendo.
PASSLIB_HASH = "$2b$12$CldyS/1AQRNyiTyJSehyzOjlSCEYbZv6HDzD0i4X3XLGjVafWYOCC"  # gitleaks:allow
PASSLIB_PASSWORD = "Senha-ficticia-1!"


def test_hash_is_bcrypt_and_verifies() -> None:
    password_hash = hash_password(PASSLIB_PASSWORD)

    assert password_hash.startswith("$2b$12$")
    assert verify_password(PASSLIB_PASSWORD, password_hash)
    assert not verify_password("outra-senha", password_hash)


def test_hash_has_a_new_salt_every_time() -> None:
    assert hash_password(PASSLIB_PASSWORD) != hash_password(PASSLIB_PASSWORD)


def test_hash_made_by_the_old_library_still_verifies() -> None:
    assert verify_password(PASSLIB_PASSWORD, PASSLIB_HASH)
    assert not verify_password("outra-senha", PASSLIB_HASH)


def test_only_the_first_72_bytes_count_as_before() -> None:
    password_hash = hash_password("x" * 100)

    assert verify_password("x" * 72, password_hash)
    assert not verify_password("x" * 71, password_hash)


@pytest.mark.parametrize("password", ["x" * 5000, "com" + chr(0) + "nulo"])
def test_password_bcrypt_refuses_is_just_a_wrong_password(password: str) -> None:
    assert not verify_password(password, PASSLIB_HASH)
    with pytest.raises(ValueError):
        hash_password(password)


def test_malformed_hash_is_just_a_wrong_password() -> None:
    assert not verify_password(PASSLIB_PASSWORD, "isto-nao-e-um-hash")


def test_dummy_verify_runs_without_error() -> None:
    dummy_verify_password()

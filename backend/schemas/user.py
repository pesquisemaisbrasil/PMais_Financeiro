from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str


def validate_password_strength(value: str) -> str:
    errors = []
    if not 8 <= len(value) <= 72:
        errors.append("precisa ter de 8 a 72 caracteres")
    if any(c.isspace() for c in value):
        errors.append("não pode conter espaços")
    if not any(c.isupper() for c in value):
        errors.append("precisa ter pelo menos uma letra maiúscula")
    if not any(c.islower() for c in value):
        errors.append("precisa ter pelo menos uma letra minúscula")
    if not any(c.isdigit() for c in value):
        errors.append("precisa ter pelo menos um número")
    if not any(not c.isalnum() for c in value):
        errors.append("precisa ter pelo menos um caractere especial")
    if len(set(value)) < 4:
        errors.append("não pode ser uma sequência repetitiva/pouco variada")

    common_passwords = {"password", "12345678", "qwerty123", "senha123", "admin123"}
    if value.lower() in common_passwords:
        errors.append("é muito comum, escolha uma senha mais forte")

    if errors:
        raise ValueError("Senha " + "; ".join(errors))
    return value

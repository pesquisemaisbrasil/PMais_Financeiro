"""código nos cadastros e apelido e CNPJ na empresa do Grupo

Revision ID: a1c3e5f7b9d2
Revises: f6b2d8e3a1c5
Create Date: 2026-11-09 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1c3e5f7b9d2"
down_revision: Union[str, Sequence[str], None] = "f6b2d8e3a1c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("suppliers", sa.Column("code", sa.String(length=20), nullable=True))
    op.add_column("customers", sa.Column("code", sa.String(length=20), nullable=True))
    op.add_column("companies", sa.Column("code", sa.String(length=20), nullable=True))
    op.add_column("companies", sa.Column("nickname", sa.String(length=100), nullable=True))
    op.add_column("companies", sa.Column("document", sa.String(length=14), nullable=True))
    # A razão social que a Receita devolve passa de 100 letras com facilidade.
    op.alter_column(
        "companies",
        "name",
        existing_type=sa.String(length=100),
        type_=sa.String(length=200),
        existing_nullable=False,
    )
    op.create_index(
        "uq_companies_active_document",
        "companies",
        ["document"],
        unique=True,
        postgresql_where=sa.text("active AND document IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_companies_active_document", table_name="companies")
    op.alter_column(
        "companies",
        "name",
        existing_type=sa.String(length=200),
        type_=sa.String(length=100),
        existing_nullable=False,
    )
    op.drop_column("companies", "document")
    op.drop_column("companies", "nickname")
    op.drop_column("companies", "code")
    op.drop_column("customers", "code")
    op.drop_column("suppliers", "code")

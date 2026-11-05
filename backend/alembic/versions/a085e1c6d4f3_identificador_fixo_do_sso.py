"""identificador fixo da pessoa no login por Google e Microsoft

Revision ID: a085e1c6d4f3
Revises: f74a0d5b3c42
Create Date: 2026-11-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a085e1c6d4f3"
down_revision: Union[str, Sequence[str], None] = "f74a0d5b3c42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "sso_identities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "subject", name="uq_sso_provider_subject"),
    )
    op.create_index(op.f("ix_sso_identities_id"), "sso_identities", ["id"], unique=False)
    op.create_index(op.f("ix_sso_identities_user_id"), "sso_identities", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_sso_identities_user_id"), table_name="sso_identities")
    op.drop_index(op.f("ix_sso_identities_id"), table_name="sso_identities")
    op.drop_table("sso_identities")

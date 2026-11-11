"""recebimentos e histórico do a receber só de inserção

Revision ID: f6c8e0a2b4d6
Revises: e5b7d9f1a3c5
Create Date: 2026-11-11 09:00:00.000000

O a pagar já revoga UPDATE e DELETE das baixas e do histórico para a role da app
(9947141b77e5). O a receber nasceu sem isso: aqui a regra "nunca é editado nem apagado" passa a
valer no banco, não só no código.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f6c8e0a2b4d6"
down_revision: Union[str, Sequence[str], None] = "e5b7d9f1a3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # A role da app só existe onde roles.sql rodou: fora dele (CI antigo, testes), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE UPDATE, DELETE ON receivable_payments, receivable_events FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                GRANT UPDATE, DELETE ON receivable_payments, receivable_events TO financeiro_app;
              END IF;
            END $$;
            """
        )

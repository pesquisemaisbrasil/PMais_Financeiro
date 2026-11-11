"""Marca a sessão aberta por Google ou Microsoft, que não passa pelo TOTP do Financeiro.

Revision ID: b75f4c24b4ee
Revises: 264e9a02960f
Create Date: 2026-11-03 11:44:51.902496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b75f4c24b4ee'
down_revision: Union[str, Sequence[str], None] = '264e9a02960f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Adiciona refresh_tokens.viaSso. As sessões que já existem ficam como senha."""
    op.add_column('refresh_tokens', sa.Column('viaSso', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    """Remove a coluna: sessões por SSO de quem não tem TOTP param de renovar."""
    op.drop_column('refresh_tokens', 'viaSso')

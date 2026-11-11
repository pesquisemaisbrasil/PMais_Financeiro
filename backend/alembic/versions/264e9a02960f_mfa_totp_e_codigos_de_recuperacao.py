"""MFA: segredo TOTP cifrado, controle de tentativas e códigos de recuperação em hash.

Revision ID: 264e9a02960f
Revises: 67fa288d10dc
Create Date: 2026-11-03 10:28:33.568367

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '264e9a02960f'
down_revision: Union[str, Sequence[str], None] = '67fa288d10dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Cria mfa_recovery_codes e as colunas de MFA em users. Ninguém fica com MFA ligado."""
    op.create_table('mfa_recovery_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('codeHash', sa.String(), nullable=False),
    sa.Column('usedAt', sa.DateTime(timezone=True), nullable=True),
    sa.Column('createdAt', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mfa_recovery_codes_codeHash'), 'mfa_recovery_codes', ['codeHash'], unique=False)
    op.create_index(op.f('ix_mfa_recovery_codes_id'), 'mfa_recovery_codes', ['id'], unique=False)
    op.create_index(op.f('ix_mfa_recovery_codes_user_id'), 'mfa_recovery_codes', ['user_id'], unique=False)
    op.add_column('users', sa.Column('totpSecretEncrypted', sa.String(), nullable=True))
    op.add_column('users', sa.Column('mfaEnabledAt', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('totpLastUsedStep', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('mfaFailedAttempts', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('mfaLockedUntil', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Apaga as colunas e os códigos: todo mundo volta a cadastrar o MFA, se subir de novo."""
    op.drop_column('users', 'mfaLockedUntil')
    op.drop_column('users', 'mfaFailedAttempts')
    op.drop_column('users', 'totpLastUsedStep')
    op.drop_column('users', 'mfaEnabledAt')
    op.drop_column('users', 'totpSecretEncrypted')
    op.drop_index(op.f('ix_mfa_recovery_codes_user_id'), table_name='mfa_recovery_codes')
    op.drop_index(op.f('ix_mfa_recovery_codes_id'), table_name='mfa_recovery_codes')
    op.drop_index(op.f('ix_mfa_recovery_codes_codeHash'), table_name='mfa_recovery_codes')
    op.drop_table('mfa_recovery_codes')

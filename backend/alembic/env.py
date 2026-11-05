import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.config import MIGRATION_DATABASE_URL  # noqa: E402
from db.connection import Base  # noqa: E402
from models.connect_payable_item import (  # noqa: E402,F401 (registers model on Base.metadata)
    ConnectPayableItem,
)
from models.login_event import LoginEvent  # noqa: E402,F401 (registers model on Base.metadata)
from models.mfa_recovery_code import (  # noqa: E402,F401 (registers model on Base.metadata)
    MfaRecoveryCode,
)
from models.payable import Payable  # noqa: E402,F401 (registers model on Base.metadata)
from models.project_ref import ProjectRef  # noqa: E402,F401 (registers model on Base.metadata)
from models.receipt import (  # noqa: E402,F401 (registers model on Base.metadata)
    PaymentReceipt,
    ReceiptAllocation,
    ReceiptBatch,
    ReceiptBatchPart,
)
from models.refresh_token import RefreshToken  # noqa: E402,F401 (registers model on Base.metadata)
from models.sso_identity import SsoIdentity  # noqa: E402,F401 (registers model on Base.metadata)
from models.user import User  # noqa: E402,F401 (registers model on Base.metadata)

config = context.config
# % escapado: o configparser do Alembic interpreta % na URL
config.set_main_option("sqlalchemy.url", MIGRATION_DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

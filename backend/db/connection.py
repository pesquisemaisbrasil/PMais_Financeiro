from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from core.config import DATABASE_URL


def make_engine(url: str) -> Engine:
    """Engine do app. Em produção é Postgres e nada muda.

    SQLite em arquivo só é usado nos testes de tela (e2e): o uvicorn atende
    cada requisição numa thread do pool, então a conexão precisa poder trocar
    de thread, e as FKs (ON DELETE CASCADE/RESTRICT) precisam ser ligadas à
    mão para o banco se comportar como o Postgres.
    """
    if not url.startswith("sqlite"):
        # hide_parameters: erros do banco não levam os valores (dado pessoal) para o log.
        return create_engine(url, hide_parameters=True)

    sqlite_engine = create_engine(
        url, hide_parameters=True, connect_args={"check_same_thread": False}
    )

    @event.listens_for(sqlite_engine, "connect")
    def _enable_foreign_keys(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return sqlite_engine


engine = make_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

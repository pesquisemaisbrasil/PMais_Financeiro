from sqlalchemy import Column, DateTime, Integer, String, func

from db.connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    # sempre em minúsculas (services/auth.py: normalize_email)
    email = Column(String, unique=True, index=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    # financeiro | admin
    role = Column(String(20), nullable=False, default="financeiro")
    # active | inactive
    status = Column(String(20), nullable=False, default="active", index=True)
    lastSignedInAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

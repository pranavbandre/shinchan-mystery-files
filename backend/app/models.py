
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Investigation(Base):
    __tablename__ = "investigations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    question = Column(Text, nullable=False)
    status = Column(String(50), default="In Progress")
    created_at = Column(DateTime, default=datetime.utcnow)

    sources = relationship(
        "EvidenceSource",
        back_populates="investigation",
        cascade="all, delete-orphan"
    )


class EvidenceSource(Base):
    __tablename__ = "evidence_sources"

    id = Column(Integer, primary_key=True, index=True)
    investigation_id = Column(
        Integer,
        ForeignKey("investigations.id"),
        nullable=False
    )

    url = Column(Text, nullable=False)
    title = Column(String(255), nullable=True)
    extracted_text = Column(Text, nullable=True)
    status = Column(String(50), default="Pending")

    investigation = relationship(
        "Investigation",
        back_populates="sources"
    )

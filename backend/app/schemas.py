
from pydantic import BaseModel, ConfigDict, HttpUrl
from datetime import datetime


class InvestigationCreate(BaseModel):
    title: str
    question: str


class InvestigationResponse(BaseModel):
    id: int
    title: str
    question: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvidenceSourceCreate(BaseModel):
    url: HttpUrl


class EvidenceSourceResponse(BaseModel):
    id: int
    investigation_id: int
    url: str
    title: str | None
    status: str

    model_config = ConfigDict(from_attributes=True)

"""
VaultModel — mirrors the Node.js Vault mongoose schema.
Python RAG pipeline reads from this collection (read-only).
Node.js owns writes; Python only updates `isProcessedForRAG`.

Supported mimeTypes (must match Node.js vaultModel allowlist):
  application/pdf
  text/csv
  application/vnd.ms-excel                                            (XLS legacy)
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet  (XLSX)
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Literal
from datetime import datetime
from bson import ObjectId

from app.models.base import PyObjectId

# Matches the Node.js mongoose enum exactly
VaultMimeType = Literal[
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",                                           # .xls (legacy Excel)
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
]


class VaultModel(BaseModel):
    """
    Read model for the existing Vault collection owned by Node.js.
    Fields match the mongoose schema 1-to-1.
    """

    id: Optional[str] = Field(None, alias="_id")
    userId: str
    name: str                           # display name
    originalName: str                   # original filename
    mimeType: VaultMimeType = "application/pdf"
    size: int                           # bytes
    data: str                           # base64-encoded file content
    tags: List[str] = Field(default_factory=list)
    description: str = ""

    # RAG pipeline flag — Python sets this True after embedding
    isProcessedForRAG: bool = False

    # Password-protected PDF — cron sets passwordProtected=True when it can't parse
    # Node server stores pdfPassword after user unlocks in the viewer
    passwordProtected: bool = False
    pdfPassword: str = ""

    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    @field_validator("userId", "id", mode="before")
    @classmethod
    def coerce_objectid_to_str(cls, v):
        return str(v) if isinstance(v, ObjectId) else v


class VaultListItem(BaseModel):
    """Lightweight projection for listing vaults — avoids loading base64 data."""

    id: Optional[str] = Field(None, alias="_id")
    userId: str
    name: str
    originalName: str
    mimeType: VaultMimeType
    size: int
    tags: List[str] = Field(default_factory=list)
    description: str = ""
    isProcessedForRAG: bool = False
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    @field_validator("userId", "id", mode="before")
    @classmethod
    def coerce_objectid_to_str(cls, v):
        return str(v) if isinstance(v, ObjectId) else v
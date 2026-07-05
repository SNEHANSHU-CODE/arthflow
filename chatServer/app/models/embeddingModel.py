"""
EmbeddingModel — stores text chunks + vectors in the `embeddings` collection.
One document per chunk. Multiple chunks per vault document.
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId

from app.models.base import PyObjectId


class EmbeddingModel(BaseModel):
    """
    Stored embedding chunk in MongoDB Atlas.
    The `embedding` field is what Atlas $vectorSearch indexes.
    """

    id: Optional[str] = Field(None, alias="_id")

    # Link back to the Vault document
    vaultId: str                        # Vault._id
    userId: str                         # Vault.userId (for fast user-scoped search)

    # Chunk content
    chunkIndex: int                     # position within the document
    text: str                           # raw chunk text
    pageNumber: Optional[int] = None    # page number from PDF (if extractable)

    # Vector — 3072-dim for Google gemini-embedding-001
    embedding: List[float] = Field(default_factory=list)

    # Denormalised metadata (avoids joins during retrieval)
    source: str                         # originalName from Vault
    mimeType: str                       # reflects actual file type (PDF/CSV/XLSX)

    createdAt: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    @field_validator("vaultId", "userId", "id", mode="before")
    @classmethod
    def coerce_objectid_to_str(cls, v):
        return str(v) if isinstance(v, ObjectId) else v


class EmbeddingInsert(BaseModel):
    """
    Schema used when inserting chunks — no id/createdAt (MongoDB fills those).
    """

    vaultId: str
    userId: str
    chunkIndex: int
    text: str
    pageNumber: Optional[int] = None
    embedding: List[float]
    source: str
    mimeType: str                       # passed from vault.mimeType

    model_config = ConfigDict(populate_by_name=True)


class EmbeddingSearchResult(BaseModel):
    """Shape returned to the API caller after vector search."""

    vaultId: str
    chunkIndex: int
    text: str
    source: str
    pageNumber: Optional[int] = None
    score: float                        # Atlas returns this as `score` in $vectorSearch


class SemanticCacheInsert(BaseModel):
    """
    Schema for the Semantic FAQ Cache stored in faq_embeddings collection.
    Supports two use cases: Guest FAQ and Authenticated (DB-RAG) FAQ.
    """
    embedding: List[float]
    type: str                           # "guest_faq" | "auth_faq"
    userId: str                         # always "system" for static FAQ caches
    query: str
    response: str

    model_config = ConfigDict(populate_by_name=True)


class CacheSearchResult(BaseModel):
    """Shape returned to the API caller after a semantic cache hit."""
    type: str
    query: str
    response: str
    score: float
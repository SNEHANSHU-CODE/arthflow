from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    """Application settings"""

    # App Info
    APP_NAME: str = "Financial Chat Server"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"

    # Server
    HOST: str = "localhost"
    PORT: int = 5002
    RELOAD: bool = True
    WORKERS: int = 1

    # Database
    MONGO_URI: str
    MONGO_DB_NAME: str = "arthflow"

    # AI/LLM Configuration
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    DEFAULT_LLM: str = "groq"
    LLM_TEMPERATURE: float = 0.7
    LLM_MAX_TOKENS: int = 1024

    # Security — MUST match Node.js JWT_SECRET
    SECRET_KEY: str = "your-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: str = "*"

    # ── RAG Pipeline ──────────────────────────────────────────────────
    VAULT_COLLECTION: str = "vaults"
    EMBEDDINGS_COLLECTION: str = "embeddings"
    VECTOR_INDEX_NAME: str = "vector_index"

    EMBEDDING_MODEL: str = "models/gemini-embedding-001"
    EMBEDDING_DIMENSIONS: int = 3072

    CHUNK_SIZE: int = 600
    CHUNK_OVERLAP: int = 100
    CRON_INTERVAL_SECONDS: int = 30

    NOTIFICATION_POLL_SECONDS: int = 5

    OCR_SPACE_API_KEY: str = "key"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


# Global settings instance
settings = Settings()
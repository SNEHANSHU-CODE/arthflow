"""
Database manager — matches the existing Database class pattern.
Motor async client shared across the app lifetime.
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class Database:
    """MongoDB async connection manager (Motor)."""

    client: Optional[AsyncIOMotorClient] = None

    @classmethod
    async def connect_db(cls):
        """Create and verify the MongoDB connection. Call on app startup."""
        try:
            logger.info("Connecting to MongoDB Atlas...")
            cls.client = AsyncIOMotorClient(
                settings.MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                retryWrites=True,
                retryReads=True,
            )

            # Ping to confirm connection (also wakes Atlas free-tier if paused)
            await cls.client.admin.command("ping")
            logger.info("✅ Connected to MongoDB Atlas — db: %s", settings.MONGO_DB_NAME)

            # Ensure indexes on startup
            await cls._ensure_indexes()

        except Exception as e:
            logger.error("❌ Failed to connect to MongoDB: %s", e)
            raise

    @classmethod
    async def close_db(cls):
        """Close connection. Call on app shutdown."""
        if cls.client:
            cls.client.close()
            logger.info("MongoDB connection closed.")

    @classmethod
    def get_db(cls):
        if not cls.client:
            raise RuntimeError("Database not initialised. Call connect_db() first.")
        return cls.client[settings.MONGO_DB_NAME]

    # ------------------------------------------------------------------
    # Collection accessors
    # ------------------------------------------------------------------

    @classmethod
    def vault_collection(cls) -> AsyncIOMotorCollection:
        """Vault collection — Node.js owns this, we read + update isProcessedForRAG."""
        return cls.get_db()[settings.VAULT_COLLECTION]

    @classmethod
    def embeddings_collection(cls) -> AsyncIOMotorCollection:
        """Embeddings collection — fully owned by the Python RAG pipeline."""
        return cls.get_db()[settings.EMBEDDINGS_COLLECTION]

    @classmethod
    def faq_embeddings_collection(cls) -> AsyncIOMotorCollection:
        """FAQ Embeddings collection — separate from user document embeddings."""
        return cls.get_db()["faq_embeddings"]

    @classmethod
    def chat_history_collection(cls) -> AsyncIOMotorCollection:
        """
        Chat history — one document per user, messages array.
        Used to restore chat on page refresh.
        """
        return cls.get_db()["chat_history"]

    @classmethod
    def training_logs_collection(cls) -> AsyncIOMotorCollection:
        """
        Training logs — append-only, one document per message.
        Used for SLM fine-tuning. Never deleted.
        """
        return cls.get_db()["training_logs"]

    # ------------------------------------------------------------------
    # Index management
    # ------------------------------------------------------------------

    @classmethod
    async def _ensure_indexes(cls):
        """
        Create non-vector indexes in code.
        The Atlas $vectorSearch index on embeddings.embedding
        must be created manually in the Atlas UI (not via Motor).
        """
        embeddings = cls.embeddings_collection()

        # Fast lookup: all chunks belonging to a vault
        await embeddings.create_index("vaultId", name="idx_vaultId")

        # Fast user-scoped queries
        await embeddings.create_index("userId", name="idx_userId")

        # Compound: user + source for filtered retrieval
        await embeddings.create_index(
            [("userId", 1), ("source", 1)],
            name="idx_userId_source",
        )

        # Vault collection: quickly find unprocessed PDFs for the cron watcher
        vault = cls.vault_collection()
        await vault.create_index(
            "isProcessedForRAG",
            name="idx_isProcessedForRAG",
        )

        # chat_history: fast lookup by userId (one doc per user)
        chat_history = cls.chat_history_collection()
        await chat_history.create_index(
            "userId",
            name="idx_chat_history_userId",
            unique=True,        # enforces one doc per user
        )

        # training_logs: query by userId + timestamp for export
        training_logs = cls.training_logs_collection()
        await training_logs.create_index(
            "userId",
            name="idx_training_logs_userId",
        )
        await training_logs.create_index(
            [("userId", 1), ("timestamp", 1)],
            name="idx_training_logs_userId_timestamp",
        )
        await training_logs.create_index(
            "timestamp",
            name="idx_training_logs_timestamp",
        )

        logger.info("✅ MongoDB indexes ensured.")


# FastAPI dependency
async def get_database():
    return Database.get_db()
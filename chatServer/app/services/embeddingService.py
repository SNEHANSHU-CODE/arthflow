"""
Embedding Service - Storage Layer
Manages storing and retrieving embeddings from MongoDB Atlas.

IMPORTANT: userId and vaultId are stored as plain strings (NOT ObjectId).
The Python RAG pipeline always writes them as str(vault.userId) / str(vault_id).
Never coerce to ObjectId here — $match on ObjectId will miss all documents.
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.database import Database
from app.models.embeddingModel import (
    EmbeddingModel, EmbeddingInsert, EmbeddingSearchResult,
    SemanticCacheInsert, CacheSearchResult
)
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingStorageService:
    """Service for storing and retrieving embeddings from MongoDB Atlas."""

    @classmethod
    async def insert_batch(cls, embeddings: List[EmbeddingInsert]) -> List[str]:
        """
        Insert a batch of embeddings into MongoDB.

        Args:
            embeddings: List of EmbeddingInsert objects

        Returns:
            List of inserted document IDs as strings
        """
        if not embeddings:
            logger.warning("No embeddings to insert")
            return []

        try:
            col = Database.embeddings_collection()
            docs = [emb.model_dump() for emb in embeddings]
            for doc in docs:
                if not doc.get("createdAt"):
                    doc["createdAt"] = datetime.utcnow()

            result = await col.insert_many(docs)
            logger.info("Inserted %d embeddings", len(result.inserted_ids))
            return [str(eid) for eid in result.inserted_ids]

        except Exception as e:
            logger.error("Error inserting embeddings: %s", e)
            raise

    @classmethod
    async def insert_faq_batch(cls, embeddings: List[SemanticCacheInsert]) -> List[str]:
        """Insert a batch of semantic cache embeddings into the FAQ collection."""
        if not embeddings:
            return []
        try:
            col = Database.faq_embeddings_collection()
            docs = [emb.model_dump() for emb in embeddings]
            for doc in docs:
                if not doc.get("createdAt"):
                    doc["createdAt"] = datetime.utcnow()
            result = await col.insert_many(docs)
            logger.info("Inserted %d semantic cache embeddings", len(result.inserted_ids))
            return [str(eid) for eid in result.inserted_ids]
        except Exception as e:
            logger.error("Error inserting semantic cache embeddings: %s", e)
            raise

    @classmethod
    async def insert_auth_faq_batch(cls, embeddings: List[SemanticCacheInsert]) -> List[str]:
        """Alias for insert_faq_batch to support existing auth script."""
        return await cls.insert_faq_batch(embeddings)
        


    @classmethod
    async def vector_search(
        cls,
        query_embedding: List[float],
        user_id: str,
        limit: int = 5,
        vault_id: Optional[str] = None,
    ) -> List[EmbeddingSearchResult]:
        """
        Perform vector search using MongoDB Atlas $vectorSearch.
        userId and vaultId are matched as plain strings.

        Args:
            query_embedding: Query embedding vector
            user_id: Filter results to this user's documents (plain string)
            limit: Number of results to return
            vault_id: Optional filter by specific vault (plain string)

        Returns:
            List of EmbeddingSearchResult sorted by relevance
        """
        try:
            col = Database.embeddings_collection()

            # Plain string match — do NOT use ObjectId()
            post_filter: Dict[str, str] = {"userId": str(user_id)}
            if vault_id:
                post_filter["vaultId"] = str(vault_id)

            num_candidates = min(limit * 40, 1000)

            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.VECTOR_INDEX_NAME,
                        "path": "embedding",
                        "queryVector": query_embedding,
                        "numCandidates": num_candidates,
                        "limit": num_candidates,
                    }
                },
                {"$match": post_filter},
                {"$limit": limit},
                {
                    "$project": {
                        "vaultId": 1,
                        "chunkIndex": 1,
                        "text": 1,
                        "source": 1,
                        "pageNumber": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }
                },
            ]

            results = []
            async for doc in col.aggregate(pipeline):
                results.append(EmbeddingSearchResult(
                    vaultId=str(doc["vaultId"]),
                    chunkIndex=doc["chunkIndex"],
                    text=doc["text"],
                    source=doc["source"],
                    pageNumber=doc.get("pageNumber"),
                    score=doc["score"],
                ))

            logger.debug(
                "Vector search returned %d results for user=%s vault=%s",
                len(results), user_id, vault_id,
            )
            return results

        except Exception as e:
            logger.error("Error performing vector search: %s", e)
            raise

    @classmethod
    async def faq_vector_search(
        cls,
        query_embedding: List[float],
        limit: int = 1,
    ) -> List[CacheSearchResult]:
        """Perform vector search on the dedicated FAQ embeddings collection for GUESTS."""
        return await cls._semantic_cache_search(query_embedding, "guest_faq", limit=limit)

    @classmethod
    async def auth_faq_vector_search(
        cls,
        query_embedding: List[float],
        limit: int = 1,
    ) -> List[CacheSearchResult]:
        """Perform vector search on the dedicated FAQ embeddings collection for AUTH users."""
        return await cls._semantic_cache_search(query_embedding, "auth_faq", limit=limit)
        


    @classmethod
    async def _semantic_cache_search(
        cls,
        query_embedding: List[float],
        cache_type: str,
        user_id: Optional[str] = None,
        vault_id: Optional[str] = None,
        limit: int = 1,
    ) -> List[CacheSearchResult]:
        """Core semantic cache vector search."""
        try:
            col = Database.faq_embeddings_collection()
            num_candidates = min(limit * 40, 1000)

            # Strict security filters
            match_filter = {"type": cache_type}
            if user_id:
                match_filter["userId"] = str(user_id)
            if vault_id:
                match_filter["vaultId"] = str(vault_id)

            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.VECTOR_INDEX_NAME,
                        "path": "embedding",
                        "queryVector": query_embedding,
                        "numCandidates": num_candidates,
                        "limit": num_candidates,
                    }
                },
                {
                    "$match": match_filter
                },
                {
                    "$limit": limit
                },
                {
                    "$project": {
                        "type": 1,
                        "query": 1,
                        "response": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }
                },
            ]

            results = []
            async for doc in col.aggregate(pipeline):
                results.append(CacheSearchResult(
                    type=doc["type"],
                    query=doc["query"],
                    response=doc["response"],
                    score=doc["score"],
                ))
            return results
        except Exception as e:
            logger.error("Error performing semantic cache vector search: %s", e)
            raise

    @classmethod
    async def get_by_vault_id(cls, vault_id: str, user_id: Optional[str] = None) -> List[EmbeddingModel]:
        """Get all embeddings for a specific vault document.

        Args:
            vault_id: Vault document ID
            user_id: Optional user ID for defense-in-depth scoping
        """
        try:
            col = Database.embeddings_collection()
            query: dict = {"vaultId": str(vault_id)}
            if user_id:
                query["userId"] = str(user_id)
            docs = await col.find(query).to_list(None)
            result = [EmbeddingModel(**doc) for doc in docs]
            logger.debug("Retrieved %d embeddings for vault %s", len(result), vault_id)
            return result
        except Exception as e:
            logger.error("Error retrieving embeddings for vault %s: %s", vault_id, e)
            raise

    @classmethod
    async def delete_by_vault_id(cls, vault_id: str, user_id: Optional[str] = None) -> int:
        """
        Delete all embeddings for a vault (called when vault is deleted).

        Args:
            vault_id: Vault document ID
            user_id: Optional user ID for defense-in-depth scoping

        Returns:
            Number of deleted embeddings
        """
        try:
            col = Database.embeddings_collection()
            query: dict = {"vaultId": str(vault_id)}
            if user_id:
                query["userId"] = str(user_id)
            result = await col.delete_many(query)
            logger.info("Deleted %d embeddings for vault %s", result.deleted_count, vault_id)
            return result.deleted_count
        except Exception as e:
            logger.error("Error deleting embeddings for vault %s: %s", vault_id, e)
            raise

    @classmethod
    async def get_user_embeddings(cls, user_id: str) -> Dict[str, Any]:
        """Get embedding statistics for a user."""
        try:
            col = Database.embeddings_collection()
            total = await col.count_documents({"userId": str(user_id)})

            vaults = await col.aggregate([
                {"$match": {"userId": str(user_id)}},
                {
                    "$group": {
                        "_id": "$vaultId",
                        "count": {"$sum": 1},
                        "source": {"$first": "$source"},
                    }
                },
                {"$sort": {"count": -1}},
            ]).to_list(None)

            return {"total_embeddings": total, "vaults": vaults}

        except Exception as e:
            logger.error("Error getting embedding stats for user %s: %s", user_id, e)
            raise

    @classmethod
    async def exists_for_vault(cls, vault_id: str) -> bool:
        """Check if embeddings exist for a vault."""
        try:
            col = Database.embeddings_collection()
            count = await col.count_documents({"vaultId": str(vault_id)})
            return count > 0
        except Exception as e:
            logger.error("Error checking embeddings for vault %s: %s", vault_id, e)
            return False


# Export instance
embedding_storage = EmbeddingStorageService()

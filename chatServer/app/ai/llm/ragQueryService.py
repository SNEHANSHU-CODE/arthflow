"""
RAG Query Service
Handles the retrieval side of RAG:
  1. Embed the user query via EmbeddingService
  2. Run Atlas $vectorSearch scoped to user + optional vault
  3. Format retrieved chunks into a context string for the prompt
"""
import logging
from typing import Optional

from app.core.database import Database
from app.core.config import settings
from app.ai.llm.embeddingService import EmbeddingService
from app.models.embeddingModel import EmbeddingSearchResult
from app.utils.piiMasker import PIIMasker

logger = logging.getLogger(__name__)


class RAGQueryService:

    @classmethod
    async def get_context(
        cls,
        query: str,
        user_id: str,
        vault_id: Optional[str] = None,
        top_k: int = 5,
    ) -> tuple[str, str, float]:
        """
        Main entry point. Embeds query, searches Atlas, returns
        formatted context string, source document name, and top relevance score.

        Args:
            query:    User's question
            user_id:  Scopes search to this user only
            vault_id: Optional — restrict to a specific vault document
            top_k:    Number of chunks to retrieve

        Returns:
            (context_str, document_name, top_score)
            context_str is empty string if nothing found.
            top_score is 0.0 if nothing found.
        """
        try:
            # 1. Mask PII in query before embedding
            masked_query, query_findings = PIIMasker.mask_with_report(query)
            if query_findings:
                logger.info(
                    "🔒 PII masked in query — %s",
                    ", ".join(f"{f.pii_type}×{f.count}" for f in query_findings),
                )
            # 1. Embed the masked query
            query_vector = await EmbeddingService.embed_query(masked_query)

            # 2. Vector search in Atlas
            results = await cls._vector_search(
                query_vector=query_vector,
                user_id=user_id,
                vault_id=vault_id,
                top_k=top_k,
            )

            if not results:
                logger.warning(
                    "RAG: no chunks found for user=%s vault=%s", user_id, vault_id
                )
                return "", "Unknown Document", 0.0

            # 3. Format into context string and mask any residual PII
            context_str = cls._format_context(results)
            context_str, ctx_findings = PIIMasker.mask_with_report(context_str)
            if ctx_findings:
                logger.info(
                    "🔒 PII masked in retrieved context — %s",
                    ", ".join(f"{f.pii_type}×{f.count}" for f in ctx_findings),
                )
            document_name = results[0].source
            top_score = results[0].score  # already sorted by relevance from Atlas

            logger.info(
                "RAG retrieved %d chunks (vault=%s, top_score=%.3f)",
                len(results), vault_id or "any", top_score,
            )
            return context_str, document_name, top_score

        except Exception as e:
            logger.error("RAG context retrieval failed: %s", e)
            return "", "Unknown Document", 0.0

    @classmethod
    async def _vector_search(
        cls,
        query_vector: list,
        user_id: str,
        vault_id: Optional[str],
        top_k: int,
    ) -> list[EmbeddingSearchResult]:
        """Run $vectorSearch aggregation on Atlas.

        NOTE: Atlas M0 free tier does NOT support inline `filter` inside
        $vectorSearch (requires M2+ with filter fields declared in the index).
        We fetch a larger candidate set then apply $match as a regular pipeline
        stage so string userId/vaultId fields are compared correctly.
        """
        try:
            collection = Database.embeddings_collection()

            # userId and vaultId are stored as plain strings (not ObjectId)
            post_filter: dict = {"userId": str(user_id)}
            if vault_id:
                post_filter["vaultId"] = str(vault_id)

            # Fetch large candidate set so post-filter has enough to work with
            num_candidates = min(top_k * 40, 1000)

            # ✅ NEW: Log exact search params for diagnosis
            logger.info(
                "🔍 RAG vector search — user_id=%r vault_id=%r top_k=%d num_candidates=%d index=%r",
                str(user_id), str(vault_id), top_k, num_candidates, settings.VECTOR_INDEX_NAME,
            )

            # ✅ NEW: Check total embeddings for this user BEFORE running vector search
            # This tells us if the pipeline stored embeddings correctly
            try:
                user_embedding_count = await collection.count_documents({"userId": str(user_id)})
                logger.info(
                    "📊 Embeddings in DB for user=%r: %d total",
                    str(user_id), user_embedding_count,
                )
                if vault_id:
                    vault_embedding_count = await collection.count_documents(
                        {"userId": str(user_id), "vaultId": str(vault_id)}
                    )
                    logger.info(
                        "📊 Embeddings for vault=%r: %d",
                        str(vault_id), vault_embedding_count,
                    )
            except Exception as count_err:
                logger.warning("Could not count embeddings for diagnosis: %s", count_err)

            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.VECTOR_INDEX_NAME,
                        "path": "embedding",
                        "queryVector": query_vector,
                        "numCandidates": num_candidates,
                        "limit": num_candidates,   # get all candidates, filter after
                    }
                },
                # Post-filter by userId (and optionally vaultId) — plain string match
                {"$match": post_filter},
                {"$limit": top_k},
                {
                    "$project": {
                        "vaultId": 1,
                        "userId": 1,
                        "chunkIndex": 1,
                        "text": 1,
                        "source": 1,
                        "pageNumber": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }
                },
            ]

            results = []
            async for doc in collection.aggregate(pipeline):
                results.append(EmbeddingSearchResult(
                    vaultId=str(doc["vaultId"]),
                    chunkIndex=doc["chunkIndex"],
                    text=doc["text"],
                    source=doc["source"],
                    pageNumber=doc.get("pageNumber"),
                    score=doc["score"],
                ))

            # ✅ NEW: Log post-filter result count
            logger.info(
                "✅ Vector search results after post-filter — count=%d user=%r vault=%r",
                len(results), str(user_id), str(vault_id),
            )
            if len(results) == 0:
                logger.warning(
                    "⚠️  Zero results after post-filter. "
                    "Check: (1) index name matches Atlas, (2) embeddings exist for this user/vault, "
                    "(3) numCandidates=%d is enough for cross-user vector space",
                    num_candidates,
                )
            return results

        except Exception as e:
            # ✅ IMPROVED: More specific exception logging
            logger.error("❌ Vector search FAILED — error=%s type=%s", e, type(e).__name__)
            logger.error("   index=%r user=%r vault=%r", settings.VECTOR_INDEX_NAME, str(user_id), str(vault_id))
            return []

    @staticmethod
    def _format_context(results: list[EmbeddingSearchResult]) -> str:
        """
        Format retrieved chunks into a readable context block.
        Sorted by chunk_index to preserve document flow.
        """
        sorted_results = sorted(results, key=lambda r: r.chunkIndex)
        parts = []
        for r in sorted_results:
            page_label = f"[Page {r.pageNumber}] " if r.pageNumber else ""
            parts.append(f"{page_label}{r.text}")
        return "\n\n".join(parts)

    @classmethod
    async def get_user_processed_vaults(cls, user_id: str) -> list[dict]:
        """
        Return list of vaults that have embeddings ready for this user.
        Used by frontend toggle to show which PDFs can be queried.
        userId is stored as a plain string — do NOT use ObjectId here.
        """
        try:
            collection = Database.embeddings_collection()
            pipeline = [
                # Plain string match — userId is stored as str, not ObjectId
                {"$match": {"userId": str(user_id)}},
                {
                    "$group": {
                        "_id": "$vaultId",
                        "source": {"$first": "$source"},
                        "chunkCount": {"$sum": 1},
                    }
                },
                {"$sort": {"source": 1}},
            ]
            results = []
            async for doc in collection.aggregate(pipeline):
                results.append({
                    "vaultId": str(doc["_id"]),
                    "source": doc["source"],
                    "chunkCount": doc["chunkCount"],
                })
            logger.info(
                "Found %d processed vaults for user=%s", len(results), user_id
            )
            return results

        except Exception as e:
            logger.error("Error fetching processed vaults: %s", e)
            return []


rag_query_service = RAGQueryService()
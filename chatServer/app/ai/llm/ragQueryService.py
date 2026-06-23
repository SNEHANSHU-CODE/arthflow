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

            # 2. Hybrid Search + Reranking
            results, top_score = await cls._hybrid_search_and_rerank(
                query=query,
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

            logger.info(
                "RAG retrieved %d chunks (vault=%s, top_score=%.3f)",
                len(results), vault_id or "any", top_score,
            )
            return context_str, document_name, top_score

        except Exception as e:
            logger.error("RAG context retrieval failed: %s", e)
            return "", "Unknown Document", 0.0

    @classmethod
    async def _vector_search_filtered(
        cls,
        query_vector: list,
        user_id: str,
        vault_id: Optional[str],
        top_k: int,
    ) -> list[EmbeddingSearchResult]:
        """Run $vectorSearch aggregation with embedded filter for high efficiency."""
        try:
            collection = Database.embeddings_collection()

            pre_filter: dict = {"userId": {"$eq": str(user_id)}}
            if vault_id:
                pre_filter["vaultId"] = {"$eq": str(vault_id)}

            num_candidates = max(top_k * 10, 100)

            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.VECTOR_INDEX_NAME,
                        "path": "embedding",
                        "queryVector": query_vector,
                        "numCandidates": num_candidates,
                        "limit": top_k,
                        "filter": pre_filter
                    }
                },
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
            return results

        except Exception as e:
            logger.error("❌ Vector search FAILED: %s", e)
            return []

    @classmethod
    async def _text_search(
        cls,
        query: str,
        user_id: str,
        vault_id: Optional[str],
        top_k: int,
    ) -> list[EmbeddingSearchResult]:
        """Run standard BM25 Atlas Search."""
        try:
            collection = Database.embeddings_collection()
            
            must_clauses = [{"equals": {"path": "userId", "value": str(user_id)}}]
            if vault_id:
                must_clauses.append({"equals": {"path": "vaultId", "value": str(vault_id)}})
                
            pipeline = [
                {
                    "$search": {
                        "index": "default",
                        "compound": {
                            "must": [
                                {"text": {"query": query, "path": "text"}},
                            ],
                            "filter": must_clauses
                        }
                    }
                },
                {"$limit": top_k},
                {
                    "$project": {
                        "vaultId": 1,
                        "userId": 1,
                        "chunkIndex": 1,
                        "text": 1,
                        "source": 1,
                        "pageNumber": 1,
                        "score": {"$meta": "searchScore"},
                    }
                }
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
            return results
        except Exception as e:
            logger.warning("BM25 Text Search failed (check if 'default' search index exists): %s", e)
            return []

    @classmethod
    async def _hybrid_search_and_rerank(
        cls,
        query: str,
        query_vector: list,
        user_id: str,
        vault_id: Optional[str],
        top_k: int = 5,
    ) -> tuple[list[EmbeddingSearchResult], float]:
        import asyncio
        fetch_k = max(top_k, 10)
        
        vector_task = asyncio.create_task(cls._vector_search_filtered(query_vector, user_id, vault_id, fetch_k))
        text_task = asyncio.create_task(cls._text_search(query, user_id, vault_id, fetch_k))
        
        try:
            vector_results, text_results = await asyncio.gather(vector_task, text_task)
        except Exception as e:
            logger.error("Hybrid search failed: %s", e)
            vector_results, text_results = [], []
            
        if not vector_results and not text_results:
            return [], 0.0
            
        chunks_map = {}
        rrf_scores = {}
        k_const = 60
        
        max_vector_score = vector_results[0].score if vector_results else 0.0
        
        for rank, res in enumerate(vector_results):
            cid = f"{res.vaultId}_{res.chunkIndex}"
            chunks_map[cid] = res
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (k_const + rank + 1)
            
        for rank, res in enumerate(text_results):
            cid = f"{res.vaultId}_{res.chunkIndex}"
            chunks_map[cid] = res
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (k_const + rank + 1)
            
        sorted_cids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
        
        final_results = []
        if not sorted_cids:
            return [], 0.0
            
        top_rrf = rrf_scores[sorted_cids[0]]
        threshold = top_rrf * 0.5
        
        for i, cid in enumerate(sorted_cids):
            if i < 2:
                final_results.append(chunks_map[cid])
            elif i < 5:
                if rrf_scores[cid] >= threshold:
                    final_results.append(chunks_map[cid])
                else:
                    break
            else:
                break
                
        if not vector_results and text_results:
            max_vector_score = 0.99
            
        return final_results, max_vector_score

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
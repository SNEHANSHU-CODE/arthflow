"""
Vault Service
Manages reading from Vault collection and coordinating with RAG pipeline.
Node.js owns writes; Python reads and updates isProcessedForRAG flag.
"""
import logging
from typing import List, Optional
from bson import ObjectId

from app.core.database import Database
from app.models.vaultModel import VaultModel, VaultListItem

logger = logging.getLogger(__name__)


class VaultService:
    """Service for reading and managing vault documents for RAG processing."""

    @classmethod
    async def get_all_unprocessed(cls, user_id: Optional[str] = None) -> List[VaultModel]:
        """
        Fetch all PDFs marked as unprocessed for RAG.
        Used by cron watcher to find documents that need embedding.

        Args:
            user_id: Optional filter by user. None = all users.

        Returns:
            List of VaultModel instances with isProcessedForRAG=False
        """
        try:
            vault_col = Database.vault_collection()
            query = {"isProcessedForRAG": False}
            if user_id:
                query["userId"] = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id

            docs = await vault_col.find(query).to_list(None)
            result = [VaultModel(**doc) for doc in docs]
            logger.debug(f"Found {len(result)} unprocessed vault documents")
            return result
        except Exception as e:
            logger.error(f"Error fetching unprocessed documents: {e}")
            raise

    @classmethod
    async def get_by_id(cls, vault_id: str, user_id: Optional[str] = None) -> Optional[VaultModel]:
        """
        Fetch a single vault document by ID.

        Args:
            vault_id: Vault document ID
            user_id: Optional filter by user for access control

        Returns:
            VaultModel instance or None if not found
        """
        try:
            vault_col = Database.vault_collection()
            query = {"_id": ObjectId(vault_id) if not isinstance(vault_id, ObjectId) else vault_id}
            if user_id:
                query["userId"] = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id

            doc = await vault_col.find_one(query)
            if doc:
                return VaultModel(**doc)
            return None
        except Exception as e:
            logger.error(f"Error fetching vault document {vault_id}: {e}")
            raise

    @classmethod
    async def get_user_documents(cls, user_id: str, include_data: bool = False) -> List[VaultListItem]:
        """
        Fetch all documents for a user (lightweight listing).

        Args:
            user_id: User ID
            include_data: If True, include base64 PDF data. Expensive!

        Returns:
            List of VaultListItem instances
        """
        try:
            vault_col = Database.vault_collection()
            projection = None if include_data else {"data": 0}
            docs = await vault_col.find(
                {"userId": ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id},
                projection
            ).sort("createdAt", -1).to_list(None)

            result = [VaultListItem(**doc) for doc in docs]
            logger.debug(f"Fetched {len(result)} documents for user {user_id}")
            return result
        except Exception as e:
            logger.error(f"Error fetching user documents for {user_id}: {e}")
            raise

    @classmethod
    async def mark_as_processed(cls, vault_id: str) -> bool:
        """
        Mark a vault document as processed for RAG.
        Called by the RAG pipeline after successful embedding.

        Args:
            vault_id: Vault document ID

        Returns:
            True if updated, False if not found
        """
        try:
            vault_col = Database.vault_collection()
            result = await vault_col.update_one(
                {"_id": ObjectId(vault_id) if not isinstance(vault_id, ObjectId) else vault_id},
                {
                    "$set": {
                        "isProcessedForRAG": True,
                        "pdfPassword": ""
                    }
                }
            )
            if result.modified_count > 0:
                logger.info(f"Marked vault {vault_id} as processed")
                return True
            logger.warning(f"Vault {vault_id} not found or already processed")
            return False
        except Exception as e:
            logger.error(f"Error marking vault {vault_id} as processed: {e}")
            return False  # safe return — prevents infinite cron retry on bad vault_id

    @classmethod
    async def mark_as_unprocessed(cls, vault_id: str) -> bool:
        """
        Reset a vault document to unprocessed state.
        Useful if you need to re-embed a document.

        Args:
            vault_id: Vault document ID

        Returns:
            True if updated, False if not found
        """
        try:
            vault_col = Database.vault_collection()
            result = await vault_col.update_one(
                {"_id": ObjectId(vault_id) if not isinstance(vault_id, ObjectId) else vault_id},
                {"$set": {"isProcessedForRAG": False}}
            )
            if result.modified_count > 0:
                logger.info(f"Reset vault {vault_id} to unprocessed")
                return True
            logger.warning(f"Vault {vault_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error resetting vault {vault_id}: {e}")
            raise

    @classmethod
    async def delete_by_id(cls, vault_id: str, user_id: Optional[str] = None) -> bool:
        """
        Delete a vault document (and associated embeddings).
        The cron watcher will clean up embeddings when vault is deleted.

        Args:
            vault_id: Vault document ID
            user_id: Optional filter by user for access control

        Returns:
            True if deleted, False if not found
        """
        try:
            vault_col = Database.vault_collection()
            query = {"_id": ObjectId(vault_id) if not isinstance(vault_id, ObjectId) else vault_id}
            if user_id:
                query["userId"] = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id

            result = await vault_col.delete_one(query)
            if result.deleted_count > 0:
                logger.info(f"Deleted vault {vault_id}")
                # Note: Embeddings cleanup is handled separately by the cron watcher
                from app.services.embeddingService import embedding_storage
                await embedding_storage.delete_by_vault_id(vault_id)
                return True
            logger.warning(f"Vault {vault_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error deleting vault {vault_id}: {e}")
            raise

    @classmethod
    async def get_stats(cls, user_id: Optional[str] = None) -> dict:
        """Get statistics about vault documents, scoped to a user when user_id is provided."""
        try:
            vault_col = Database.vault_collection()
            # Always scope by user when provided to prevent cross-user count leakage
            base_filter: dict = {}
            if user_id:
                base_filter["userId"] = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id

            total = await vault_col.count_documents(base_filter)
            processed = await vault_col.count_documents({**base_filter, "isProcessedForRAG": True})
            unprocessed = await vault_col.count_documents({**base_filter, "isProcessedForRAG": False})

            return {
                "total_documents": total,
                "processed": processed,
                "unprocessed": unprocessed,
            }
        except Exception as e:
            logger.error(f"Error fetching vault stats: {e}")
            raise


# Export service instance
vault_service = VaultService()
"""
RAG Pipeline Orchestrator
Background task that watches for new/unprocessed vault documents and embeds them.
Supports: PDF, CSV, XLSX.
Runs periodically via APScheduler (same scheduler used by notification_poller).
"""
import logging
import asyncio
import functools
from typing import List, Optional
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from bson import ObjectId

from app.core.config import settings
from app.core.database import Database
from app.services.vaultService import vault_service
from app.services.embeddingService import embedding_storage
from app.ai.llm.documentService import DocumentService
from app.ai.llm.embeddingService import EmbeddingService
from app.models.embeddingModel import EmbeddingInsert

logger = logging.getLogger(__name__)

def decrypt_pdf_password(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        key_hex = os.environ.get('PDF_SECRET_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
        key = bytes.fromhex(key_hex)
        data = base64.b64decode(ciphertext)
        iv = data[:12]
        tag = data[12:28]
        enc_data = data[28:]
        
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, enc_data + tag, None)
        return decrypted.decode('utf-8')
    except Exception as e:
        logger.error("Failed to decrypt password: %s", e)
        return ciphertext # graceful fallback


class RAGPipeline:

    @classmethod
    async def process_vault_document(cls, vault_id: str) -> bool:
        try:
            logger.info("=== Processing vault %s ===", vault_id)

            vault = await vault_service.get_by_id(vault_id)
            if not vault:
                logger.error("Vault %s not found", vault_id)
                return False

            logger.info("✓ Fetched vault: %s | mimeType: %s | size: %d bytes",
                vault.originalName, vault.mimeType, vault.size)

            try:
                loop = asyncio.get_running_loop()
                chunks = await loop.run_in_executor(
                    None,  # uses default ThreadPoolExecutor
                    functools.partial(
                        DocumentService.process_vault_document,
                        base64_data=vault.data,
                        original_name=vault.originalName,
                        mime_type=vault.mimeType,
                        password=decrypt_pdf_password(vault.pdfPassword) if vault.pdfPassword else "",
                    )
                )
                if not chunks:
                    logger.warning("No text extracted from '%s' — marking processed anyway", vault.originalName)
                    await vault_service.mark_as_processed(vault_id)
                    return True
                logger.info("✓ Extracted %d chunks from '%s'", len(chunks), vault.originalName)
            except ValueError as e:
                error_msg = str(e)

                if error_msg == "PDF_PASSWORD_PROTECTED":
                    # No password stored yet — flag it and wait for user to unlock in viewer
                    logger.warning("'%s' is password protected — flagging and skipping until password provided", vault.originalName)
                    vault_col = Database.vault_collection()
                    await vault_col.update_one(
                        {"_id": ObjectId(vault_id)},
                        {"$set": {"passwordProtected": True}}
                    )
                    return False  # don't mark processed — cron retries when password arrives

                if error_msg == "PDF_WRONG_PASSWORD":
                    # Stored password is wrong — clear it so user is asked again
                    logger.warning("Wrong password for '%s' — clearing stored password", vault.originalName)
                    vault_col = Database.vault_collection()
                    await vault_col.update_one(
                        {"_id": ObjectId(vault_id)},
                        {"$set": {"pdfPassword": ""}}
                    )
                    return False

                logger.error("Extraction failed (non-retryable): %s", e)
                await vault_service.mark_as_processed(vault_id)
                return False
            except Exception as e:
                logger.error("Extraction failed (retryable): %s", e)
                return False

            # Extract chunk texts before embedding and storing
            chunk_texts = [chunk.text for chunk in chunks]
            try:
                embeddings = await EmbeddingService.embed_chunks(chunk_texts)
                if len(embeddings) != len(chunks):
                    logger.error("Embedding count mismatch: got %d, expected %d",
                        len(embeddings), len(chunks))
                    return False
                logger.info("✓ Generated %d embeddings", len(embeddings))
            except Exception as e:
                logger.error("Embedding failed: %s", e)
                return False

            embedding_inserts: List[EmbeddingInsert] = [
                EmbeddingInsert(
                    vaultId=str(vault_id),
                    userId=str(vault.userId),
                    chunkIndex=chunk.chunk_index,
                    text=chunk.text,
                    pageNumber=chunk.page_number,
                    embedding=embedding_vector,
                    source=chunk.source,
                    mimeType=vault.mimeType,
                )
                for chunk, embedding_vector in zip(chunks, embeddings)
            ]

            try:
                inserted_ids = await embedding_storage.insert_batch(embedding_inserts)
                logger.info("✓ Stored %d embeddings in MongoDB Atlas", len(inserted_ids))
            except Exception as e:
                logger.error("Failed to store embeddings: %s", e)
                return False

            try:
                await vault_service.mark_as_processed(vault_id)
                logger.info("✓ Marked vault %s as processed", vault_id)
            except Exception as e:
                logger.error("Failed to mark vault as processed: %s", e)
                return False

            logger.info("✅ Successfully processed vault %s (%s)", vault_id, vault.originalName)
            return True

        except Exception as e:
            logger.error("Unexpected error processing vault %s: %s", vault_id, e)
            return False

    @classmethod
    async def cleanup_orphaned_embeddings(cls) -> int:
        """
        Delete embeddings whose vault no longer exists in the vaults collection.
        Called every cron cycle before processing new documents.

        How it works:
          1. Get all distinct vaultIds from the embeddings collection
          2. For each vaultId, check if the vault document still exists
          3. If vault is gone → delete all its embeddings

        Returns:
            Total number of orphaned embedding chunks deleted
        """
        embeddings_col = Database.embeddings_collection()
        vault_col = Database.vault_collection()

        try:
            # 1. All distinct vaultIds that currently have embeddings
            vault_ids_with_embeddings = await embeddings_col.distinct("vaultId")

            if not vault_ids_with_embeddings:
                return 0

            logger.info("🧹 Orphan check — %d vault id(s) have embeddings",
                len(vault_ids_with_embeddings))

            # 2. Find which vaultIds no longer exist in the vaults collection
            #    embeddings store vaultId as plain string; vaults._id is ObjectId
            orphaned_vault_ids = []
            for vid in vault_ids_with_embeddings:
                try:
                    exists = await vault_col.find_one({"_id": ObjectId(vid)}, {"_id": 1})
                except Exception:
                    exists = None  # invalid ObjectId = vault definitely gone

                if not exists:
                    orphaned_vault_ids.append(vid)

            if not orphaned_vault_ids:
                logger.info("🧹 No orphaned embeddings found")
                return 0

            logger.info("🗑️  Found %d orphaned vault(s) — deleting embeddings: %s",
                len(orphaned_vault_ids), orphaned_vault_ids)

            # 3. Delete all embeddings for each orphaned vault
            total_deleted = 0
            for vid in orphaned_vault_ids:
                result = await embeddings_col.delete_many({"vaultId": vid})
                total_deleted += result.deleted_count
                logger.info("🗑️  Deleted %d chunk(s) for orphaned vault %s",
                    result.deleted_count, vid)

            logger.info("🧹 Orphan cleanup complete — deleted %d chunk(s) total", total_deleted)
            return total_deleted

        except Exception as e:
            logger.error("Orphan cleanup failed: %s", e)
            return 0

    @classmethod
    async def process_all_unprocessed(cls, user_id: Optional[str] = None) -> dict:
        """
        Cron job entry point:
          1. Clean up embeddings for deleted vaults (orphan check)
          2. Process all new/unprocessed vault documents
        """
        logger.info("=" * 60)
        logger.info("🔄 RAG pipeline cron — scanning for unprocessed documents...")
        logger.info("=" * 60)

        # Always clean up orphaned embeddings first
        orphans_deleted = await cls.cleanup_orphaned_embeddings()

        try:
            unprocessed = await vault_service.get_all_unprocessed(user_id)
            logger.info("Found %d unprocessed document(s)", len(unprocessed))

            if not unprocessed:
                return {
                    "status": "success",
                    "message": "No unprocessed documents",
                    "processed": 0,
                    "failed": 0,
                    "orphans_deleted": orphans_deleted,
                }

            processed_count = 0
            failed_count = 0

            for vault in unprocessed:
                success = await cls.process_vault_document(str(vault.id))
                if success:
                    processed_count += 1
                else:
                    failed_count += 1
                await asyncio.sleep(0.5)

            logger.info("=" * 60)
            logger.info("✅ Cron complete — processed: %d | failed: %d | orphans deleted: %d",
                processed_count, failed_count, orphans_deleted)
            logger.info("=" * 60)

            return {
                "status": "success" if failed_count == 0 else "partial",
                "processed": processed_count,
                "failed": failed_count,
                "total": len(unprocessed),
                "orphans_deleted": orphans_deleted,
            }

        except Exception as e:
            logger.error("Cron job failed: %s", e)
            return {
                "status": "error",
                "message": str(e),
                "processed": 0,
                "failed": 0,
                "orphans_deleted": orphans_deleted,
            }


# Export for scheduling
rag_pipeline = RAGPipeline()
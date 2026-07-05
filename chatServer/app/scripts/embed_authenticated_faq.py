import sys
import os
import json
import asyncio
import logging

# Add parent dir to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.database import Database
from app.ai.llm.embeddingService import EmbeddingService
from app.services.embeddingService import EmbeddingStorageService
from app.models.embeddingModel import SemanticCacheInsert

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    logger.info("Initializing Database...")
    await Database.connect_db()

    logger.info("Initializing EmbeddingService...")
    EmbeddingService.init()

    dataset_path = os.path.join(os.path.dirname(__file__), "authenticated_faq_dataset.json")
    with open(dataset_path, "r", encoding="utf-8") as f:
        faqs = json.load(f)

    # First, let's clear existing FAQs to avoid duplicates if run multiple times
    try:
        col = Database.faq_embeddings_collection()
        await col.delete_many({"type": "auth_faq"})
        logger.info("Cleared old authenticated FAQ embeddings from faq_embeddings collection.")
    except Exception as e:
        logger.warning(f"Could not clear old embeddings: {e}")

    variations = []
    answers = []
    faq_ids = []

    for faq in faqs:
        # Also embed the high quality answer itself just in case
        all_texts = [faq["high_quality_answer"]] + faq["search_variations"]
        for text in all_texts:
            variations.append(text)
            answers.append(faq["high_quality_answer"])
            faq_ids.append(faq["id"])

    logger.info(f"Generating embeddings for {len(variations)} authenticated FAQ variations...")
    
    batch_size = 50
    inserted_count = 0
    
    for i in range(0, len(variations), batch_size):
        batch_vars = variations[i:i+batch_size]
        batch_ans = answers[i:i+batch_size]
        batch_ids = faq_ids[i:i+batch_size]
        
        embeddings = await EmbeddingService.embed_chunks(batch_vars)
        
        inserts = []
        for j, emb in enumerate(embeddings):
            inserts.append(SemanticCacheInsert(
                embedding=emb,
                type="auth_faq",
                userId="system",
                query=batch_vars[j],
                response=batch_ans[j]
            ))
            
        await EmbeddingStorageService.insert_auth_faq_batch(inserts)
        inserted_count += len(inserts)
        logger.info(f"Inserted {inserted_count}/{len(variations)} embeddings...")
        
        if inserted_count % 100 == 0 and inserted_count < len(variations):
            logger.info("Sleeping for 65s to reset the 100-request/min API rate limit...")
            import time
            time.sleep(65)
        elif inserted_count < len(variations):
            import time
            time.sleep(2)

    logger.info("✅ Done! Authenticated FAQ Semantic Cache initialized.")
    await Database.close_db()

if __name__ == "__main__":
    asyncio.run(main())

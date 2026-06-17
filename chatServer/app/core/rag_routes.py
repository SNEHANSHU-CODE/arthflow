"""
RAG API Routes
Exposes:
  GET  /api/rag/vaults  — list user's processed vaults (for toggle)
  POST /api/rag/query   — direct REST RAG query (optional, websocket is primary)
"""
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from app.core.database import Database
from app.ai.llm.ragQueryService import RAGQueryService
from app.ai.llm.ragPipeline import rag_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rag", tags=["rag"])


@router.post("/trigger-embedding")
async def trigger_embedding(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger RAG pipeline embedding immediately.
    Client calls this directly.
    """
    try:
        scheduler = getattr(request.app.state, "scheduler", None)
        if scheduler and scheduler.running:
            job = scheduler.get_job("rag_pipeline_watcher")
            if job:
                logger.info("Triggered immediate execution of RAG pipeline via scheduler")
                job.modify(next_run_time=datetime.now(scheduler.timezone))
                return {"status": "success", "detail": "RAG pipeline scheduled immediately"}
        
        # Fallback to FastAPI background task if scheduler is not running/available
        logger.info("Triggered immediate execution of RAG pipeline via background task fallback")
        background_tasks.add_task(rag_pipeline.process_all_unprocessed)
        return {"status": "success", "detail": "RAG pipeline started in background"}
    except Exception as e:
        logger.error("Failed to trigger embedding: %s", e)
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/vaults")
async def get_processed_vaults(user_id: str):
    """
    Return list of vault documents that have embeddings ready.
    Called by VaultRAGToggle component on mount.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    try:
        vaults = await RAGQueryService.get_user_processed_vaults(user_id)
        return {"vaults": vaults, "count": len(vaults)}
    except Exception as e:
        logger.error("Error fetching processed vaults: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
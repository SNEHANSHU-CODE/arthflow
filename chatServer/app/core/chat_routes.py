"""
Chat API Routes
Exposes chat functionality through REST endpoints
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import Database
from app.ai.orchestrator import get_orchestrator
from app.ai.memory.chat_memory import ChatMemory


logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/chat", tags=["chat"])


# Request/Response Models
class ChatMessage(BaseModel):
    """Chat message model"""
    content: str = Field(..., min_length=1, max_length=5000)
    provider: Optional[str] = Field(None, description="LLM provider: 'groq' or 'gemini' (defaults to configured DEFAULT_LLM)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "content": "How much did I spend on food last month?",
                "provider": "groq"
            }
        }


class ChatResponse(BaseModel):
    """Chat response model"""
    status: str
    response: str
    query: Optional[str] = None
    intent: Optional[dict] = None
    is_authenticated: bool
    timestamp: str
    provider: str


class ErrorResponse(BaseModel):
    """Error response model"""
    status: str = "error"
    error: str
    detail: Optional[str] = None


class ChatHistoryItem(BaseModel):
    """Single chat history item"""
    type: str  # "human" or "ai"
    content: str
    timestamp: Optional[str] = None


async def get_db() -> AsyncIOMotorDatabase:
    """Dependency for getting database connection"""
    return Database.get_db()


@router.post(
    "/query",
    response_model=ChatResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    }
)
async def chat_query(
    request: Request,
    message: ChatMessage,
    user_id: Optional[str] = Header(None),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> ChatResponse:
    """
    Process a chat query
    
    - **content**: User's message
    - **provider**: LLM provider (groq or gemini)
    - **user_id** (optional, header): User ID for authenticated requests
    
    If user_id is provided:
    - Query goes directly to LLM (authenticated flow)
    - Access to user's financial data
    
    If user_id is not provided:
    - Query is classified by intent (unauthenticated flow)
    - Generic advice without user-specific data
    """
    try:
        logger.info(f"Processing chat query - Authenticated: {bool(user_id)}")
        
        # Validate provider
        if message.provider is not None and message.provider not in ["groq", "gemini"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provider must be 'groq' or 'gemini'"
            )
        
        # Get orchestrator
        orchestrator = await get_orchestrator(db)
        
        # Process query
        result = await orchestrator.process_query(
            query=message.content,
            user_id=user_id,
            provider=message.provider
        )
        
        # Explicitly persist chat memory for REST queries
        if user_id and result.get("status") != "error":
            try:
                memory = ChatMemory(user_id=user_id, db=db)
                await memory.add_message(message.content, message_type="human")
                await memory.add_message(
                    result["response"],
                    message_type="ai",
                    metadata={
                        "provider": message.provider or result.get("provider"),
                        "is_rag": False,
                        "messageId": f"rest-{__import__('uuid').uuid4().hex}"
                    }
                )
            except Exception as e:
                logger.error(f"Failed to persist chat memory: {e}")
        
        # Handle errors
        if result.get("status") == "error":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Unknown error")
            )
        
        # Format response
        return ChatResponse(
            status=result["status"],
            response=result["response"],
            query=result.get("query"),
            intent=result.get("intent"),
            is_authenticated=result.get("is_authenticated", False),
            timestamp=result.get("timestamp"),
            provider=message.provider
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in chat_query: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get(
    "/history",
    response_model=list,
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    }
)
async def get_chat_history(
    user_id: Optional[str] = Header(None),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> list:
    """
    Get chat history for authenticated user
    
    - **user_id**: User ID (required)
    
    Returns list of chat messages ordered chronologically
    """
    try:
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="user_id required"
            )
        
        orchestrator = await get_orchestrator(db)
        history = await orchestrator.get_chat_history(user_id)
        
        return history
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving chat history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving chat history"
        )


@router.delete(
    "/history",
    response_model=dict,
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    }
)
async def clear_chat_history(
    user_id: Optional[str] = Header(None),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> dict:
    """
    Clear chat history for authenticated user
    
    - **user_id**: User ID (required)
    """
    try:
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="user_id required"
            )
        
        orchestrator = await get_orchestrator(db)
        result = await orchestrator.clear_chat_history(user_id)
        
        if result.get("status") == "error":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing chat history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error clearing chat history"
        )


@router.get(
    "/health",
    response_model=dict
)
async def health_check(
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> dict:
    """
    Check chat service health
    """
    try:
        orchestrator = await get_orchestrator(db)
        return {
            "status": "healthy",
            "service": "chat",
            "llm_initialized": orchestrator.llm is not None,
            "timestamp": __import__("datetime").datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "chat",
            "error": str(e)
        }
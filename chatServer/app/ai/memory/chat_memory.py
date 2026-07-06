"""
Memory Management for Chat History
Fully DB-backed — no in-memory message storage.
Two collections:
  - chat_history   : one doc per user, messages array (persistent chat)
  - training_logs  : append-only, one doc per message (SLM training data)
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import Database
from bson import ObjectId

logger = logging.getLogger(__name__)

# How many recent messages to load into LLM context window
LLM_CONTEXT_WINDOW = 20

# How many messages to return to frontend on history load
DISPLAY_HISTORY_LIMIT = 50


class ChatMemory:
    """
    Fully DB-backed conversation memory.
    No messages are stored in RAM between requests.

    chat_history schema (one doc per user):
    {
        "userId": "string",
        "messages": [
            {
                "role": "human" | "ai",
                "content": "...",
                "provider": "grok" | "gemini" | null,
                "isRag": false,
                "documentName": null,
                "timestamp": ISODate
            }
        ],
        "updatedAt": ISODate,
        "createdAt": ISODate
    }
    """

    CHAT_COLLECTION = "chat_history"
    TRAINING_COLLECTION = "training_logs"

    def __init__(self, user_id: str, db: Optional[AsyncIOMotorDatabase] = None):
        self.user_id = str(user_id)
        self.db = db  # kept for backwards compat but not used — Database singleton is used directly

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def add_message(
        self,
        content: str,
        message_type: str = "human",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Persist one message to chat_history (upsert into messages array)
        and append to training_logs.
        """
        metadata = metadata or {}
        msg_doc = {
            "id": metadata.get("messageId"),
            "role": message_type,          # "human" or "ai"
            "content": content,
            "provider": metadata.get("provider"),
            "isRag": metadata.get("is_rag", False),
            "documentName": metadata.get("document_name"),
            "timestamp": datetime.utcnow(),
        }

        try:
            col = Database.chat_history_collection()
            await col.update_one(
                {"userId": self.user_id},
                {
                    "$push": {"messages": msg_doc},
                    "$set":  {"updatedAt": datetime.utcnow()},
                    "$setOnInsert": {"createdAt": datetime.utcnow()},
                },
                upsert=True,
            )
        except Exception as e:
            logger.error("ChatMemory.add_message — chat_history write failed: %s", e)

        # Only write LLM responses to training_logs (skip semantic cache hits)
        provider = metadata.get("provider", "")
        if provider not in ["cache", "semantic_cache"]:
            await self._write_training_log(content, message_type, metadata)

    async def get_conversation_history(self) -> List[BaseMessage]:
        """
        Return last N messages as LangChain message objects for LLM context.
        Called by orchestrator before every LLM invocation.
        """
        try:
            col = Database.chat_history_collection()
            doc = await col.find_one(
                {"userId": self.user_id},
                {"messages": {"$slice": -LLM_CONTEXT_WINDOW}},
            )
            if not doc or not doc.get("messages"):
                return []

            history: List[BaseMessage] = []
            for m in doc["messages"]:
                if m["role"] == "human":
                    history.append(HumanMessage(content=m["content"]))
                else:
                    history.append(AIMessage(content=m["content"]))
            return history

        except Exception as e:
            logger.error("ChatMemory.get_conversation_history failed: %s", e)
            return []

    async def get_finance_history(self) -> List[BaseMessage]:
        """
        Return last N finance-only messages (isRag=False) for LLM context.
        Called by process_authenticated_query() so RAG exchanges never
        pollute the finance chat context window.
        """
        try:
            col = Database.chat_history_collection()
            # Fetch a larger slice so we still have LLM_CONTEXT_WINDOW
            # finance messages after filtering out RAG ones.
            doc = await col.find_one(
                {"userId": self.user_id},
                {"messages": {"$slice": -(LLM_CONTEXT_WINDOW * 3)}},
            )
            if not doc or not doc.get("messages"):
                return []

            finance_msgs = [m for m in doc["messages"] if not m.get("isRag", False)]
            history: List[BaseMessage] = []
            for m in finance_msgs[-LLM_CONTEXT_WINDOW:]:
                if m["role"] == "human":
                    history.append(HumanMessage(content=m["content"]))
                else:
                    history.append(AIMessage(content=m["content"]))
            return history

        except Exception as e:
            logger.error("ChatMemory.get_finance_history failed: %s", e)
            return []

    async def get_rag_history(self, document_name: str, limit: int = 4) -> List[BaseMessage]:
        """
        Return last N RAG messages scoped to a specific document.
        Called by process_rag_query() so finance exchanges never
        pollute the document Q&A context window.

        limit=4 covers 2 full exchanges — enough for pronoun follow-ups
        (explain that, is that fixed or variable?) without adding noise.
        """
        try:
            col = Database.chat_history_collection()
            doc = await col.find_one({"userId": self.user_id})
            if not doc or not doc.get("messages"):
                return []

            rag_msgs = [
                m for m in doc["messages"]
                if m.get("isRag") and m.get("documentName") == document_name
            ]

            history: List[BaseMessage] = []
            for m in rag_msgs[-limit:]:
                if m["role"] == "human":
                    history.append(HumanMessage(content=m["content"]))
                else:
                    history.append(AIMessage(content=m["content"]))
            return history

        except Exception as e:
            logger.error("ChatMemory.get_rag_history failed: %s", e)
            return []

    async def get_recent_for_display(self, limit: int = DISPLAY_HISTORY_LIMIT) -> List[Dict[str, Any]]:
        """
        Return last N messages as plain dicts for frontend display.
        Called by handle_get_chat_history socket event.
        """
        try:
            col = Database.chat_history_collection()
            doc = await col.find_one(
                {"userId": self.user_id},
                {"messages": {"$slice": -limit}},
            )
            if not doc or not doc.get("messages"):
                return []

            result = []
            for m in doc["messages"]:
                result.append({
                    "role":         m.get("role"),
                    "content":      m.get("content"),
                    "provider":     m.get("provider"),
                    "isRag":        m.get("isRag", False),
                    "documentName": m.get("documentName"),
                    "timestamp":    m["timestamp"].isoformat() if isinstance(m.get("timestamp"), datetime) else m.get("timestamp"),
                })
            return result

        except Exception as e:
            logger.error("ChatMemory.get_recent_for_display failed: %s", e)
            return []

    async def clear_history(self) -> None:
        """
        Clear chat_history messages array for this user.
        Training logs are never deleted.
        """
        try:
            col = Database.chat_history_collection()
            await col.update_one(
                {"userId": self.user_id},
                {"$set": {"messages": [], "updatedAt": datetime.utcnow()}},
            )
            logger.info("Chat history cleared for user %s", self.user_id)
        except Exception as e:
            logger.error("ChatMemory.clear_history failed: %s", e)

    # ------------------------------------------------------------------
    # Training log (append-only, never deleted)
    # ------------------------------------------------------------------

    async def _write_training_log(
        self,
        content: str,
        role: str,
        metadata: Dict[str, Any],
    ) -> None:
        """
        Append one row to training_logs collection.
        Never updated or deleted — used for SLM fine-tuning later.
        """
        try:
            col = Database.training_logs_collection()
            await col.insert_one({
                "userId":       self.user_id,
                "role":         role,
                "content":      content,
                "provider":     metadata.get("provider"),
                "isRag":        metadata.get("is_rag", False),
                "documentName": metadata.get("document_name"),
                "messageId":    metadata.get("messageId"),
                "timestamp":    datetime.utcnow(),
            })
        except Exception as e:
            # Training log failure must never break the chat flow
            logger.warning("ChatMemory._write_training_log failed (non-fatal): %s", e)

    # ------------------------------------------------------------------
    # Legacy compatibility — kept so nothing else breaks
    # ------------------------------------------------------------------

    async def get_persisted_history(self, limit: int = DISPLAY_HISTORY_LIMIT) -> List[Dict[str, Any]]:
        """Alias for get_recent_for_display — backwards compat."""
        return await self.get_recent_for_display(limit)


# ---------------------------------------------------------------------------
# ConversationBuffer — unchanged, used by some guest paths
# ---------------------------------------------------------------------------

class ConversationBuffer:
    """Token-aware sliding window buffer (in-memory, per-request only)."""

    def __init__(self, max_tokens: int = 4096):
        self.max_tokens = max_tokens
        self.current_tokens = 0
        self.messages: List[BaseMessage] = []

    def add_message(self, message: BaseMessage, token_estimate: int = 100) -> bool:
        if self.current_tokens + token_estimate > self.max_tokens:
            if self.messages:
                self.messages.pop(0)
                self.current_tokens -= token_estimate
            else:
                return False
        self.messages.append(message)
        self.current_tokens += token_estimate
        return True

    def get_messages(self) -> List[BaseMessage]:
        return self.messages

    def clear(self) -> None:
        self.messages = []
        self.current_tokens = 0
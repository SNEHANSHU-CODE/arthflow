"""
WebSocket Socket.IO Event Handlers (Simplified)
Responsibilities:
1. Handle client connections/disconnections
2. JWT authentication
3. Dispatch user queries to LLM response handler
4. Send response-related messages only (connection/network status)

Does NOT handle:
- Business logic responses (handled by response_handler.py)
- User data responses
"""
import logging
import re
from typing import Dict, Any
from datetime import datetime
import asyncio
import time
from bson import ObjectId
from bson.errors import InvalidId

from app.core.jwt import authenticate_user, get_auth_method_from_user
from app.services.userService import get_user_service
from app.websocket.logger import WebSocketLogger
from app.websocket.response_handler import MessageResponseHandler

from app.services.embeddingService import EmbeddingStorageService
from app.ai.llm.embeddingService import EmbeddingService
from app.ai.orchestrator import get_orchestrator
from app.core.database import Database
from app.ai.config import llm_settings
from app.ai.llm.init import llm_provider
from langchain_core.messages import SystemMessage, HumanMessage
from app.ai.prompts.guestTemplate import (
    GUEST_SYSTEM_PROMPT,
    GuestPromptBuilder,
    GUEST_SIGNIN_PROMPT
)
from app.ai.utils.pii_masker import mask_message, get_safety_message
from app.ai.utils.fast_classifier import classify
from app.services.vaultService import vault_service

logger = logging.getLogger(__name__)


class SocketEventHandlers:
    """
    Simplified Socket.IO event handlers
    - Only handles connection/network concerns
    - Delegates response generation to response_handler module
    """
    
    def __init__(self, sio):
        self.sio = sio
        # Store session data: sid -> {user_id, is_authenticated, username, conversation_history}
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def get_session(self, sid: str) -> Dict[str, Any]:
        """Get or create session data for a socket"""
        if sid not in self.sessions:
            self.sessions[sid] = {
                "user_id": None,
                "is_authenticated": False,
                "username": None,
                "connected_at": datetime.utcnow().isoformat() + "Z",
                "last_message_time": 0.0,
            }
        return self.sessions[sid]
    
    def cleanup_session(self, sid: str):
        """Remove session data when socket disconnects"""
        if sid in self.sessions:
            del self.sessions[sid]
    
    # ===== CONNECTION HANDLERS =====
    
    async def handle_connect(self, sid: str, environ: dict):
        """
        Handle new socket connection
        Accepts all connections (authenticated and guest)
        Auto-authenticates if token provided
        
        RESPONSE: Only connection confirmation
        """
        logger.info(f"🔌 Client connecting: {sid}")
        
        # Initialize session (as guest by default)
        session = self.get_session(sid)
        
        # Try to auto-authenticate from token in query or headers
        try:
            query_string = environ.get('QUERY_STRING', '')
            headers = environ.get('HTTP_AUTHORIZATION', '')
            
            # Extract token from query string or Authorization header
            token = None
            if 'token=' in query_string:
                import urllib.parse
                query_params = urllib.parse.parse_qs(query_string)
                token = query_params.get('token', [None])[0]
            
            if not token and headers and headers.startswith('Bearer '):
                token = headers[7:]
            
            # Try to authenticate with token
            if token:
                user_service = get_user_service()
                is_authenticated, user_data = await authenticate_user(
                    token=token,
                    provided_user_id=None,
                    user_service=user_service
                )
                
                if is_authenticated:
                    session["is_authenticated"] = True
                    session["user_id"] = user_data["user_id"]
                    session["username"] = user_data["username"]
                    WebSocketLogger.log_user_connected(user_data["username"], True)
                    logger.info(f"✅ Auto-authenticated: {sid} → {user_data['username']}")
                else:
                    logger.warning(f"⚠️ Token validation failed for {sid}, treating as guest")
                    WebSocketLogger.log_user_connected("guest", False)
            else:
                WebSocketLogger.log_user_connected("guest", False)
                
        except Exception as e:
            logger.warning(f"⚠️ Error during connect-time auth: {e}")
            WebSocketLogger.log_user_connected("guest", False)
        
        return True  # Accept connection
    
    async def handle_disconnect(self, sid: str):
        """
        Handle socket disconnection
        Logs disconnection with user type
        """
        session = self.get_session(sid)
        is_authenticated = session.get("is_authenticated", False)
        username = session.get("username", "unknown")
        
        WebSocketLogger.log_user_disconnected(username, is_authenticated)
        self.cleanup_session(sid)
    
    # ===== AUTHENTICATION HANDLER =====
    
    async def handle_authenticate(self, sid: str, data: dict):
        """
        Handle authentication request
        
        Client sends: {userId: str|null, token: str|null}
        
        RESPONSE: Only {isAuthenticated: bool, username: str}
        """
        data = data or {}
        token = data.get("token")
        provided_user_id = data.get("userId")
        
        user_service = get_user_service()
        
        # Authenticate user
        is_authenticated, user_data = await authenticate_user(
            token=token,
            provided_user_id=provided_user_id,
            user_service=user_service
        )
        
        # Update session
        session = self.get_session(sid)
        session["is_authenticated"] = is_authenticated
        session["user_id"] = user_data["user_id"]
        session["username"] = user_data.get("username", "guest")
        
        # Log authentication
        if is_authenticated:
            username = user_data["username"]
            WebSocketLogger.log_user_connected(username, True)
            logger.info(f"✅ Authenticated: {sid} → {username}")
        else:
            WebSocketLogger.log_user_connected("guest", False)
            logger.info(f"👤 Guest: {sid}")
        
        # Send ONLY connection status (not user data)
        response = {
            "isAuthenticated": is_authenticated,
            "username": session["username"],
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        await self.sio.emit('authenticated', response, room=sid)
    
    # ===== MESSAGE HANDLER =====
    
    async def handle_send_message(self, sid: str, data: dict):
        """
        Handle incoming message
        Dispatches to response handler for LLM processing with token-by-token streaming.
        
        RESPONSE: Emissions of bot_response_chunk (isFirst, isLast)
        """
        try:
            data = data or {}
            message = data.get("message", "").strip()
            # conversationHistory from client is intentionally ignored.
            # History is fetched securely from MongoDB via ChatMemory.
            request_id = data.get("requestId")

            # A-1: Validate vault_id format before use
            vault_id = data.get("vault_id") or None  # RAG mode if set
            if vault_id:
                try:
                    ObjectId(vault_id)  # format check only
                except (InvalidId, TypeError):
                    await self.sio.emit('error', {
                        "message": "Invalid vault ID.",
                        "code": "INVALID_VAULT_ID",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }, room=sid)
                    return

            # L-1: Allowlist currencySymbol to block prompt injection
            _ALLOWED_CURRENCY = re.compile(r'^[\$\€\£\¥\₹\₩\₪\₺\₦\฿]{1,5}$')
            raw_currency = data.get("currencySymbol", "₹")
            currency_symbol = raw_currency if _ALLOWED_CURRENCY.match(str(raw_currency)) else "₹"
            
            # Validate message
            if not message:
                await self.sio.emit('error', {
                    "message": "Empty message",
                    "code": "INVALID_MESSAGE",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)
                return
                
            # Message Length Limiter (Prompt Bombing Protection)
            if len(message) > 500:
                await self.sio.emit('error', {
                    "message": "Message is too long. Please keep it under 500 characters.",
                    "code": "MESSAGE_TOO_LONG",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)
                return

            # Rate Limiter (DDoS Protection)
            session = self.get_session(sid)
            current_time = time.time()
            if current_time - session.get("last_message_time", 0.0) < 1.0:
                await self.sio.emit('error', {
                    "message": "You are sending messages too quickly. Please wait a moment.",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)
                return
            session["last_message_time"] = current_time
            
            
            # Send typing indicator
            await self.sio.emit('bot_typing', {
                "isTyping": True,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)

            # Removed inline imports
            # Get session
            session = self.get_session(sid)
            is_authenticated = session.get("is_authenticated", False)
            user_id = session.get("user_id")
            username = session.get("username", "guest")

            # PII masking
            pii_result = mask_message(message)
            masked_msg = pii_result.masked
            safety_message = get_safety_message(pii_result)
            prefix_text = ""
            if pii_result.has_sensitive_info and safety_message:
                prefix_text = f"{safety_message}\n\n"

            # Initialize orchestrator & database
            db = Database.get_db()
            orchestrator = await get_orchestrator(db)

            messages = []
            llm = None
            memory = None
            metadata = {}
            provider = "fallback"
            is_static_guest_response = False
            static_guest_text = ""

            try:
                if is_authenticated and vault_id:
                    # ✅ NEW: Log exact user_id and vault_id used for RAG query
                    logger.info(
                        "🔒 RAG mode triggered — session user_id=%r vault_id=%r (types: %s / %s)",
                        str(user_id), str(vault_id), type(user_id).__name__, type(vault_id).__name__,
                    )
                    
                    # RAG Mode
                    # Validate Vault Ownership
                    vault = await vault_service.get_by_id(vault_id, user_id=user_id)
                    if not vault:
                        await self.sio.emit('bot_typing', {"isTyping": False}, room=sid)
                        await self.sio.emit('error', {
                            "message": "Vault not found",
                            "code": "VAULT_NOT_FOUND",
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        }, room=sid)
                        return

                    messages, llm, provider, memory, rag_metadata = await orchestrator.prepare_rag_query(
                        query=masked_msg,
                        user_id=user_id,
                        vault_id=vault_id,
                    )
                    metadata = {
                        "response_type": "rag",
                        "vault_id": vault_id,
                        **rag_metadata
                    }
                    if rag_metadata.get("no_match"):
                        logger.info("RAG no_match for query '%s', falling back to DB profile in websocket.", masked_msg)
                        messages, llm, provider, memory = await orchestrator.prepare_authenticated_query(
                            user_id=user_id,
                            query=masked_msg,
                            currency_symbol=currency_symbol,
                        )
                        metadata = {"response_type": "authenticated"}
                    elif not rag_metadata.get("is_rag", True):
                        metadata["response_type"] = "authenticated"
                elif is_authenticated:
                    # Standard Authenticated Mode
                    # 1. ==== SEMANTIC CACHE ====
                    cache_hit = False
                    is_static_auth_response = False
                    static_auth_text = ""
                    
                    try:
                        from app.ai.orchestrator import _classify_intent
                        intent = await _classify_intent(masked_msg)
                        needs_data = any([
                            intent.get("needs_transactions", False),
                            intent.get("needs_goals", False),
                            intent.get("needs_reminders", False),
                            intent.get("needs_budgets", False)
                        ])
                        
                        if not needs_data:
                            query_emb = await EmbeddingService.embed_query(masked_msg)
                            results = await EmbeddingStorageService.auth_faq_vector_search(
                                query_embedding=query_emb,
                                limit=1
                            )
                            if results and results[0].score >= 0.85:
                                cache_hit = True
                                is_static_auth_response = True
                                static_auth_text = results[0].response
                                provider = "semantic_cache"
                                metadata = {"response_type": "authenticated_cache"}
                                logger.info(f"✅ Auth Cache hit: '{masked_msg}' (score: {results[0].score:.2f})")
                    except Exception as e:
                        logger.error(f"Auth Cache lookup failed: {e}")

                    if not cache_hit:
                        messages, llm, provider, memory = await orchestrator.prepare_authenticated_query(
                            user_id=user_id,
                            query=masked_msg,
                            currency_symbol=currency_symbol,
                            intent=intent if 'intent' in locals() else None,
                        )
                        metadata = {"response_type": "authenticated"}
                else:
                    # Guest Mode — Order: Cache → LLM
                    # The cache handles both: FAQ answers AND auth redirects (via faq_redirect_* entries).
                    # The LLM is the last resort only for truly unknown questions.

                    # 1. ==== SEMANTIC CACHE (zero token cost) ====
                    cache_hit = False
                    try:
                        query_emb = await EmbeddingService.embed_query(masked_msg)
                        results = await EmbeddingStorageService.faq_vector_search(
                            query_embedding=query_emb,
                            limit=1
                        )
                        if results and results[0].score >= 0.85:
                            cache_hit = True
                            is_static_guest_response = True
                            static_guest_text = results[0].response
                            provider = "cache"
                            metadata = {"response_type": "guest_cache", "needs_authentication": False}
                            logger.info(f"✅ Semantic Cache hit for guest query: '{masked_msg}' (score: {results[0].score:.2f})")
                    except Exception as e:
                        logger.error(f"Semantic Cache lookup failed: {e}")

                    if not cache_hit:
                        # 2. ==== LLM FALLBACK ====
                        # Guest system prompt instructs the LLM to redirect personal data queries.
                        prompt_vars = GuestPromptBuilder.build_guest_prompt(user_input=masked_msg)
                        system_prompt = GUEST_SYSTEM_PROMPT.format(**prompt_vars)
                        messages = [
                            SystemMessage(content=system_prompt),
                            HumanMessage(content=masked_msg)
                        ]
                        provider = llm_settings.DEFAULT_LLM
                        llm = await llm_provider.get_default_llm()
                        metadata = {"response_type": "guest", "needs_authentication": False}

                # Stop typing immediately since streaming starts
                await self.sio.emit('bot_typing', {
                    "isTyping": False,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)

                # Generate unique message ID
                message_id = f"msg-{datetime.utcnow().timestamp()}-{request_id}"

                # Emit first chunk (isFirst=True) to initialize client container
                await self.sio.emit('bot_response_chunk', {
                    "messageId": message_id,
                    "chunk": prefix_text,
                    "isFirst": True,
                    "isLast": False,
                    "provider": provider,
                    "metadata": None,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)

                accumulated_text = prefix_text

                if is_static_guest_response or locals().get('is_static_auth_response', False):
                    words = static_guest_text.split(" ") if is_static_guest_response else static_auth_text.split(" ")
                    for i, word in enumerate(words):
                        chunk = word + (" " if i < len(words) - 1 else "")
                        accumulated_text += chunk
                        await self.sio.emit('bot_response_chunk', {
                            "messageId": message_id,
                            "chunk": chunk,
                            "isFirst": False,
                            "isLast": False,
                            "provider": provider,
                            "metadata": None,
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        }, room=sid)
                        await asyncio.sleep(0.015)
                else:
                    # Stream tokens from LLM
                    try:
                        async for chunk in llm.astream(messages):
                            token = chunk.content if hasattr(chunk, 'content') else str(chunk)
                            accumulated_text += token
                            await self.sio.emit('bot_response_chunk', {
                                "messageId": message_id,
                                "chunk": token,
                                "isFirst": False,
                                "isLast": False,
                                "provider": provider,
                                "metadata": None,
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                            }, room=sid)
                    except Exception as stream_error:
                        logger.warning("Stream failed for primary provider, attempting fallback...")
                        if provider != "gemini":
                            try:
                                # Terminate old broken bubble
                                await self.sio.emit('bot_response_chunk', {
                                    "messageId": message_id,
                                    "chunk": "",
                                    "isFirst": False,
                                    "isLast": True,
                                    "provider": provider,
                                    "metadata": {"error": "stream_failed"},
                                    "timestamp": datetime.utcnow().isoformat() + "Z",
                                }, room=sid)

                                # Reset state and create a new clean message bubble
                                message_id = f"msg-{datetime.utcnow().timestamp()}-{request_id}-fallback"
                                accumulated_text = prefix_text

                                # Start the new clean bubble
                                await self.sio.emit('bot_response_chunk', {
                                    "messageId": message_id,
                                    "chunk": prefix_text,
                                    "isFirst": True,
                                    "isLast": False,
                                    "provider": "gemini",
                                    "metadata": None,
                                    "timestamp": datetime.utcnow().isoformat() + "Z",
                                }, room=sid)

                                fallback_llm = await llm_provider.get_gemini_llm()
                                async for chunk in fallback_llm.astream(messages):
                                    token = chunk.content if hasattr(chunk, 'content') else str(chunk)
                                    accumulated_text += token
                                    await self.sio.emit('bot_response_chunk', {
                                        "messageId": message_id,
                                        "chunk": token,
                                        "isFirst": False,
                                        "isLast": False,
                                        "provider": "gemini",
                                        "metadata": None,
                                        "timestamp": datetime.utcnow().isoformat() + "Z",
                                    }, room=sid)
                                provider = "gemini"
                            except Exception as fallback_err:
                                logger.error("Fallback stream failed as well: %s", fallback_err)
                                raise fallback_err
                        else:
                            raise stream_error

                # --- Seamless Pivot Fallback Logic ---
                if metadata.get("response_type") == "rag" and "couldn't find that in the document" in accumulated_text.lower():
                    logger.info("RAG LLM stream failed to find info. Pivoting to DB fallback...")
                    
                    transition_text = "\n\n*Let me check your personal account data...*\n\n"
                    accumulated_text += transition_text
                    
                    await self.sio.emit('bot_response_chunk', {
                        "messageId": message_id,
                        "chunk": transition_text,
                        "isFirst": False,
                        "isLast": False,
                        "provider": provider,
                        "metadata": None,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }, room=sid)
                    
                    # A-2: Fetch DB context with timeout guard
                    db_messages = None
                    db_llm = None
                    db_provider = provider
                    try:
                        db_messages, db_llm, db_provider, db_memory = await asyncio.wait_for(
                            orchestrator.prepare_authenticated_query(
                                user_id=user_id,
                                query=masked_msg,
                                currency_symbol=currency_symbol,
                            ),
                            timeout=15.0
                        )
                    except asyncio.TimeoutError:
                        logger.error("Pivot DB fallback timed out for user %s — skipping pivot", user_id)

                    # Stream DB response into the same bubble (only if fetch succeeded)
                    if db_messages and db_llm:
                        try:
                            async for chunk in db_llm.astream(db_messages):
                                token = chunk.content if hasattr(chunk, 'content') else str(chunk)
                                accumulated_text += token
                                await self.sio.emit('bot_response_chunk', {
                                    "messageId": message_id,
                                    "chunk": token,
                                    "isFirst": False,
                                    "isLast": False,
                                    "provider": db_provider,
                                    "metadata": None,
                                    "timestamp": datetime.utcnow().isoformat() + "Z",
                                }, room=sid)
                            provider = db_provider
                            metadata["response_type"] = "authenticated_fallback"
                        except Exception as fallback_stream_err:
                            logger.error(f"Fallback stream during pivot failed: {fallback_stream_err}")
                # ------------------------------------

                # Save complete messages to MongoDB
                if is_authenticated and memory:
                    await memory.add_message(masked_msg, message_type="human", metadata=metadata)
                    await memory.add_message(accumulated_text, message_type="ai", metadata={"provider": provider, "messageId": message_id, **metadata})

                # Emit final chunk (isLast=True)
                await self.sio.emit('bot_response_chunk', {
                    "messageId": message_id,
                    "chunk": "",
                    "isFirst": False,
                    "isLast": True,
                    "provider": provider,
                    "metadata": metadata,
                    "response": accumulated_text,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)

            except Exception as e:
                logger.error(f"❌ Error generating response: {e}", exc_info=True)
                await self.sio.emit('bot_typing', {"isTyping": False}, room=sid)
                
                # Terminate the original message bubble if it was streaming
                try:
                    # message_id might be unbound if it failed early, so we check using locals()
                    if 'message_id' in locals() and message_id:
                        await self.sio.emit('bot_response_chunk', {
                            "messageId": message_id,
                            "chunk": "",
                            "isFirst": False,
                            "isLast": True,
                            "provider": provider if 'provider' in locals() else "fallback",
                            "metadata": {"error": "stream_failed"},
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        }, room=sid)
                except Exception:
                    pass
                    
                error_msg = "I'm having trouble processing your request. Please try again."
                await self.sio.emit('bot_response_chunk', {
                    "messageId": f"error-{datetime.utcnow().timestamp()}",
                    "chunk": error_msg,
                    "isFirst": True,
                    "isLast": True,
                    "provider": "fallback",
                    "metadata": {"error": True, "response_type": "error"},
                    "response": error_msg,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)
        
        except Exception as e:
            logger.error(f"❌ Error handling message: {e}", exc_info=True)
            await self.sio.emit('error', {
                "message": "Failed to process message",
                "code": "MESSAGE_ERROR",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)
    
    # ===== UTILITY HANDLERS =====

    
    async def handle_get_chat_history(self, sid: str, data: dict = None):
        """
        Emit last 50 messages from DB to the requesting client.
        Frontend calls this right after authentication to restore chat on page load.
        """
        try:
            session = self.get_session(sid)
            user_id = session.get("user_id")

            if not user_id or not session.get("is_authenticated"):
                await self.sio.emit("chat_history", {
                    "messages": [],
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }, room=sid)
                return

            from app.ai.orchestrator import get_orchestrator
            from app.core.database import Database
            db = Database.get_db()
            orchestrator = await get_orchestrator(db)
            messages = await orchestrator.get_chat_history(user_id)

            await self.sio.emit("chat_history", {
                "messages": messages,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)

            logger.info(f"📜 Sent {len(messages)} history messages to user {user_id}")

        except Exception as e:
            logger.error(f"❌ Error fetching chat history: {e}", exc_info=True)
            await self.sio.emit("chat_history", {
                "messages": [],
                "error": "Failed to load history",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)

    async def handle_get_suggestions(self, sid: str, data: dict):
        """Handle request for smart suggestions"""
        try:
            session = self.get_session(sid)
            is_authenticated = session.get("is_authenticated", False)
            user_data = session.get("user_data", {})
            
            logger.info(f"💡 Suggestions requested ({'AUTH' if is_authenticated else 'GUEST'})")
            
            # Different suggestions for auth vs guest
            if is_authenticated:
                suggestions = [
                    "Review your portfolio performance",
                    "Update your investment goals",
                    "Check your retirement savings progress",
                    "Analyze your spending patterns"
                ]
            else:
                suggestions = [
                    "How can I create a monthly budget?",
                    "What's the best way to save for retirement?",
                    "Should I invest in stocks or bonds?",
                    "How do I build an emergency fund?"
                ]
            
            await self.sio.emit('suggestions_update', {
                "suggestions": suggestions,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)
            
        except Exception as e:
            logger.error(f"❌ Error generating suggestions: {e}", exc_info=True)
    
    async def handle_rate_message(self, sid: str, data: dict):
        """Handle message rating"""
        try:
            data = data or {}
            message_id = data.get("messageId")
            rating = data.get("rating")
            feedback = data.get("feedback")
            
            session = self.get_session(sid)
            user_id = session.get("user_id")
            
            logger.info(f"👍 Rating from {user_id}: {message_id} → {rating}")
            
            # Store rating in database
            if user_id and message_id and rating in ["up", "down"]:
                from app.core.database import Database
                training_logs = Database.training_logs_collection()
                await training_logs.update_one(
                    {"messageId": message_id, "userId": str(user_id)},
                    {"$set": {
                        "rating": rating,
                        "feedback": feedback,
                        "ratedAt": datetime.utcnow().isoformat() + "Z"
                    }},
                    upsert=True
                )
                
            await self.sio.emit('rating_received', {
                "messageId": message_id,
                "rating": rating,
                "success": True,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)
        
        except Exception as e:
            logger.error(f"❌ Error handling rating: {e}", exc_info=True)
    
    async def handle_clear_chat(self, sid: str, data: dict):
        """Handle clear chat history request — clears DB messages array"""
        try:
            session = self.get_session(sid)
            user_id = session.get("user_id")

            if user_id:
                from app.ai.orchestrator import get_orchestrator
                from app.core.database import Database
                db = Database.get_db()
                orchestrator = await get_orchestrator(db)
                await orchestrator.clear_chat_history(user_id)
                logger.info(f"🗑️ Chat history cleared in DB for user {user_id}")

            await self.sio.emit('chat_cleared', {
                "success": True,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)

        except Exception as e:
            logger.error(f"❌ Error clearing chat: {e}", exc_info=True)
    
    async def handle_verify_auth(self, sid: str, data: dict = None):
        """
        Verify current authentication status
        RESPONSE: Only {isAuthenticated, username}
        """
        try:
            session = self.get_session(sid)
            is_authenticated = session.get("is_authenticated", False)
            username = session.get("username", "guest")
            
            response = {
                "isAuthenticated": is_authenticated,
                "username": username,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            
            logger.info(f"🔍 Auth verification: {username} (authenticated={is_authenticated})")
            
            await self.sio.emit('auth_status', response, room=sid)
        
        except Exception as e:
            logger.error(f"❌ Error verifying auth: {e}", exc_info=True)
            await self.sio.emit('auth_status', {
                "isAuthenticated": False,
                "username": "guest",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }, room=sid)
"""
AI Orchestrator Module
Main orchestrator that coordinates LLM and data fetching
Optimized for speed - single LLM call per request
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from langchain_core.language_models import BaseLLM
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.config import llm_settings, IntentConfig
from app.ai.llm.init import llm_provider
from app.ai.tools.data_fetcher import DataFetcher
from app.ai.memory.chat_memory import ChatMemory
from app.ai.prompts.template import PromptBuilder, AUTHENTICATED_CHAT_TEMPLATE
from app.ai.prompts.guestTemplate import GUEST_CHAT_TEMPLATE
from app.ai.ml.intent_classifier import intent_classifier
from app.ai.prompts.productContext import (
    AI_IDENTITY,
    AUTHENTICATED_RULES,
    build_rules_block,
    APP_NAME,
)

# Services for fetching real user data
from app.services.transactionService import TransactionService
from app.services.goalService import GoalService
from app.services.reminderService import ReminderService
from app.services.budgetService import BudgetService
# RAG — separate pipeline, does not touch financial chat logic
from app.ai.llm.ragQueryService import RAGQueryService
from app.ai.prompts.ragTemplate import RAGPromptBuilder, RAG_CHAT_TEMPLATE


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intent classification — delegates to IntentClassifier in app.ai.ml
# ---------------------------------------------------------------------------

async def _classify_intent(query: str) -> Dict[str, bool]:
    """
    Classify query intent using the LLM-based IntentClassifier.
    Handles broad queries ("analyse my performance") and multi-intent
    queries ("budget vs spending") mapping them to data requirements.
    """
    return await intent_classifier.get_intents_for_fetch(query)


# ---------------------------------------------------------------------------
# Data formatting helpers
# ---------------------------------------------------------------------------

def _fmt_transactions(transactions: List[Dict], currency_symbol: str = "₹") -> str:
    if not transactions:
        return "No transactions found for this period."
    lines = []
    for t in transactions[:20]:  # cap at 20 to stay within context
        date_str = ""
        if t.get("date"):
            d = t["date"]
            date_str = d.strftime("%b %d") if isinstance(d, datetime) else str(d)[:10]
        lines.append(
            f"  • [{date_str}] {t.get('type','?')} | {t.get('category','?')} | "
            f"{currency_symbol}{t.get('amount', 0):,.2f} — {t.get('description','')}"
        )
    return "\n".join(lines)


def _fmt_goals(goals: List[Dict], currency_symbol: str = "₹") -> str:
    if not goals:
        return "No goals found."
    lines = []
    for g in goals:
        target_date = ""
        if g.get("targetDate"):
            d = g["targetDate"]
            target_date = d.strftime("%b %d, %Y") if isinstance(d, datetime) else str(d)[:10]
        lines.append(
            f"  • {g.get('name','?')} | {g.get('status','?')} | "
            f"{currency_symbol}{g.get('savedAmount',0):,.0f} / {currency_symbol}{g.get('targetAmount',0):,.0f} "
            f"({g.get('progressPercentage',0)}%) | Due: {target_date}"
        )
    return "\n".join(lines)


def _fmt_reminders(reminders: List[Dict]) -> str:
    if not reminders:
        return "No upcoming reminders."
    lines = []
    for r in reminders[:10]:
        date_str = ""
        if r.get("date"):
            d = r["date"]
            date_str = d.strftime("%b %d, %Y %H:%M") if isinstance(d, datetime) else str(d)[:16]
        overdue = " ⚠️ OVERDUE" if r.get("isOverdue") else ""
        today = " 📅 TODAY" if r.get("isToday") else ""
        lines.append(f"  • {r.get('title','?')} — {date_str}{today}{overdue}")
    return "\n".join(lines)


def _fmt_budgets(budget: Dict, currency_symbol: str = "₹") -> str:
    if not budget or not budget.get("hasBudget"):
        return "No budget set for this month."
    
    lines = []
    month = budget.get("month")
    year = budget.get("year")
    month_name = datetime(year, month, 1).strftime("%B %Y") if month and year else "Current"
    
    lines.append(f"📌 Budget: {month_name}")
    lines.append(f"  Total Budget: {currency_symbol}{budget.get('totalBudget', 0):,.2f}")
    lines.append(f"  Total Spent: {currency_symbol}{budget.get('totalSpent', 0):,.2f}")
    lines.append(f"  Remaining: {currency_symbol}{budget.get('remaining', 0):,.2f}")
    lines.append(f"  Utilization: {budget.get('utilizationPercentage', 0):.1f}%")
    
    categories = budget.get("categories", [])
    if categories:
        lines.append("  Category Limits:")
        for cat in categories[:10]:  # cap at 10 categories
            lines.append(f"    • {cat.get('name', '?')}: {currency_symbol}{cat.get('limit', 0):,.2f}")
    
    return "\n".join(lines)


def _fmt_monthly_summary(summary: Dict, currency_symbol: str = "₹") -> str:
    if not summary:
        return "No summary available."
    s = summary.get("summary", summary)  # handle nested or flat
    return (
        f"  Income:    {currency_symbol}{s.get('totalIncome', 0):,.2f}\n"
        f"  Expenses:  {currency_symbol}{s.get('totalExpenses', 0):,.2f}\n"
        f"  Savings:   {currency_symbol}{s.get('netSavings', 0):,.2f}\n"
        f"  Save Rate: {s.get('savingsRate', 0):.1f}%\n"
        f"  Txn Count: {s.get('transactionCount', 0)}"
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class AIOrchestrator:
    """
    Orchestrates the entire AI chat pipeline.
    Fetches real user data → builds context-rich prompt → single LLM call.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.data_fetcher = DataFetcher(db)

        # Dedicated service instances for direct DB access
        self.tx_service = TransactionService(db)
        self.goal_service = GoalService(db)
        self.reminder_service = ReminderService(db)
        self.budget_service = BudgetService(db)

        self.llm: Optional[BaseLLM] = None

    async def initialize(self) -> None:
        """Initialize orchestrator and load models"""
        try:
            logger.info("Initializing AI Orchestrator...")
            await llm_provider.initialize_models()
            self.llm = await llm_provider.get_default_llm()
            logger.info("✅ AI Orchestrator initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize orchestrator: {e}")
            raise

    def get_user_memory(self, user_id: str) -> ChatMemory:
        """Return a fresh ChatMemory instance backed by DB — no RAM caching."""
        return ChatMemory(user_id, self.db)

    # ------------------------------------------------------------------
    # Core data-fetching layer
    # ------------------------------------------------------------------

    async def _fetch_user_context(
        self, user_id: str, intent: Dict[str, bool], query: str = "", currency_symbol: str = "₹"
    ) -> Dict[str, Any]:
        """
        Fetch only the data relevant to the detected intent.
        Returns a dict of formatted strings ready for the prompt.
        """
        context: Dict[str, Any] = {}
        now = datetime.now()

        if intent.get("needs_transactions"):
            try:
                # Use time range from query (e.g. "last week", "this month")
                # Falls back to last 30 days if no time phrase detected
                start, _ = intent_classifier.extract_time_range(query)
                transactions = await self.tx_service.get_transactions_by_user(
                    user_id=user_id,
                    start_date=start,
                    end_date=now,
                    limit=30,
                )
                monthly = await self.tx_service.get_monthly_summary(
                    user_id, now.month, now.year
                )
                context["transactions"] = _fmt_transactions(transactions, currency_symbol)
                context["monthly_summary"] = _fmt_monthly_summary(monthly, currency_symbol)
                logger.info(f"✅ Fetched {len(transactions)} transactions for user {user_id}")
            except Exception as e:
                logger.error(f"❌ Error fetching transactions: {e}")
                context["transactions"] = "Could not load transactions."
                context["monthly_summary"] = ""

        if intent.get("needs_goals"):
            try:
                goals = await self.goal_service.get_goals_by_user(user_id)
                goal_summary = await self.goal_service.get_goal_summary(user_id)
                context["goals"] = _fmt_goals(goals, currency_symbol)
                context["goal_summary"] = (
                    f"  Total: {goal_summary['totalGoals']} | "
                    f"Active: {goal_summary['activeGoals']} | "
                    f"Completed: {goal_summary['completedGoals']} | "
                    f"Overall Progress: {goal_summary['overallProgress']}%"
                )
                logger.info(f"✅ Fetched {len(goals)} goals for user {user_id}")
            except Exception as e:
                logger.error(f"❌ Error fetching goals: {e}")
                context["goals"] = "Could not load goals."
                context["goal_summary"] = ""

        if intent.get("needs_reminders"):
            try:
                reminders = await self.reminder_service.get_upcoming_reminders(
                    user_id, days=14
                )
                today = await self.reminder_service.get_today_reminders(user_id)
                counts = await self.reminder_service.count_reminders(user_id)
                context["reminders"] = _fmt_reminders(reminders)
                context["today_reminders"] = _fmt_reminders(today) if today else "None today."
                context["reminder_counts"] = (
                    f"Total: {counts['total']} | Today: {counts['today']} | "
                    f"Upcoming: {counts['upcoming']} | Overdue: {counts['overdue']}"
                )
                logger.info(f"✅ Fetched {len(reminders)} reminders for user {user_id}")
            except Exception as e:
                logger.error(f"❌ Error fetching reminders: {e}")
                context["reminders"] = "Could not load reminders."

        if intent.get("needs_budgets"):
            try:
                budget_summary = await self.budget_service.get_budget_summary(user_id)
                context["budgets"] = _fmt_budgets(budget_summary, currency_symbol)
                logger.info(f"✅ Fetched budget summary for user {user_id}")
            except Exception as e:
                logger.error(f"❌ Error fetching budgets: {e}")
                context["budgets"] = "Could not load budget."

        return context

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def _build_system_prompt(
        self, context: Dict[str, Any], intent: Dict[str, bool]
    ) -> str:
        now = datetime.now()
        today_str = now.strftime("%B %d, %Y")

        sections = [
            f'''{AI_IDENTITY}

The user is authenticated and you have access to their real financial data below.

Today: {today_str}

Rules (follow strictly in every response):
{build_rules_block(AUTHENTICATED_RULES)}

Response Structure:
- Start with a direct answer.
- Use specific numbers and percentages when relevant.
- End with 1-2 actionable suggestions if helpful.
- Keep responses concise and easy to scan.
- Add an AI disclaimer only when giving investment/tax advice.
''',
        ]

        if context.get("monthly_summary"):
            sections.append(
                f"📊 THIS MONTH'S FINANCIAL SUMMARY:\n{context['monthly_summary']}"
            )

        if context.get("transactions"):
            sections.append(
                f"💳 RECENT TRANSACTIONS (last 30 days):\n{context['transactions']}"
            )

        if context.get("goal_summary"):
            sections.append(
                f"🎯 GOAL OVERVIEW:\n{context['goal_summary']}"
            )

        if context.get("goals"):
            sections.append(
                f"🎯 YOUR GOALS:\n{context['goals']}"
            )

        if context.get("reminder_counts"):
            sections.append(
                f"🔔 REMINDER OVERVIEW: {context['reminder_counts']}"
            )

        if context.get("today_reminders"):
            sections.append(
                f"🔔 TODAY'S REMINDERS:\n{context['today_reminders']}"
            )

        if context.get("reminders"):
            sections.append(
                f"🔔 UPCOMING REMINDERS (next 14 days):\n{context['reminders']}"
            )

        if context.get("budgets"):
            sections.append(
                f"💰 BUDGET:\n{context['budgets']}"
            )

        # If no specific data was fetched, add a note so the LLM knows it can still help
        if not any([
            context.get("transactions"),
            context.get("goals"),
            context.get("reminders"),
            context.get("budgets"),
        ]):
            sections.append(
                f"ℹ️ No specific financial data matched this query. "
                f"If the question is about finance or {APP_NAME}, answer helpfully. "
                f"If it is unrelated to finance, apply the out-of-scope rule above."
            )

        return "\n\n".join(sections)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    async def prepare_authenticated_query(
        self,
        user_id: str,
        query: str,
        provider: Optional[str] = None,
        currency_symbol: str = "₹"
    ) -> tuple:
        """
        Compile state, context, and fetch LLM for authenticated query.
        Returns: (messages, llm, provider, memory)
        """
        intent = await _classify_intent(query)
        logger.info(f"🔍 Intent detected: {intent}")

        context = await self._fetch_user_context(user_id, intent, query, currency_symbol)
        system_prompt = self._build_system_prompt(context, intent)

        memory = self.get_user_memory(user_id)
        history = await memory.get_finance_history()

        if provider is None:
            provider = llm_settings.DEFAULT_LLM
        llm = await llm_provider.get_llm(provider)

        messages = [
            SystemMessage(content=system_prompt),
            *history,
            HumanMessage(content=query),
        ]
        return messages, llm, provider, memory

    async def process_authenticated_query(
        self,
        user_id: str,
        query: str,
        provider: Optional[str] = None,
        currency_symbol: str = "₹"
    ) -> Dict[str, Any]:
        """
        Process query from authenticated user.
        1. Classify intent (no LLM)
        2. Fetch relevant data from DB
        3. Build context-rich system prompt
        4. Single LLM call
        """
        try:
            logger.info(f"📝 Processing authenticated query for user {user_id}")
            messages, llm, provider, memory = await self.prepare_authenticated_query(user_id, query, provider, currency_symbol)

            logger.info(f"🧠 Invoking LLM ({provider}) for authenticated user...")
            response = None
            last_error = None

            # Try primary provider
            try:
                response = await llm.ainvoke(messages)
                logger.info(f"✅ {provider.upper()} succeeded for authenticated user")
            except Exception as invoke_error:
                last_error = invoke_error
                logger.error(f"❌ LLM invocation failed with {provider}: {invoke_error}")

                # Fallback to Gemini if primary fails
                if provider != "gemini":
                    logger.info("⚠️ Primary LLM failed — falling back to Gemini...")
                    try:
                        fallback_llm = await llm_provider.get_gemini_llm()
                        response = await fallback_llm.ainvoke(messages)
                        provider = "gemini"
                        logger.info("✅ Gemini fallback succeeded for authenticated user")
                    except Exception as fallback_error:
                        last_error = fallback_error
                        logger.error(f"❌ Gemini fallback also failed: {fallback_error}")
                        raise Exception(
                            f"Both {llm_settings.DEFAULT_LLM} and Gemini failed. "
                            f"Last error: {fallback_error}"
                        )
                else:
                    raise Exception(f"Gemini failed (ultimate fallback): {invoke_error}")

            # Step 7: Extract response.
            # Message persistence is now handled strictly by the calling handler (e.g. websocket handlers.py)
            response_text = (
                response.content if hasattr(response, "content") else str(response)
            )

            logger.info(f"✅ Response generated for authenticated user {user_id}")

            return {
                "status": "success",
                "user_id": user_id,
                "is_authenticated": True,
                "provider": provider,
                "query": query,
                "response": response_text,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"❌ Error processing authenticated query: {e}")
            return {
                "status": "error",
                "error": str(e),
                "user_id": user_id,
                "is_authenticated": True,
            }

    # Minimum cosine similarity score to consider a RAG result relevant.
    # Below this threshold the query is treated as a general finance question
    # and falls through to the normal authenticated chat pipeline.
    RAG_RELEVANCE_THRESHOLD: float = 0.75

    async def prepare_rag_query(
        self,
        query: str,
        user_id: str,
        vault_id: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> tuple:
        """
        Compile state, context, and fetch LLM for RAG query.
        Returns: (messages, llm, provider, memory, metadata)
        """
        rag_context, document_name, top_score = await RAGQueryService.get_context(
            query=query,
            user_id=user_id,
            vault_id=vault_id,
            top_k=5,
        )

        # ── Strict RAG constraint: Do NOT fall back to finance AI if score is too low ──
        if not rag_context or top_score < self.RAG_RELEVANCE_THRESHOLD:
            logger.info(
                "📊 RAG score %.3f below threshold %.2f — returning NO MATCH for query: %s",
                top_score, self.RAG_RELEVANCE_THRESHOLD, query,
            )
            memory = self.get_user_memory(user_id)
            return None, None, None, memory, {"no_match": True, "document_name": document_name}

        memory = self.get_user_memory(user_id)
        history = await memory.get_rag_history(document_name)

        prompt_vars = RAGPromptBuilder.build(
            user_input=query,
            rag_context=rag_context,
            document_name=document_name,
            chat_history=history,
        )
        formatted = RAG_CHAT_TEMPLATE.format_messages(**prompt_vars)

        if provider is None:
            provider = llm_settings.DEFAULT_LLM
        llm = await llm_provider.get_llm(provider)

        metadata = {
            "document_name": document_name,
            "is_rag": True,
        }
        return formatted, llm, provider, memory, metadata

    async def process_rag_query(
        self,
        query: str,
        user_id: str,
        vault_id: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Smart hybrid RAG flow:
        1. Embed query → vector search Atlas
        2a. top_score >= RAG_RELEVANCE_THRESHOLD → answer from document (RAG)
        2b. top_score <  RAG_RELEVANCE_THRESHOLD → fall back to normal finance AI

        This lets users keep the PDF selected while still asking general
        finance questions — no need to deselect the document.

        Args:
            query:    User's question
            user_id:  For scoping vector search
            vault_id: Optional — restrict search to one specific vault doc
            provider: LLM provider override
        """
        try:
            logger.info("📄 Processing RAG query for user %s (vault=%s)", user_id, vault_id)
            messages, llm, provider, memory, metadata = await self.prepare_rag_query(query, user_id, vault_id, provider)

            if metadata.get("no_match", False):
                return {
                    "status": "success",
                    "user_id": user_id,
                    "is_authenticated": True,
                    "is_rag": True,
                    "document_name": metadata.get("document_name", ""),
                    "provider": "informational",
                    "query": query,
                    "response": "I don't see any record of that in the provided document.",
                    "timestamp": datetime.now().isoformat(),
                }
            
            if not metadata.get("is_rag", False):
                return await self.process_authenticated_query(user_id, query, provider)

            logger.info("🧠 Invoking LLM (%s) for RAG query...", provider)
            try:
                response = await llm.ainvoke(messages)
            except Exception as e:
                logger.error("RAG LLM call failed with %s: %s — trying Gemini", provider, e)
                fallback_llm = await llm_provider.get_gemini_llm()
                response = await fallback_llm.ainvoke(messages)
                provider = "gemini"

            response_text = (
                response.content if hasattr(response, "content") else str(response)
            )
            # Step 5: Message persistence is now handled strictly by the calling handler
            # (e.g. websocket handlers.py)
            logger.info("✅ RAG response generated for user %s", user_id)

            return {
                "status": "success",
                "user_id": user_id,
                "is_authenticated": True,
                "is_rag": True,
                "document_name": metadata.get("document_name", ""),
                "provider": provider,
                "query": query,
                "response": response_text,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error("❌ RAG query failed: %s", e)
            return {
                "status": "error",
                "error": str(e),
                "user_id": user_id,
                "is_authenticated": True,
                "is_rag": True,
            }


    async def process_query(
        self,
        query: str,
        user_id: Optional[str] = None,
        provider: Optional[str] = None,
        vault_id: Optional[str] = None,    # set this to trigger RAG mode
    ) -> Dict[str, Any]:
        """
        Main entry point.
        - vault_id set  → RAG flow (PDF question answering)
        - user_id only  → normal authenticated financial chat
        - neither       → guest (handled in websocket)
        """
        if provider is None:
            provider = llm_settings.DEFAULT_LLM

        if user_id and vault_id:
            # RAG mode — user asking about a specific PDF
            return await self.process_rag_query(query, user_id, vault_id, provider)

        if user_id:
            return await self.process_authenticated_query(user_id, query, provider)

        return {
            "status": "error",
            "error": "Guest queries should be handled in websocket handler",
            "is_authenticated": False,
        }

    async def get_chat_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            memory = self.get_user_memory(user_id)
            return await memory.get_recent_for_display(limit)
        except Exception as e:
            logger.error(f"Error retrieving chat history: {e}")
            return []

    async def clear_chat_history(self, user_id: str) -> Dict[str, Any]:
        try:
            memory = self.get_user_memory(user_id)
            await memory.clear_history()
            return {
                "status": "success",
                "message": f"Chat history cleared for user {user_id}",
            }
        except Exception as e:
            logger.error(f"Error clearing chat history: {e}")
            return {"status": "error", "error": str(e)}


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

ai_orchestrator: Optional[AIOrchestrator] = None


async def get_orchestrator(db: AsyncIOMotorDatabase) -> AIOrchestrator:
    global ai_orchestrator
    if ai_orchestrator is None:
        ai_orchestrator = AIOrchestrator(db)
        await ai_orchestrator.initialize()
    return ai_orchestrator
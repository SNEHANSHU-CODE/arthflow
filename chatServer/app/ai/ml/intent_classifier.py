"""
Intent Classifier Module - LLM-Based
Classifies user queries into intent categories using an LLM.
"""
import logging
import json
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass

from app.ai.llm.init import llm_provider
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

@dataclass
class IntentResult:
    """Result from intent classification"""
    primary_intent: str
    confidence: float
    secondary_intents: List[Tuple[str, float]]
    keywords: List[str]
    reasoning: str = ""

    def to_dict(self) -> Dict:
        return {
            "primary_intent": self.primary_intent,
            "confidence": self.confidence,
            "secondary_intents": self.secondary_intents,
            "keywords": self.keywords,
            "reasoning": self.reasoning,
        }

class IntentClassifier:
    """
    LLM-based intent classifier for financial queries.
    """
    
    VALID_INTENTS = ["transactions", "goals", "reminders", "budgets", "general"]

    TIME_PATTERNS = {
        "today": 0,
        "yesterday": 1,
        "this week": 7,
        "last week": 14,
        "this month": 30,
        "last month": 60,
        "this quarter": 90,
        "last quarter": 180,
        "this year": 365,
        "last year": 730,
        "all": None,
    }

    def __init__(self):
        self.default_intents = {
            "transactions": False,
            "goals": False,
            "reminders": False,
            "budgets": False,
            "general": False,
        }

    async def get_intents_for_fetch(self, query: str) -> Dict[str, bool]:
        """
        Returns a dict of {intent: bool} for data fetching by calling the LLM.
        """
        try:
            llm = await llm_provider.get_default_llm()
            
            system_prompt = """
You are an intent classifier for a personal finance assistant.
Determine which data domains are required to answer the user's query.
The valid domains are:
- needs_transactions: Requires transaction/spending history (e.g., "what did I spend on food?", "budget vs spending")
- needs_goals: Requires savings goals data (e.g., "am I saving enough?", "goal deadlines")
- needs_reminders: Requires upcoming reminders/bills data (e.g., "pending bills", "what's due soon?")
- needs_budgets: Requires budget limit data (e.g., "what is my food budget?", "budget vs spending")
- needs_general: General query, no specific financial data needed (e.g., "hello", "what is a mutual fund?")

Output ONLY a valid JSON object with boolean values for each domain. Do not include any other text.
Example Output:
{"needs_transactions": true, "needs_goals": false, "needs_reminders": false, "needs_budgets": false, "needs_general": false}
"""
            
            messages = [
                SystemMessage(content=system_prompt.strip()),
                HumanMessage(content=query)
            ]
            
            response = await llm.ainvoke(messages)
            content = response.content.strip()
            
            # Clean up markdown JSON formatting if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
                
            content = content.strip()
            
            intents = json.loads(content)
            
            result = self.default_intents.copy()
            for k in result.keys():
                key = f"needs_{k}"
                if key in intents and intents[key] is True:
                    result[k] = True
                    
            logger.info(f"LLM Intent Classifier result: {result}")
            
            formatted_result = {f"needs_{k}": v for k, v in result.items()}
            
            # Always ensure budgets is true if transactions is true since they are often linked
            if formatted_result.get("needs_transactions") and not formatted_result.get("needs_budgets"):
                formatted_result["needs_budgets"] = True
            
            if not any(formatted_result.values()):
                formatted_result["needs_general"] = True
                
            return formatted_result
            
        except Exception as e:
            logger.error(f"LLM Intent Classification failed: {e}")
            fallback = {f"needs_{k}": False for k in self.default_intents.keys()}
            fallback["needs_general"] = True
            return fallback

    def classify(self, query: str) -> IntentResult:
        """
        Legacy sync method to prevent breaks if anything still calls this.
        Defaults to general.
        """
        return IntentResult(
            primary_intent="general",
            confidence=1.0,
            secondary_intents=[],
            keywords=[],
            reasoning="Legacy sync classify called. Defaulting to general."
        )

    def extract_time_range(self, query: str) -> Tuple[Optional[datetime], Optional[datetime]]:
        query_lower = query.lower()
        now = datetime.now()

        for pattern, days in self.TIME_PATTERNS.items():
            if pattern in query_lower:
                if days is None:
                    return None, now
                return now - timedelta(days=days), now

        return now - timedelta(days=30), now

    def should_include_intent(self, intent: str) -> bool:
        return self.default_intents.get(intent, False)

    def get_intent_duration(self, intent: str) -> str:
        duration_map = {
            "transactions": "30 days",
            "goals": "all",
            "reminders": "all",
            "budgets": "current month",
        }
        return duration_map.get(intent, "30 days")


intent_classifier = IntentClassifier()
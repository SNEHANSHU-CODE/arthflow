"""
Fast Intent Classifier
Simple, efficient keyword-based classification (no LLM calls)
Optimized for speed and accuracy
"""
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


logger = logging.getLogger(__name__)


@dataclass
class IntentResult:
    """Result from intent classification"""
    primary_intent: str
    confidence: float
    keywords_matched: List[str]
    requires_auth: bool
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "primary_intent": self.primary_intent,
            "confidence": self.confidence,
            "keywords_matched": self.keywords_matched,
            "requires_auth": self.requires_auth,
        }


class FastIntentClassifier:
    """
    Ultra-fast intent classifier using keywords only
    No LLM calls - optimized for performance
    """
    
    # Intent definitions with keywords and auth requirements
    INTENTS = {
        "transactions": {
            "keywords": [
                "transaction", "expense", "income", "spending", "spent",
                "cost", "price", "paid", "payment", "charge", "receipt",
                "transfer", "buy", "purchase",
                "total", "sum", "balance", "account", "history",
                "category", "merchant", "amount", "last", "recent"
            ],
            "requires_auth": True,  # Requires user data
        },
        
        "goals": {
            "keywords": [
                "goal", "target", "saving", "savings target",
                "milestone", "objective", "achievement", "reach", "accumulate",
                "progress", "track"
            ],
            "requires_auth": True,
        },
        
        "reminders": {
            "keywords": [
                "reminder", "remind", "alert", "notification",
                "upcoming", "due", "payment due", "remember"
            ],
            "requires_auth": False,
        },
        
        "general_advice": {
            "keywords": [
                "how to", "how do", "what is", "what are", "why",
                "explain", "help", "best way", "should i", "can i",
                "tips", "advice", "guide", "strategy", "plan",
                "budget", "save", "invest", "financial", "money",
                "retirement", "emergency", "fund", "debt", "credit"
            ],
            "requires_auth": False,  # General guidance
        },
    }
    
    # Default intent when no match
    DEFAULT_INTENT = "general_advice"
    MIN_CONFIDENCE = 0.3
    
    def __init__(self):
        """Initialize classifier"""
        self.intent_definitions = self.INTENTS
    
    def classify(self, query: str) -> IntentResult:
        """
        Classify query into intent category - FAST & SIMPLE
        
        Args:
            query: User query string
            
        Returns:
            IntentResult with classification details
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        # Score each intent based on keyword matches
        intent_scores: Dict[str, Tuple[float, List[str]]] = {}
        
        for intent_name, intent_data in self.intent_definitions.items():
            keywords = intent_data["keywords"]
            matched_keywords = []
            
            # Count keyword matches
            for keyword in keywords:
                if keyword in query_lower:
                    matched_keywords.append(keyword)
            
            # Calculate confidence (0-1)
            if matched_keywords:
                # Boost confidence based on number of matches
                confidence = min(1.0, len(matched_keywords) / max(len(keywords), 3))
                intent_scores[intent_name] = (confidence, matched_keywords)
        
        # Find best match
        if intent_scores:
            best_intent = max(intent_scores.items(), key=lambda x: x[1][0])
            intent_name = best_intent[0]
            confidence, keywords_matched = best_intent[1]
        else:
            intent_name = self.DEFAULT_INTENT
            confidence = self.MIN_CONFIDENCE
            keywords_matched = []
        
        requires_auth = self.intent_definitions[intent_name].get("requires_auth", False)
        
        logger.info(
            f"Intent: {intent_name} (confidence: {confidence:.2f}) "
            f"| Auth: {requires_auth} | Keywords: {keywords_matched[:3]}"
        )
        
        return IntentResult(
            primary_intent=intent_name,
            confidence=confidence,
            keywords_matched=keywords_matched,
            requires_auth=requires_auth,
        )
    
    def needs_personal_data(self, intent: str) -> bool:
        """Check if intent requires access to personal data"""
        return self.intent_definitions.get(intent, {}).get("requires_auth", False)


# Global instance
classifier = FastIntentClassifier()


def classify(query: str) -> IntentResult:
    """Convenience function to classify a query"""
    return classifier.classify(query)

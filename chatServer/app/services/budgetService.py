"""
Budget Service
All database operations for the budgets collection.
Calculated fields (remaining, utilization) are applied via a single _enrich() helper.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _enrich(doc: Dict[str, Any], computed_spent: float = 0.0) -> Dict[str, Any]:
    """
    Convert ObjectIds to strings and attach calculated virtual fields.
    Called once per document — never duplicated across query methods.
    """
    doc["_id"] = str(doc["_id"])
    doc["userId"] = str(doc["userId"])

    total_budget = doc.get("totalBudget", 0)
    
    # Use dynamically computed spent amount from transactions
    total_spent = computed_spent
    doc["totalSpent"] = total_spent
    
    doc["remaining"] = max(0.0, total_budget - total_spent)
    doc["utilizationPercentage"] = (
        round((total_spent / total_budget) * 100, 2) if total_budget > 0 else 0.0
    )

    return doc


class BudgetService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.collection = db.budgets

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def get_budget_by_user_and_month(
        self,
        user_id: str,
        month: int,
        year: int,
    ) -> Optional[Dict[str, Any]]:
        """Return the budget for a specific user/month/year."""
        try:
            doc = await self.collection.find_one(
                {
                    "userId": ObjectId(user_id),
                    "month": month,
                    "year": year,
                }
            )
            if not doc:
                return None
            
            import calendar
            from datetime import datetime
            start_date = datetime(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end_date = datetime(year, month, last_day, 23, 59, 59)
            
            pipeline = [
                {
                    "$match": {
                        "userId": ObjectId(user_id),
                        "type": "Expense",
                        "date": {"$gte": start_date, "$lte": end_date}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": {"$abs": "$amount"}}
                    }
                }
            ]
            result = await self.db.transactions.aggregate(pipeline).to_list(1)
            total_spent = result[0]["total"] if result else 0.0
            
            return _enrich(doc, computed_spent=total_spent)

        except Exception as e:
            logger.error(
                "Error getting budget for user %s month %d/%d: %s",
                user_id, month, year, e,
            )
            raise

    async def get_budgets_by_user(
        self,
        user_id: str,
        start_month: Optional[int] = None,
        start_year: Optional[int] = None,
        end_month: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return budgets for a user, optionally filtered by month/year range.
        If no dates provided, returns all budgets for the user.
        """
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}

            # Build date range if provided
            if start_year is not None:
                # Convert month/year to comparable number: year * 100 + month
                start_value = start_year * 100 + (start_month or 1)
                query["$expr"] = {
                    "$gte": [
                        {"$add": [{"$multiply": ["$year", 100]}, "$month"]},
                        start_value,
                    ]
                }

            if end_year is not None:
                end_value = end_year * 100 + (end_month or 12)
                if "$expr" in query:
                    query["$expr"]["$lte"] = [
                        {"$add": [{"$multiply": ["$year", 100]}, "$month"]},
                        end_value,
                    ]
                else:
                    query["$expr"] = {
                        "$lte": [
                            {"$add": [{"$multiply": ["$year", 100]}, "$month"]},
                            end_value,
                        ]
                    }

            cursor = self.collection.find(query).sort(
                [("year", -1), ("month", -1)]
            )
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting budgets for user %s: %s", user_id, e)
            raise

    async def get_current_budget(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Return the budget for the current month/year."""
        try:
            now = datetime.now()
            return await self.get_budget_by_user_and_month(
                user_id, now.month, now.year
            )

        except Exception as e:
            logger.error("Error getting current budget for user %s: %s", user_id, e)
            raise

    async def get_budget_summary(self, user_id: str) -> Dict[str, Any]:
        """Get summary statistics for a user's current month budget."""
        try:
            budget = await self.get_current_budget(user_id)
            
            if not budget:
                return {
                    "hasBudget": False,
                    "totalBudget": 0,
                    "totalSpent": 0,
                    "remaining": 0,
                    "utilizationPercentage": 0,
                    "month": datetime.now().month,
                    "year": datetime.now().year,
                }
            
            return {
                "hasBudget": True,
                "totalBudget": budget.get("totalBudget", 0),
                "totalSpent": budget.get("totalSpent", 0),
                "remaining": budget.get("remaining", 0),
                "utilizationPercentage": budget.get("utilizationPercentage", 0),
                "month": budget.get("month"),
                "year": budget.get("year"),
                "categories": budget.get("categories", []),
            }

        except Exception as e:
            logger.error("Error getting budget summary for user %s: %s", user_id, e)
            raise

    async def get_all_budgets_by_user(
        self, user_id: str, limit: int = 12
    ) -> List[Dict[str, Any]]:
        """Return all budgets for a user, limited to most recent N records."""
        try:
            cursor = (
                self.collection.find({"userId": ObjectId(user_id)})
                .sort([("year", -1), ("month", -1)])
                .limit(limit)
            )
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting all budgets for user %s: %s", user_id, e)
            raise

    async def get_category_limit(
        self,
        user_id: str,
        month: int,
        year: int,
        category: str,
    ) -> Optional[float]:
        """Return the budget limit for a specific category in a specific month."""
        try:
            budget = await self.get_budget_by_user_and_month(user_id, month, year)
            if not budget:
                return None

            categories = budget.get("categories", [])
            for cat in categories:
                if cat.get("name") == category:
                    return cat.get("limit")

            return None

        except Exception as e:
            logger.error(
                "Error getting category limit for user %s: %s", user_id, e
            )
            raise

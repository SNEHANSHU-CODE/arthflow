"""
Goal Service
All database operations for the goals collection.
Virtual field calculation is centralised in _enrich() so it is never duplicated.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _enrich(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert ObjectIds to strings and attach calculated virtual fields.
    Called once per document so there is no copy-paste across methods.
    """
    doc["_id"] = str(doc["_id"])
    doc["userId"] = str(doc["userId"])

    target = doc.get("targetAmount", 0)
    saved = doc.get("savedAmount", 0)

    doc["progressPercentage"] = round((saved / target) * 100) if target > 0 else 0
    doc["remainingAmount"] = max(0.0, target - saved)

    target_date: Optional[datetime] = doc.get("targetDate")
    if target_date:
        days_remaining = (target_date - datetime.utcnow()).days
        doc["daysRemaining"] = days_remaining
        doc["isOverdue"] = days_remaining < 0 and doc.get("status") != "Completed"
    else:
        doc["daysRemaining"] = 0
        doc["isOverdue"] = False

    return doc


class GoalService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db.goals

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def get_goals_by_user(
        self,
        user_id: str,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return all goals for a user, optionally filtered by status."""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}
            if status:
                query["status"] = status

            cursor = self.collection.find(query).sort("targetDate", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting goals for user %s: %s", user_id, e)
            raise

    async def get_goal_by_id(
        self,
        goal_id: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Return a single goal owned by the given user."""
        try:
            doc = await self.collection.find_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)}
            )
            return _enrich(doc) if doc else None

        except Exception as e:
            logger.error("Error getting goal %s: %s", goal_id, e)
            raise

    async def get_goal_summary(self, user_id: str) -> Dict[str, Any]:
        """Aggregate summary statistics for a user's goals."""
        try:
            # Single pass through the cursor — no second query needed
            goals = await self.get_goals_by_user(user_id)

            total_target = sum(g.get("targetAmount", 0) for g in goals)
            total_saved = sum(g.get("savedAmount", 0) for g in goals)

            return {
                "totalGoals": len(goals),
                "activeGoals": sum(1 for g in goals if g.get("status") == "Active"),
                "completedGoals": sum(1 for g in goals if g.get("status") == "Completed"),
                "pausedGoals": sum(1 for g in goals if g.get("status") == "Paused"),
                "totalTargetAmount": round(total_target, 2),
                "totalSavedAmount": round(total_saved, 2),
                "overallProgress": round((total_saved / total_target) * 100, 2)
                if total_target > 0
                else 0,
            }

        except Exception as e:
            logger.error("Error getting goal summary for user %s: %s", user_id, e)
            raise

    async def get_goals_by_category(
        self, user_id: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Return goals keyed by category."""
        try:
            goals = await self.get_goals_by_user(user_id)
            result: Dict[str, List[Dict[str, Any]]] = {}
            for goal in goals:
                result.setdefault(goal.get("category", "Other"), []).append(goal)
            return result

        except Exception as e:
            logger.error("Error grouping goals by category for user %s: %s", user_id, e)
            raise

    async def get_goals_by_priority(
        self, user_id: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Return goals keyed by priority (High / Medium / Low)."""
        try:
            goals = await self.get_goals_by_user(user_id)
            result: Dict[str, List[Dict[str, Any]]] = {"High": [], "Medium": [], "Low": []}
            for goal in goals:
                result[goal.get("priority", "Medium")].append(goal)
            return result

        except Exception as e:
            logger.error("Error grouping goals by priority for user %s: %s", user_id, e)
            raise

    async def get_overdue_goals(self, user_id: str) -> List[Dict[str, Any]]:
        """Return goals whose targetDate has passed and are not Completed."""
        try:
            query = {
                "userId": ObjectId(user_id),
                "targetDate": {"$lt": datetime.utcnow()},
                "status": {"$ne": "Completed"},
            }
            cursor = self.collection.find(query).sort("targetDate", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting overdue goals for user %s: %s", user_id, e)
            raise

    async def get_upcoming_goals(
        self, user_id: str, days: int = 30
    ) -> List[Dict[str, Any]]:
        """Return Active goals due within the next *days* days."""
        try:
            now = datetime.utcnow()
            query = {
                "userId": ObjectId(user_id),
                "targetDate": {"$gte": now, "$lte": now + timedelta(days=days)},
                "status": "Active",
            }
            cursor = self.collection.find(query).sort("targetDate", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting upcoming goals for user %s: %s", user_id, e)
            raise
"""
Reminder Service
All database operations for the reminders collection.
Calculated status fields are applied via a single _enrich() helper.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _enrich(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert ObjectIds to strings and attach temporal status fields.
    Called once per document — never duplicated across query methods.
    """
    doc["_id"] = str(doc["_id"])
    doc["userId"] = str(doc["userId"])

    reminder_date: Optional[datetime] = doc.get("date")
    if reminder_date:
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)

        diff = reminder_date - now
        is_overdue = reminder_date < now

        doc["isToday"] = today_start <= reminder_date < today_end
        doc["daysUntil"] = diff.days
        doc["isOverdue"] = is_overdue
        doc["daysOverdue"] = abs(diff.days) if is_overdue else 0
    else:
        doc["isToday"] = False
        doc["daysUntil"] = 0
        doc["isOverdue"] = False
        doc["daysOverdue"] = 0

    return doc


class ReminderService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db.reminders

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def get_reminders_by_user(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Return reminders for a user, optionally filtered by date range."""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}
            if start_date or end_date:
                date_filter: Dict[str, datetime] = {}
                if start_date:
                    date_filter["$gte"] = start_date
                if end_date:
                    date_filter["$lte"] = end_date
                query["date"] = date_filter

            cursor = self.collection.find(query).sort("date", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting reminders for user %s: %s", user_id, e)
            raise

    async def get_reminder_by_id(
        self, reminder_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Return a single reminder owned by the given user."""
        try:
            doc = await self.collection.find_one(
                {"_id": ObjectId(reminder_id), "userId": ObjectId(user_id)}
            )
            return _enrich(doc) if doc else None

        except Exception as e:
            logger.error("Error getting reminder %s: %s", reminder_id, e)
            raise

    async def get_upcoming_reminders(
        self, user_id: str, days: int = 7
    ) -> List[Dict[str, Any]]:
        """Return reminders due within the next *days* days."""
        try:
            now = datetime.utcnow()
            cursor = self.collection.find(
                {
                    "userId": ObjectId(user_id),
                    "date": {"$gte": now, "$lte": now + timedelta(days=days)},
                }
            ).sort("date", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting upcoming reminders for user %s: %s", user_id, e)
            raise

    async def get_today_reminders(self, user_id: str) -> List[Dict[str, Any]]:
        """Return reminders due today."""
        try:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            cursor = self.collection.find(
                {
                    "userId": ObjectId(user_id),
                    "date": {"$gte": today_start, "$lt": today_start + timedelta(days=1)},
                }
            ).sort("date", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting today's reminders for user %s: %s", user_id, e)
            raise

    async def get_overdue_reminders(self, user_id: str) -> List[Dict[str, Any]]:
        """Return reminders whose date has already passed."""
        try:
            cursor = self.collection.find(
                {"userId": ObjectId(user_id), "date": {"$lt": datetime.utcnow()}}
            ).sort("date", -1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting overdue reminders for user %s: %s", user_id, e)
            raise

    async def get_reminders_by_month(
        self, user_id: str, month: int, year: int
    ) -> List[Dict[str, Any]]:
        """Return all reminders for a specific calendar month."""
        try:
            start = datetime(year, month, 1)
            end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
            cursor = self.collection.find(
                {"userId": ObjectId(user_id), "date": {"$gte": start, "$lt": end}}
            ).sort("date", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting reminders by month for user %s: %s", user_id, e)
            raise

    async def get_reminders_by_week(
        self, user_id: str, week_offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Return reminders for a given ISO week.
        week_offset: 0 = current week, 1 = next week, -1 = last week.
        """
        try:
            now = datetime.utcnow()
            week_start = (
                now - timedelta(days=now.weekday())
            ).replace(hour=0, minute=0, second=0, microsecond=0)
            week_start += timedelta(weeks=week_offset)
            week_end = week_start + timedelta(days=7)

            cursor = self.collection.find(
                {"userId": ObjectId(user_id), "date": {"$gte": week_start, "$lt": week_end}}
            ).sort("date", 1)
            return [_enrich(doc) async for doc in cursor]

        except Exception as e:
            logger.error("Error getting reminders by week for user %s: %s", user_id, e)
            raise

    async def count_reminders(self, user_id: str) -> Dict[str, int]:
        """
        Return counts broken down by temporal status.
        Uses a single aggregation pipeline instead of four separate count queries.
        """
        try:
            now = datetime.utcnow()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start + timedelta(days=1)

            pipeline = [
                {"$match": {"userId": ObjectId(user_id)}},
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": 1},
                        "today": {
                            "$sum": {
                                "$cond": [
                                    {"$and": [
                                        {"$gte": ["$date", today_start]},
                                        {"$lt": ["$date", today_end]},
                                    ]},
                                    1, 0,
                                ]
                            }
                        },
                        "upcoming": {
                            "$sum": {"$cond": [{"$gte": ["$date", today_end]}, 1, 0]}
                        },
                        "overdue": {
                            "$sum": {"$cond": [{"$lt": ["$date", today_start]}, 1, 0]}
                        },
                    }
                },
            ]

            result = await self.collection.aggregate(pipeline).to_list(length=1)
            if not result:
                return {"total": 0, "today": 0, "upcoming": 0, "overdue": 0}

            row = result[0]
            return {
                "total": row["total"],
                "today": row["today"],
                "upcoming": row["upcoming"],
                "overdue": row["overdue"],
            }

        except Exception as e:
            logger.error("Error counting reminders for user %s: %s", user_id, e)
            raise

    async def get_all_reminders(self, user_id: str) -> List[Dict[str, Any]]:
        """Return every reminder for a user sorted by date ascending."""
        return await self.get_reminders_by_user(user_id)
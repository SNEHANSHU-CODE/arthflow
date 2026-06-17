"""
Notification Pydantic model — mirrors the Node.js notificationModel schema.
Used for type-safe reads from the shared MongoDB notifications collection.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any, Dict, Literal
from datetime import datetime
from bson import ObjectId

from app.models.base import PyObjectId


class NotificationData(BaseModel):
    """Optional contextual data embedded in a notification."""
    budgetId: Optional[str] = None
    goalId: Optional[str] = None
    transactionId: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    threshold: Optional[float] = None
    percentage: Optional[float] = None

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class NotificationModel(BaseModel):
    """
    Matches the MongoDB notification document written by the main server.
    Fields match notificationModel.js exactly.
    """
    id: Optional[str] = Field(None, alias="_id")
    userId: str
    type: Literal[
        "budget_alert",
        "budget_exceeded",
        "goal_milestone",
        "goal_deadline",
        "goal_completed",
        "monthly_report",
        "weekly_report",
        "large_expense",
        "recurring_payment",
        "low_balance",
        "savings_reminder",
        "system_update",
        "security_alert",
    ]
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    title: str
    message: str
    data: Optional[NotificationData] = None
    isRead: bool = False
    readAt: Optional[datetime] = None
    isEmailSent: bool = False
    isPushSent: bool = False
    scheduledFor: Optional[datetime] = None
    actionUrl: Optional[str] = None
    actionText: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )


class NotificationOut(BaseModel):
    """
    Serialisable form sent over the socket to the frontend.
    Only fields the client needs — no internal flags.
    """
    id: str
    userId: str
    type: str
    priority: str
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    isRead: bool
    actionUrl: Optional[str] = None
    actionText: Optional[str] = None
    createdAt: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)

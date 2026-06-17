from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dateutil.relativedelta import relativedelta
import logging

logger = logging.getLogger(__name__)


class TransactionService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.transactions
    
    async def get_transactions_by_user(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        transaction_type: Optional[str] = None,
        category: Optional[str] = None,
        payment_method: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search_text: Optional[str] = None,
        min_amount: Optional[float] = None,
        max_amount: Optional[float] = None,
        limit: int = 50,
        skip: int = 0,
        sort_by: str = "date",
        sort_order: str = "desc"
    ) -> List[Dict[str, Any]]:
        """
        Get transactions for a user with advanced filtering
        """
        try:
            query = {"userId": ObjectId(user_id)}
            
            # Date range filter
            if start_date and end_date:
                query["date"] = {
                    "$gte": start_date,
                    "$lte": end_date
                }
            elif start_date:
                query["date"] = {"$gte": start_date}
            elif end_date:
                query["date"] = {"$lte": end_date}
            
            # Type filter
            if transaction_type:
                query["type"] = transaction_type
            
            # Category filter
            if category:
                query["category"] = category
            
            # Payment method filter
            if payment_method:
                query["paymentMethod"] = payment_method
            
            # Tags filter
            if tags and len(tags) > 0:
                query["tags"] = {"$in": tags}
            
            # Amount range filter
            if min_amount is not None or max_amount is not None:
                query["amount"] = {}
                if min_amount is not None:
                    query["amount"]["$gte"] = min_amount
                if max_amount is not None:
                    query["amount"]["$lte"] = max_amount
            
            # Text search
            if search_text:
                query["$or"] = [
                    {"description": {"$regex": search_text, "$options": "i"}},
                    {"notes": {"$regex": search_text, "$options": "i"}}
                ]
            
            # Sort options
            sort_direction = -1 if sort_order == "desc" else 1
            sort_keys = [(sort_by, sort_direction)]
            if sort_by != "createdAt":
                sort_keys.append(("createdAt", sort_direction))
            
            cursor = self.collection.find(query).sort(sort_keys).skip(skip).limit(limit)
            
            transactions = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                if doc.get("goalId"):
                    doc["goalId"] = str(doc["goalId"])
                transactions.append(doc)
            
            return transactions
        
        except Exception as e:
            logger.error(f"Error getting transactions: {e}")
            raise
    
    async def get_recent_transactions(
        self,
        user_id: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Get recent transactions for a user
        """
        try:
            cursor = self.collection.find(
                {"userId": ObjectId(user_id)}
            ).sort([("date", -1), ("createdAt", -1)]).limit(limit)
            
            transactions = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                if doc.get("goalId"):
                    doc["goalId"] = str(doc["goalId"])
                transactions.append(doc)
            
            return transactions
        
        except Exception as e:
            logger.error(f"Error getting recent transactions: {e}")
            raise
    
    async def get_monthly_summary(
        self,
        user_id: str,
        month: int,
        year: int
    ) -> Dict[str, Any]:
        """
        Get monthly summary with enhanced analytics
        """
        try:
            # Calculate date range
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1) - timedelta(seconds=1)
            else:
                end_date = datetime(year, month + 1, 1) - timedelta(seconds=1)
            
            pipeline = [
                {
                    "$match": {
                        "userId": ObjectId(user_id),
                        "date": {"$gte": start_date, "$lte": end_date}
                    }
                },
                {
                    "$group": {
                        "_id": "$type",
                        "total": {"$sum": "$amount"},
                        "count": {"$sum": 1},
                        "avgAmount": {"$avg": "$amount"}
                    }
                }
            ]
            
            results = []
            async for doc in self.collection.aggregate(pipeline):
                results.append(doc)
            
            # Initialize summary
            summary = {
                "totalIncome": 0,
                "totalExpenses": 0,
                "netSavings": 0,
                "savingsRate": 0,
                "transactionCount": 0,
                "averageTransactionAmount": 0,
                "dailyAverage": 0
            }
            
            # Calculate totals
            for item in results:
                if item["_id"] == "Income":
                    summary["totalIncome"] = abs(item["total"])
                    summary["transactionCount"] += item["count"]
                elif item["_id"] == "Expense":
                    summary["totalExpenses"] = abs(item["total"])
                    summary["transactionCount"] += item["count"]
            
            # Calculate derived metrics
            summary["netSavings"] = summary["totalIncome"] - summary["totalExpenses"]
            if summary["totalIncome"] > 0:
                summary["savingsRate"] = (summary["netSavings"] / summary["totalIncome"]) * 100
            
            if summary["transactionCount"] > 0:
                summary["averageTransactionAmount"] = (
                    summary["totalIncome"] + summary["totalExpenses"]
                ) / summary["transactionCount"]
            
            # Calculate daily average
            days_in_month = (end_date - start_date).days + 1
            summary["dailyAverage"] = (
                summary["totalIncome"] + summary["totalExpenses"]
            ) / days_in_month
            
            # Round values
            for key in summary:
                if isinstance(summary[key], float):
                    summary[key] = round(summary[key], 2)
            
            # Get category breakdown
            category_pipeline = [
                {
                    "$match": {
                        "userId": ObjectId(user_id),
                        "date": {"$gte": start_date, "$lte": end_date}
                    }
                },
                {
                    "$group": {
                        "_id": {"category": "$category", "type": "$type"},
                        "amount": {"$sum": "$amount"}
                    }
                }
            ]
            
            categories = {}
            async for doc in self.collection.aggregate(category_pipeline):
                cat_name = doc["_id"]["category"]
                cat_type = doc["_id"]["type"]
                amount = round(abs(doc["amount"]), 2)
                
                if cat_name not in categories:
                    categories[cat_name] = {"income": 0, "expense": 0, "total": 0}
                
                if cat_type == "Income":
                    categories[cat_name]["income"] = amount
                else:
                    categories[cat_name]["expense"] = amount
                
                categories[cat_name]["total"] += amount
            
            # Get payment method breakdown
            payment_pipeline = [
                {
                    "$match": {
                        "userId": ObjectId(user_id),
                        "date": {"$gte": start_date, "$lte": end_date}
                    }
                },
                {
                    "$group": {
                        "_id": "$paymentMethod",
                        "amount": {"$sum": "$amount"}
                    }
                }
            ]
            
            payment_methods = {}
            async for doc in self.collection.aggregate(payment_pipeline):
                payment_methods[doc["_id"]] = round(abs(doc["amount"]), 2)
            
            return {
                "period": {
                    "month": month,
                    "year": year,
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat()
                },
                "summary": summary,
                "breakdowns": {
                    "categories": categories,
                    "paymentMethods": payment_methods
                }
            }
        
        except Exception as e:
            logger.error(f"Error getting monthly summary: {e}")
            raise
    
    async def get_category_analysis(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get category analysis for expenses
        """
        try:
            # Default to last year if no dates provided
            if not end_date:
                end_date = datetime.now()
            if not start_date:
                start_date = end_date - timedelta(days=365)
            
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
                        "_id": "$category",
                        "totalAmount": {"$sum": "$amount"},
                        "transactionCount": {"$sum": 1}
                    }
                },
                {
                    "$sort": {"totalAmount": -1}
                }
            ]
            
            results = []
            async for doc in self.collection.aggregate(pipeline):
                results.append(doc)
            
            # Calculate total
            total_amount = sum(abs(item["totalAmount"]) for item in results)
            
            # Format categories
            categories = []
            for item in results:
                categories.append({
                    "category": item["_id"],
                    "amount": round(abs(item["totalAmount"]), 2),
                    "transactionCount": item["transactionCount"],
                    "percentage": round((abs(item["totalAmount"]) / total_amount * 100), 2) if total_amount > 0 else 0
                })
            
            return {
                "type": "Expense",
                "period": {
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat()
                },
                "totalAmount": round(total_amount, 2),
                "categories": categories,
                "topCategory": categories[0] if categories else None,
                "categoryCount": len(categories)
            }
        
        except Exception as e:
            logger.error(f"Error getting category analysis: {e}")
            raise
    
    async def get_spending_trends(
        self,
        user_id: str,
        months: int = 6
    ) -> Dict[str, Any]:
        """
        Get spending trends with month-over-month comparison
        """
        try:
            trends = []
            current_date = datetime.now()
            
            for i in range(months - 1, -1, -1):
                # Calculate month and year using relativedelta for proper month subtraction
                target_date = current_date - relativedelta(months=i)
                month = target_date.month
                year = target_date.year
                
                # Get monthly summary
                summary = await self.get_monthly_summary(user_id, month, year)
                
                # Calculate month-over-month change
                month_over_month_change = None
                if len(trends) > 0:
                    previous_month = trends[-1]
                    current_expenses = summary["summary"]["totalExpenses"]
                    previous_expenses = previous_month["totalExpenses"]
                    
                    if previous_expenses > 0:
                        month_over_month_change = round(
                            ((current_expenses - previous_expenses) / previous_expenses) * 100,
                            2
                        )
                
                month_name = target_date.strftime("%B")
                month_year = f"{year}-{str(month).zfill(2)}"
                
                trends.append({
                    "month": month_name,
                    "year": year,
                    "monthYear": month_year,
                    **summary["summary"],
                    "monthOverMonthChange": month_over_month_change
                })
            
            # Calculate averages
            avg_monthly_income = (
                round(sum(t["totalIncome"] for t in trends) / len(trends), 2)
                if trends else 0
            )
            avg_monthly_expenses = (
                round(sum(t["totalExpenses"] for t in trends) / len(trends), 2)
                if trends else 0
            )
            total_period_income = round(sum(t["totalIncome"] for t in trends), 2)
            total_period_expenses = round(sum(t["totalExpenses"] for t in trends), 2)
            
            return {
                "trends": trends,
                "period": f"{months} months",
                "averageMonthlyIncome": avg_monthly_income,
                "averageMonthlyExpenses": avg_monthly_expenses,
                "totalPeriodIncome": total_period_income,
                "totalPeriodExpenses": total_period_expenses,
                "totalPeriodSavings": round(total_period_income - total_period_expenses, 2)
            }
        
        except Exception as e:
            logger.error(f"Error getting spending trends: {e}")
            raise
    
    async def search_transactions(
        self,
        user_id: str,
        search_term: str,
        transaction_type: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search transactions by text
        """
        try:
            query = {
                "userId": ObjectId(user_id),
                "$or": [
                    {"description": {"$regex": search_term, "$options": "i"}},
                    {"notes": {"$regex": search_term, "$options": "i"}}
                ]
            }
            
            if transaction_type:
                query["type"] = transaction_type
            
            if category:
                query["category"] = category
            
            cursor = self.collection.find(query).sort([("date", -1), ("createdAt", -1)]).limit(limit)
            
            transactions = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                if doc.get("goalId"):
                    doc["goalId"] = str(doc["goalId"])
                transactions.append(doc)
            
            return transactions
        
        except Exception as e:
            logger.error(f"Error searching transactions: {e}")
            raise
    
    async def get_transaction_by_id(
        self,
        transaction_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific transaction by ID
        """
        try:
            doc = await self.collection.find_one({
                "_id": ObjectId(transaction_id),
                "userId": ObjectId(user_id)
            })
            
            if doc:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                if doc.get("goalId"):
                    doc["goalId"] = str(doc["goalId"])
            
            return doc
        
        except Exception as e:
            logger.error(f"Error getting transaction: {e}")
            raise
    
    async def get_transactions_by_goal(
        self,
        user_id: str,
        goal_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all transactions associated with a specific goal
        """
        try:
            cursor = self.collection.find({
                "userId": ObjectId(user_id),
                "goalId": ObjectId(goal_id)
            }).sort([("date", -1), ("createdAt", -1)])
            
            transactions = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                doc["goalId"] = str(doc["goalId"])
                transactions.append(doc)
            
            return transactions
        
        except Exception as e:
            logger.error(f"Error getting transactions by goal: {e}")
            raise
    
    async def get_transactions_by_date_range(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get transactions within a specific date range
        """
        try:
            cursor = self.collection.find({
                "userId": ObjectId(user_id),
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }).sort([("date", -1), ("createdAt", -1)])
            
            transactions = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                doc["userId"] = str(doc["userId"])
                if doc.get("goalId"):
                    doc["goalId"] = str(doc["goalId"])
                transactions.append(doc)
            
            return transactions
        
        except Exception as e:
            logger.error(f"Error getting transactions by date range: {e}")
            raise
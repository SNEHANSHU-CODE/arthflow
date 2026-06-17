const mongoose = require('mongoose');

// Import models for direct MongoDB access
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const User = require('../models/User');
const Budget = require('../models/Budget');

/**
 * Analytics Service
 * Directly queries MongoDB for analytics data
 * No dependency on main server
 */
class AnalyticsService {
  constructor() {
    // IMPORTANT: Cache timeout reduced for development; should be increased in production
    // In production: use 5-10 minutes for better performance
    // Recommendation: Implement Redis for distributed caching in multi-server deployments
    this.cache = new Map();
    this.cacheTimeout = 60 * 1000; // 60 seconds - balance between freshness and performance
    console.log('📊 Analytics Service initialized with 60-second cache');
  }

  getCacheKey(endpoint, userId, params = {}) {
    return `${endpoint}:${userId}:${JSON.stringify(params)}`;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  clearCache(userId) {
    for (const [key] of this.cache) {
      if (key.includes(userId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get Dashboard Data
   * Returns summary and recent transactions
   * IMPORTANT: Data is validated and normalized to ensure accuracy
   * - Empty state: returns 0 values for all fields (never returns null/undefined)
   * - Ensures: no stale cache, no fake default data
   */
  async getDashboardData(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('dashboard', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) {
        console.log(`💾 Cache hit: dashboard for user ${userId}`);
        return cached;
      }

      // Convert string dates to Date objects
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Validate date range
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }

      // Query transactions for date range
      const transactions = await Transaction.find({
        userId,
        date: { $gte: start, $lte: end }
      }).sort({ date: -1, createdAt: -1 }).limit(10).lean(); // Use .lean() for performance

      // Calculate summary from ALL transactions in range using aggregation for accuracy
      const allTransactions = await Transaction.find({
        userId,
        date: { $gte: start, $lte: end }
      }).lean();

      let totalIncome = 0;
      let totalExpenses = 0;

      // CRITICAL: Only sum real transactions, not defaults
      allTransactions.forEach(txn => {
        if (txn.type === 'income' || txn.type === 'Income') {
          totalIncome += Math.max(0, txn.amount); // Only positive amounts for income
        } else if (txn.type === 'expense' || txn.type === 'Expense') {
          totalExpenses += Math.abs(txn.amount); // Always use absolute value for expenses
        }
      });

      const netSavings = totalIncome - totalExpenses;
      const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

      const data = {
        monthly: {
          summary: {
            totalIncome: parseFloat(totalIncome.toFixed(2)),
            totalExpenses: parseFloat(totalExpenses.toFixed(2)),
            netSavings: parseFloat(netSavings.toFixed(2)),
            savingsRate: parseFloat(savingsRate.toFixed(2))
          }
        },
        recent: transactions.map(txn => ({
          id: txn._id.toString(),
          description: txn.description || txn.category,
          category: txn.category,
          date: txn.date.toISOString().split('T')[0],
          amount: txn.amount,
          type: txn.type
        })),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching dashboard data:', error.message);
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }
  }

  /**
   * Get Spending Trends
   * Monthly spending trends
   */
  async getSpendingTrends(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('spendingTrends', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Group by month
      const trends = await Transaction.aggregate([
        {
          $match: {
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            income: {
              $sum: {
                $cond: [{ 
                  $or: [
                    { $eq: ['$type', 'income'] },
                    { $eq: ['$type', 'Income'] }
                  ]
                }, '$amount', 0]
              }
            },
            expenses: {
              $sum: {
                $cond: [{ 
                  $or: [
                    { $eq: ['$type', 'expense'] },
                    { $eq: ['$type', 'Expense'] }
                  ]
                }, '$amount', 0]
              }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const formattedTrends = trends.map(t => ({
        monthYear: `${t._id.year}-${String(t._id.month).padStart(2, '0')}`,
        totalIncome: parseFloat(t.income.toFixed(2)),
        totalExpenses: parseFloat(t.expenses.toFixed(2)),
        netSavings: parseFloat((t.income - t.expenses).toFixed(2))
      }));

      let totalSpending = 0;
      formattedTrends.forEach(t => totalSpending += t.totalExpenses);

      const data = {
        trends: formattedTrends,
        averageMonthlySpending: formattedTrends.length > 0 ? parseFloat((totalSpending / formattedTrends.length).toFixed(2)) : 0,
        totalSpending: parseFloat(totalSpending.toFixed(2)),
        period: `${startDate} to ${endDate}`
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching spending trends:', error.message);
      throw new Error(`Failed to fetch spending trends: ${error.message}`);
    }
  }

  /**
   * Get Category Analysis
   * Breakdown by category
   */
  async getCategoryAnalysis(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('categoryAnalysis', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const categoryStats = await Transaction.aggregate([
        {
          $match: {
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            date: { $gte: start, $lte: end },
            $or: [
              { type: 'expense' },
              { type: 'Expense' }
            ]
          }
        },
        {
          $group: {
            _id: '$category',
            amount: { $sum: { $abs: '$amount' } }
          }
        },
        { $sort: { amount: -1 } }
      ]);

      let totalAmount = 0;
      categoryStats.forEach(cat => totalAmount += cat.amount);

      const categories = categoryStats.map(cat => ({
        category: cat._id || 'Uncategorized',
        amount: parseFloat(cat.amount.toFixed(2)),
        percentage: totalAmount > 0 ? parseFloat((cat.amount / totalAmount * 100).toFixed(2)) : 0
      }));

      const data = {
        categories,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        period: `${startDate} to ${endDate}`
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching category analysis:', error.message);
      throw new Error(`Failed to fetch category analysis: ${error.message}`);
    }
  }

  /**
   * Get Goals Progress
   */
  async getGoalsProgress(userId) {
    try {
      const cacheKey = this.getCacheKey('goalsProgress', userId);
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const goals = await Goal.find({ userId }).lean();

      let onTrackGoals = 0;
      let overdueGoals = 0;
      let totalProgress = 0;

      const formattedGoals = goals.map(goal => {
        const progress = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
        const isOverdue = goal.deadline && new Date(goal.deadline) < new Date();
        
        if (isOverdue) overdueGoals++;
        if (progress >= 100) onTrackGoals++;
        
        totalProgress += progress;

        return {
          id: goal._id.toString(),
          name: goal.name,
          progress: parseFloat(progress.toFixed(2)),
          savedAmount: parseFloat(goal.savedAmount.toFixed(2)),
          targetAmount: parseFloat(goal.targetAmount.toFixed(2)),
          deadline: goal.deadline ? goal.deadline.toISOString().split('T')[0] : null,
          status: progress >= 100 ? 'Completed' : isOverdue ? 'Overdue' : 'On Track',
          isOverdue
        };
      });

      const data = {
        goals: formattedGoals,
        summary: {
          totalGoals: goals.length,
          onTrackGoals,
          overdueGoals,
          averageProgress: goals.length > 0 ? parseFloat((totalProgress / goals.length).toFixed(2)) : 0
        }
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching goals progress:', error.message);
      throw new Error(`Failed to fetch goals progress: ${error.message}`);
    }
  }

  /**
   * Get Income Trends
   */
  async getIncomeTrends(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('incomeTrends', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const trends = await Transaction.aggregate([
        {
          $match: {
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            date: { $gte: start, $lte: end },
            $or: [
              { type: 'income' },
              { type: 'Income' }
            ]
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            totalIncome: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const formattedTrends = trends.map(t => ({
        monthYear: `${t._id.year}-${String(t._id.month).padStart(2, '0')}`,
        totalIncome: parseFloat(t.totalIncome.toFixed(2))
      }));

      let totalIncome = 0;
      formattedTrends.forEach(t => totalIncome += t.totalIncome);

      const data = {
        trends: formattedTrends,
        averageMonthlyIncome: formattedTrends.length > 0 ? parseFloat((totalIncome / formattedTrends.length).toFixed(2)) : 0
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching income trends:', error.message);
      throw new Error(`Failed to fetch income trends: ${error.message}`);
    }
  }

  /**
   * Get Savings Trends
   */
  async getSavingsTrends(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('savingsTrends', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const trends = await Transaction.aggregate([
        {
          $match: {
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            date: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            income: { 
              $sum: { 
                $cond: [{ 
                  $or: [
                    { $eq: ['$type', 'income'] },
                    { $eq: ['$type', 'Income'] }
                  ]
                }, '$amount', 0] 
              } 
            },
            expenses: { 
              $sum: { 
                $cond: [{ 
                  $or: [
                    { $eq: ['$type', 'expense'] },
                    { $eq: ['$type', 'Expense'] }
                  ]
                }, '$amount', 0] 
              } 
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const formattedTrends = trends.map(t => {
        const savings = t.income - t.expenses;
        const savingsRate = t.income > 0 ? (savings / t.income) * 100 : 0;
        return {
          monthYear: `${t._id.year}-${String(t._id.month).padStart(2, '0')}`,
          savings: parseFloat(savings.toFixed(2)),
          savingsRate: parseFloat(savingsRate.toFixed(2))
        };
      });

      let totalSavings = 0;
      formattedTrends.forEach(t => totalSavings += t.savings);

      const bestMonth = formattedTrends.length > 0 
        ? formattedTrends.reduce((max, t) => t.savings > max.savings ? t : max)
        : null;

      const data = {
        trends: formattedTrends,
        averageMonthlySavings: formattedTrends.length > 0 ? parseFloat((totalSavings / formattedTrends.length).toFixed(2)) : 0,
        totalSavings: parseFloat(totalSavings.toFixed(2)),
        bestMonth: bestMonth ? { month: bestMonth.monthYear, amount: bestMonth.savings } : null,
        period: `${startDate} to ${endDate}`
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching savings trends:', error.message);
      throw new Error(`Failed to fetch savings trends: ${error.message}`);
    }
  }

  /**
   * Get Transaction Insights
   */
  async getTransactionInsights(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('transactionInsights', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const transactions = await Transaction.find({
        userId,
        date: { $gte: start, $lte: end }
      });

      const stats = {
        totalTransactions: transactions.length,
        dailyAverage: 0,
        maxTransaction: {},
        minTransaction: {},
        averagePerDay: 0,
        mostUsedPaymentMethod: 'N/A',
        topCategory: 'N/A'
      };

      if (transactions.length > 0) {
        const amounts = transactions.map(t => t.amount).sort((a, b) => b - a);
        const maxTxn = transactions.find(t => t.amount === amounts[0]);
        const minTxn = transactions.find(t => t.amount === amounts[amounts.length - 1]);

        stats.maxTransaction = {
          amount: maxTxn.amount,
          description: maxTxn.description || maxTxn.category,
          date: maxTxn.date.toISOString().split('T')[0]
        };

        stats.minTransaction = {
          amount: minTxn.amount,
          description: minTxn.description || minTxn.category,
          date: minTxn.date.toISOString().split('T')[0]
        };

        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        stats.dailyAverage = parseFloat((transactions.length / daysDiff).toFixed(2));
        stats.averagePerDay = parseFloat((transactions.reduce((sum, t) => sum + t.amount, 0) / daysDiff).toFixed(2));

        // Top category
        const categoryCount = {};
        transactions.forEach(t => {
          categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
        });
        stats.topCategory = Object.keys(categoryCount).reduce((a, b) => 
          categoryCount[a] > categoryCount[b] ? a : b
        );
      }

      const data = {
        period: `${startDate} to ${endDate}`,
        ...stats
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching transaction insights:', error.message);
      throw new Error(`Failed to fetch transaction insights: ${error.message}`);
    }
  }

  /**
   * Get Budget Performance
   */
  async getBudgetPerformance(userId, startDate, endDate) {
    try {
      const cacheKey = this.getCacheKey('budgetPerformance', userId, { startDate, endDate });
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Budget schema: one doc per user per month/year, with categories[]{name, limit}.
      // Find the budget doc whose month/year falls within the requested date range.
      const startMonth = start.getMonth() + 1;
      const startYear  = start.getFullYear();
      const endMonth   = end.getMonth() + 1;
      const endYear    = end.getFullYear();

      // Collect all month/year combinations in the requested range
      const monthYearConditions = [];
      let y = startYear, m = startMonth;
      while (y < endYear || (y === endYear && m <= endMonth)) {
        monthYearConditions.push({ month: m, year: y });
        m++;
        if (m > 12) { m = 1; y++; }
      }

      // Guard: if no valid months could be computed (e.g., invalid date inputs),
      // return empty result instead of sending $or:[] to MongoDB
      if (monthYearConditions.length === 0) {
        const empty = { message: 'No budget set for this period', categories: [], overallPerformance: 'N/A', recommendations: [] };
        this.setCache(cacheKey, empty);
        return empty;
      }

      const budgetDocs = await Budget.find({
        userId,
        $or: monthYearConditions
      }).lean();

      if (!budgetDocs.length) {
        const empty = { message: 'No budget set for this period', categories: [], overallPerformance: 'N/A', recommendations: [] };
        this.setCache(cacheKey, empty);
        return empty;
      }

      // Merge categories across months — sum limits for multi-month ranges,
      // so a user who set Food=5000/month gets Food=10000 for a 2-month range.
      const categoryLimitMap = {};
      for (const doc of budgetDocs) {
        for (const cat of (doc.categories || [])) {
          categoryLimitMap[cat.name] = (categoryLimitMap[cat.name] || 0) + (cat.limit ?? 0);
        }
      }

      const transactions = await Transaction.find({
        userId,
        date: { $gte: start, $lte: end },
        $or: [{ type: 'expense' }, { type: 'Expense' }]
      }).lean();

      const categories = Object.entries(categoryLimitMap).map(([catName, budgeted]) => {
        // Math.abs because expenses are stored as negative numbers in the DB
        const spent = transactions
          .filter(t => t.category === catName)
          .reduce((sum, t) => sum + Math.abs(t.amount ?? 0), 0);

        const remaining      = budgeted - spent;
        const percentageUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;

        return {
          category:       catName,
          budgeted:       parseFloat(budgeted.toFixed(2)),
          spent:          parseFloat(spent.toFixed(2)),
          remaining:      parseFloat(remaining.toFixed(2)),
          percentageUsed: parseFloat(percentageUsed.toFixed(2)),
          status: percentageUsed > 100 ? 'Over Budget' : percentageUsed > 80 ? 'Warning' : 'Within Budget'
        };
      });

      const data = {
        message: 'Budget Performance Summary',
        categories,
        overallPerformance: categories.every(c => c.percentageUsed <= 100) ? 'Good' : 'Needs Attention',
        recommendations: categories
          .filter(c => c.percentageUsed > 80)
          .map(c => `${c.category} is at ${c.percentageUsed}% of budget`)
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching budget performance:', error.message);
      throw new Error(`Failed to fetch budget performance: ${error.message}`);
    }
  }

  /**
   * Get Current Month Analytics
   */
  async getCurrentMonthAnalytics(userId) {
    try {
      const cacheKey = this.getCacheKey('currentMonthAnalytics', userId);
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const start = new Date(year, now.getMonth(), 1);
      const end = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);

      const transactions = await Transaction.find({
        userId,
        date: { $gte: start, $lte: end }
      });

      let totalIncome = 0;
      let totalExpenses = 0;

      transactions.forEach(t => {
        if (t.type === 'income' || t.type === 'Income') {
          totalIncome += Math.max(0, t.amount); // Only positive amounts for income
        } else if (t.type === 'expense' || t.type === 'Expense') {
          totalExpenses += Math.abs(t.amount); // Always use absolute value for expenses
        }
      });

      const netSavings = totalIncome - totalExpenses;
      const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

      // Category breakdown
      const categoryStats = await Transaction.aggregate([
        {
          $match: {
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            date: { $gte: start, $lte: end },
            $or: [
              { type: 'expense' },
              { type: 'Expense' }
            ]
          }
        },
        {
          $group: {
            _id: '$category',
            amount: { $sum: { $abs: '$amount' } }
          }
        }
      ]);

      const categoryBreakdown = categoryStats.map(cat => ({
        category: cat._id || 'Uncategorized',
        amount: parseFloat(cat.amount.toFixed(2)),
        percentage: totalExpenses > 0 ? parseFloat((cat.amount / totalExpenses * 100).toFixed(2)) : 0
      }));

      const data = {
        year,
        month,
        summary: {
          totalIncome: parseFloat(totalIncome.toFixed(2)),
          totalExpenses: parseFloat(totalExpenses.toFixed(2)),
          netSavings: parseFloat(netSavings.toFixed(2)),
          savingsRate: parseFloat(savingsRate.toFixed(2))
        },
        categoryBreakdown
      };

      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching current month analytics:', error.message);
      throw new Error(`Failed to fetch current month analytics: ${error.message}`);
    }
  }
}

module.exports = new AnalyticsService();
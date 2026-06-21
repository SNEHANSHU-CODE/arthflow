const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const mongoose = require('mongoose');
const notificationService = require('./notificationService');
const Budget = require('../models/budgetModel');

class TransactionService {
  // Create a new transaction
  async createTransaction(userId, transactionData) {
    try {
      // Validate user exists
      const userExists = await User.findById(userId);
      if (!userExists) {
        throw new Error('User not found');
      }

      // Ensure amount has correct sign based on type
      if (transactionData.type === 'Expense' && transactionData.amount > 0) {
        transactionData.amount = -Math.abs(transactionData.amount);
      } else if (transactionData.type === 'Income' && transactionData.amount < 0) {
        transactionData.amount = Math.abs(transactionData.amount);
      }

      const transaction = new Transaction({
        userId,
        ...transactionData
      });

      await transaction.save();
      await transaction.populate('goalId', 'name category');

      // Check budget alert if this is an expense
      if (transaction.type === 'Expense') {
        this._checkBudgetAlert(userId, transaction).catch(err =>
          console.error('[transactionService] budget alert error:', err.message)
        );
      }

      return {
        success: true,
        message: 'Transaction created successfully',
        data: transaction
      };
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  // Get transactions by user with filters
  async getTransactions(userId, options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category,
      startDate,
      endDate,
      paymentMethod,
      tags,
      searchTerm,
      sortBy = 'date',
      sortOrder = 'desc'
    } = options;

    const { ObjectId } = require('mongoose').Types;

    if (!userId || typeof userId !== 'string' || !ObjectId.isValid(userId)) {
      throw new Error('Invalid or missing userId');
    }

    const query = { userId: new ObjectId(userId) };

    // Helper function to check if value is valid and not empty
    const isValid = (val) => {
      if (val === undefined || val === null || val === '' || val === 'undefined') {
        return false;
      }
      // Handle arrays (from duplicate query params)
      if (Array.isArray(val)) {
        return val.length > 0 && val[0] !== '' && val[0] !== undefined && val[0] !== null;
      }
      return true;
    };

    // Type filter - handle both string and array
    const typeValue = Array.isArray(type) ? type[0] : type;
    if (typeValue && typeValue !== 'all' && (typeValue === 'Income' || typeValue === 'Expense')) {
      query.type = typeValue;
    }

    // Category filter
    if (isValid(category)) {
      const categoryValue = Array.isArray(category) ? category[0] : category;
      query.category = categoryValue;
    }

    // Payment method filter
    if (isValid(paymentMethod)) {
      const paymentMethodValue = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
      query.paymentMethod = paymentMethodValue;
    }

    // Tags filter
    if (Array.isArray(tags) && tags.length > 0) {
      query.tags = { $in: tags };
    }

    // Date range filter - ONLY add if at least one valid date exists
    const hasValidStartDate = isValid(startDate);
    const hasValidEndDate = isValid(endDate);

    if (hasValidStartDate || hasValidEndDate) {
      const dateQuery = {};

      if (hasValidStartDate) {
        const startDateValue = Array.isArray(startDate) ? startDate[0] : startDate;
        const start = new Date(startDateValue);
        if (!isNaN(start.getTime())) {
          dateQuery.$gte = start;
        }
      }

      if (hasValidEndDate) {
        const endDateValue = Array.isArray(endDate) ? endDate[0] : endDate;
        const end = new Date(endDateValue);
        if (!isNaN(end.getTime())) {
          // Set to end of day
          end.setHours(23, 59, 59, 999);
          dateQuery.$lte = end;
        }
      }

      // Only add date filter if we have at least one valid date
      if (Object.keys(dateQuery).length > 0) {
        query.date = dateQuery;
      }
    }

    // Search functionality
    if (isValid(searchTerm)) {
      const searchValue = Array.isArray(searchTerm) ? searchTerm[0] : searchTerm;
      const escapedSearch = searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { description: searchRegex },
        { notes: searchRegex },
        { category: searchRegex },
        { paymentMethod: searchRegex }
      ];

      // If search term is a number, also search in amount
      if (!isNaN(searchValue)) {
        query.$or.push({ amount: parseFloat(searchValue) }, { amount: -Math.abs(parseFloat(searchValue)) });
      }
    }

    // Pagination
    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    if (sortBy !== 'createdAt') {
      sortOptions.createdAt = sortOrder === 'desc' ? -1 : 1;
    }

    // Execute query
    const transactions = await Transaction.find(query)
      .populate('goalId', 'name category')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    };
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
}

  // Get single transaction by ID
  async getTransactionById(transactionId, userId) {
    try {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        userId
      }).populate('goalId', 'name category');

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      return {
        success: true,
        data: transaction
      };
    } catch (error) {
      console.error('Error getting transaction:', error);
      throw error;
    }
  }

  // Update transaction
  async updateTransaction(transactionId, userId, updateData) {
    try {
      // Ensure amount has correct sign based on type
      if (updateData.type === 'Expense' && updateData.amount > 0) {
        updateData.amount = -Math.abs(updateData.amount);
      } else if (updateData.type === 'Income' && updateData.amount < 0) {
        updateData.amount = Math.abs(updateData.amount);
      }

      const transaction = await Transaction.findOne({ _id: transactionId, userId });
      if (!transaction) throw new Error('Transaction not found');
      Object.assign(transaction, updateData);
      await transaction.save();
      await transaction.populate('goalId', 'name category');

      return {
        success: true,
        message: 'Transaction updated successfully',
        data: transaction
      };
    } catch (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  }

  // Delete transaction
  async deleteTransaction(transactionId, userId) {
    try {
      const transaction = await Transaction.findOneAndDelete({
        _id: transactionId,
        userId
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      return {
        success: true,
        message: 'Transaction deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      throw error;
    }
  }

  // Get monthly summary
  async getMonthlySummary(userId, month, year) {
    try {
      const summary = await Transaction.getMonthlySummary(userId, month, year);

      return {
        success: true,
        data: summary
      };
    } catch (error) {
      console.error('Error getting monthly summary:', error);
      throw error;
    }
  }

  // Get category analysis
async getCategoryAnalysis(userId) {
  try {
    const analysis = await Transaction.getCategoryAnalysis(userId);

    return {
      success: true,
      data: analysis
    };
  } catch (error) {
    console.error('Error getting category analysis:', error);
    throw error;
  }
}

  // Get recent transactions
  async getRecentTransactions(userId, limit = 5) {
    try {
      const transactions = await Transaction.getRecent(userId, limit);

      return {
        success: true,
        data: transactions
      };
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      throw error;
    }
  }

  // Get dashboard stats
  async getDashboardStats(userId) {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get current month summary
      const monthlyStats = await this.getMonthlySummary(userId, currentMonth, currentYear);

      // Get recent transactions
      const recentTransactions = await this.getRecentTransactions(userId, 5);

      // Get year-to-date stats
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31);

      const [yearlyStats] = await Transaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            date: { $gte: yearStart, $lte: yearEnd }
          }
        },
        {
          $group: {
            _id: null,
            totalIncome: {
              $sum: {
                $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0]
              }
            },
            totalExpenses: {
              $sum: {
                $cond: [{ $eq: ['$type', 'Expense'] }, { $abs: '$amount' }, 0]
              }
            },
            transactionCount: { $sum: 1 }
          }
        }
      ]);

      const yearlyIncome = yearlyStats?.totalIncome || 0;
      const yearlyExpenses = yearlyStats?.totalExpenses || 0;
      const transactionCount = yearlyStats?.transactionCount || 0;

      return {
        success: true,
        data: {
          monthly: monthlyStats.data,
          recent: recentTransactions.data,
          yearly: {
            totalIncome: yearlyIncome,
            totalExpenses: yearlyExpenses,
            netSavings: yearlyIncome - yearlyExpenses,
            transactionCount: transactionCount
          }
        }
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  }

  // Set transaction as recurring
  async setRecurring(transactionId, userId, frequency, endDate = null) {
    try {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        userId
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      await transaction.setRecurring(frequency, endDate);

      return {
        success: true,
        message: 'Transaction set as recurring successfully',
        data: transaction
      };
    } catch (error) {
      console.error('Error setting recurring transaction:', error);
      throw error;
    }
  }

  // Bulk delete transactions
  async bulkDeleteTransactions(transactionIds, userId) {
    try {
      const result = await Transaction.deleteMany({
        _id: { $in: transactionIds },
        userId
      });

      return {
        success: true,
        message: `${result.deletedCount} transactions deleted successfully`,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      console.error('Error bulk deleting transactions:', error);
      throw error;
    }
  }

  // Bulk insert transactions — used by PDF / CSV / Excel import flow
  async bulkInsertTransactions(userId, transactionsData) {
    try {
      const userExists = await User.findById(userId);
      if (!userExists) throw new Error('User not found');

      // Fix amount sign and stamp every doc with userId + import source
      const escapeHtml = (unsafe) => {
        return (unsafe || '').replace(/[&<"'>]/g, function (match) {
          switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
          }
        });
      };

      const docs = transactionsData.map((t) => {
        let amount = parseFloat(t.amount);
        if (t.type === 'Expense' && amount > 0) amount = -Math.abs(amount);
        if (t.type === 'Income'  && amount < 0) amount =  Math.abs(amount);

        return {
          userId,
          description:   t.description ? escapeHtml(t.description) : '',
          amount,
          type:          t.type,
          category:      t.category,
          date:          t.date ? new Date(t.date) : new Date(),
          paymentMethod: t.paymentMethod || 'Other',
          notes:         t.notes ? escapeHtml(t.notes) : '',
          metadata:      { source: 'import' }
        };
      });

      // Deduplicate by fingerprint: (userId + date + amount + description)
      const crypto = require('crypto');
      const fingerprint = (doc) =>
        crypto.createHash('md5')
          .update(`${doc.userId}|${doc.date?.toISOString?.() ?? doc.date}|${doc.amount}|${doc.description}`)
          .digest('hex');

      const fingerprintedDocs = docs.map(d => ({ ...d, _fingerprint: fingerprint(d) }));
      const fpHashes = fingerprintedDocs.map(d => d._fingerprint);

      const existing = await Transaction.find(
        { userId, _fingerprint: { $in: fpHashes } },
        { _fingerprint: 1 }
      ).lean();

      const existingSet = new Set(existing.map(e => e._fingerprint));
      const newDocs = fingerprintedDocs.filter(d => !existingSet.has(d._fingerprint));

      if (newDocs.length === 0) {
        return { success: true, message: '0 new transactions — all duplicates', insertedCount: 0, data: [] };
      }

      // ordered:false — continues on individual doc validation errors
      const inserted = await Transaction.insertMany(newDocs, { ordered: false });

      return {
        success: true,
        message: `${inserted.length} transactions imported successfully`,
        insertedCount: inserted.length,
        data: inserted
      };
    } catch (error) {
      if (error.name === 'MongoBulkWriteError' || error.name === 'BulkWriteError') {
        const insertedCount = error.result?.insertedCount ?? error.result?.nInserted ?? 0;
        if (insertedCount > 0) {
          return {
            success: true,
            message: `${insertedCount} transactions imported (${error.writeErrors?.length ?? 0} skipped)`,
            insertedCount,
            data: []  // insertedDocs not available on bulk error; UI shows count only
          };
        }
      }
      console.error('Error bulk inserting transactions:', error);
      throw error;
    }
  }


  async getSpendingTrends(userId) {
    try {
      const currentDate = new Date();

      const monthOffsets = [5, 4, 3, 2, 1, 0];
      const trendsPromises = monthOffsets.map(async (i) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        const summary = await Transaction.getMonthlySummary(userId, month, year);
        return {
          month: date.toLocaleString('default', { month: 'long' }),
          year,
          ...summary
        };
      });

      const trends = await Promise.all(trendsPromises);

      return {
        success: true,
        data: trends
      };
    } catch (error) {
      console.error('Error getting spending trends:', error);
      throw error;
    }
  }

  // Check if user has already migrated guest data
  async checkGuestMigration(userId) {
    try {
      const existingTransaction = await Transaction.findOne({
        userId,
        isGuestMigrated: true
      });
      return !!existingTransaction;
    } catch (error) {
      console.error('Error checking guest migration:', error);
      return false;
    }
  }

  // Migrate guest data to user account
  async migrateGuestData(userId, transactions) {
    try {
      const transactionsToInsert = transactions.map(guestTransaction => {
        // Ensure amount has correct sign based on type
        let amount = guestTransaction.amount;
        if (guestTransaction.type === 'Expense' && amount > 0) {
          amount = -Math.abs(amount);
        } else if (guestTransaction.type === 'Income' && amount < 0) {
          amount = Math.abs(amount);
        }

        return {
          userId,
          description: guestTransaction.description,
          amount,
          type: guestTransaction.type,
          category: guestTransaction.category,
          date: guestTransaction.date,
          paymentMethod: guestTransaction.paymentMethod,
          notes: guestTransaction.notes,
          tags: guestTransaction.tags,
          isGuestMigrated: true,
          migratedAt: new Date()
        };
      });

      const migratedTransactions = await Transaction.insertMany(transactionsToInsert);

      return {
        success: true,
        message: `${migratedTransactions.length} transactions migrated successfully`,
        data: {
          migratedCount: migratedTransactions.length,
          transactions: migratedTransactions
        }
      };
    } catch (error) {
      console.error('Error migrating guest data:', error);
      throw error;
    }
  }
  // Check if a new expense triggers a budget alert for its category
  async _checkBudgetAlert(userId, transaction) {
    try {
      const date = new Date(transaction.date);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const budget = await Budget.findOne({ userId, month, year });
      if (!budget) return;

      const categoryBudget = budget.categories.find(
        c => c.name === transaction.category
      );
      if (!categoryBudget || !categoryBudget.limit) return;

      // Sum all expenses in this category for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const [result] = await Transaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            type: 'Expense',
            category: transaction.category,
            date: { $gte: startDate, $lte: endDate },
          },
        },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]);

      if (!result) return;

      const spent = result.total;
      const percentage = Math.round((spent / categoryBudget.limit) * 100);

      // Notify at 80% warning and 100% exceeded — avoid duplicate spam
      // by checking if we already sent this alert level this month
      if (percentage >= 100) {
        const recentAlert = await require('../models/notificationModel').findOne({
          userId,
          type: 'budget_exceeded',
          'data.category': transaction.category,
          createdAt: { $gte: startDate },
        });
        if (!recentAlert) {
          await notificationService.createBudgetAlert(userId, {
            _id: budget._id,
            category: transaction.category,
            spentAmount: spent,
            alertThreshold: 100,
          }, percentage);
        }
      } else if (percentage >= 80) {
        const recentAlert = await require('../models/notificationModel').findOne({
          userId,
          type: 'budget_alert',
          'data.category': transaction.category,
          createdAt: { $gte: startDate },
        });
        if (!recentAlert) {
          await notificationService.createBudgetAlert(userId, {
            _id: budget._id,
            category: transaction.category,
            spentAmount: spent,
            alertThreshold: 80,
          }, percentage);
        }
      }
    } catch (err) {
      console.error('[transactionService] _checkBudgetAlert failed:', err.message);
    }
  }
}

module.exports = new TransactionService();
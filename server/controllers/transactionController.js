const transactionService = require('../services/transactionService');

class TransactionController {
  // Create a new transaction
  async createTransaction(req, res) {
    try {
      const userId = req.userId;
      const transactionData = req.body;

      const result = await transactionService.createTransaction(userId, transactionData);
      
      res.status(201).json(result);
    } catch (error) {
      console.error('Create transaction error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create transaction'
      });
    }
  }

  // Get all transactions with filters and pagination
  async getTransactions(req, res) {
    try {
      const userId = req.userId?.toString();
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        type: req.query.type,
        category: req.query.category,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        paymentMethod: req.query.paymentMethod,
        tags: req.query.tags ? req.query.tags.split(',') : undefined,
        searchTerm: req.query.searchTerm || req.query.search,
        sortBy: req.query.sortBy || 'date',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await transactionService.getTransactions(userId, options);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get transactions'
      });
    }
  }

  // Get single transaction by ID
  async getTransactionById(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const result = await transactionService.getTransactionById(id, userId);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(404).json({
        success: false,
        message: error.message || 'Transaction not found'
      });
    }
  }

  // Update transaction
  async updateTransaction(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updateData = req.body;

      const result = await transactionService.updateTransaction(id, userId, updateData);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Update transaction error:', error);
      const statusCode = error.message === 'Transaction not found' ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update transaction'
      });
    }
  }

  // Delete transaction
  async deleteTransaction(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const result = await transactionService.deleteTransaction(id, userId);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Delete transaction error:', error);
      const statusCode = error.message === 'Transaction not found' ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete transaction'
      });
    }
  }

  // Get monthly summary
  async getMonthlySummary(req, res) {
    try {
      const userId = req.userId;
      const { month, year } = req.params;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const result = await transactionService.getMonthlySummary(
        userId, 
        parseInt(month), 
        parseInt(year)
      );
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get monthly summary error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get monthly summary'
      });
    }
  }

  // Get category analysis
  // Get category analysis
async getCategoryAnalysis(req, res) {
  try {
    const userId = req.userId;

    const result = await transactionService.getCategoryAnalysis(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Get category analysis error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to get category analysis'
    });
  }
}

  // Get recent transactions
  async getRecentTransactions(req, res) {
    try {
      const userId = req.userId;
      const limit = parseInt(req.query.limit) || 5;

      const result = await transactionService.getRecentTransactions(userId, limit);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get recent transactions error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get recent transactions'
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const userId = req.userId;

      const result = await transactionService.getDashboardStats(userId);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get dashboard statistics'
      });
    }
  }

  // Set transaction as recurring
  async setRecurring(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { frequency, endDate } = req.body;

      if (!frequency) {
        return res.status(400).json({
          success: false,
          message: 'Frequency is required'
        });
      }

      const result = await transactionService.setRecurring(id, userId, frequency, endDate);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Set recurring transaction error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to set recurring transaction'
      });
    }
  }

  // Bulk delete transactions
  async bulkDeleteTransactions(req, res) {
    try {
      const userId = req.userId;
      const { transactionIds } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Transaction IDs array is required'
        });
      }

      const result = await transactionService.bulkDeleteTransactions(transactionIds, userId);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Bulk delete transactions error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete transactions'
      });
    }
  }

  // Get spending trends
  async getSpendingTrends(req, res) {
    try {
      const userId = req.userId;

      const result = await transactionService.getSpendingTrends(userId);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get spending trends error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get spending trends'
      });
    }
  }

  // Get current month summary (convenience endpoint)
  async getCurrentMonthSummary(req, res) {
    try {
      const userId = req.userId;
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const result = await transactionService.getMonthlySummary(userId, month, year);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Get current month summary error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get current month summary'
      });
    }
  }

  // Export transactions (CSV format)
  async exportTransactions(req, res) {
    try {
      const userId = req.userId;
      const { startDate, endDate, format = 'json' } = req.query;

      const options = {
        page: Math.max(1, parseInt(req.query.page) || 1),
        limit: 10000,
        startDate,
        endDate
      };

      const result = await transactionService.getTransactions(userId, options);
      
      if (format === 'csv') {
        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
        
        // Convert to CSV (you might want to use a proper CSV library)
        const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
        const csvHeader = 'Date,Description,Amount,Type,Category,Payment Method,Notes\n';
        const csvData = result.data.transactions
          .map(t => `${esc(t.date)},${esc(t.description)},${esc(t.amount)},${esc(t.type)},${esc(t.category)},${esc(t.paymentMethod)},${esc(t.notes)}`)
          .join('\n');
        
        res.send(csvHeader + csvData);
      } else {
        res.status(200).json(result);
      }
    } catch (error) {
      console.error('Export transactions error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to export transactions'
      });
    }
  }

  // Migrate guest data to user account (one-time operation)
  async migrateGuestData(req, res) {
    try {
      const userId = req.userId;
      const { transactions } = req.body;

      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({
          success: false,
          message: 'Transactions array is required'
        });
      }

      // Check if user has already migrated guest data
      const existingMigration = await transactionService.checkGuestMigration(userId);
      if (existingMigration) {
        return res.status(400).json({
          success: false,
          message: 'Guest data has already been migrated for this account'
        });
      }

      const result = await transactionService.migrateGuestData(userId, transactions);
      
      res.status(200).json({
        success: true,
        message: 'Guest data migrated successfully',
        data: result
      });
    } catch (error) {
      console.error('Migrate guest data error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to migrate guest data'
      });
    }
  }
  // Bulk insert transactions (from PDF / CSV / Excel import)
  async bulkInsertTransactions(req, res) {
    try {
      const userId = req.userId;
      const { transactions } = req.body;

      if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'transactions array is required and must not be empty'
        });
      }

      const result = await transactionService.bulkInsertTransactions(userId, transactions);

      res.status(201).json(result);
    } catch (error) {
      console.error('Bulk insert transactions error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to bulk insert transactions'
      });
    }
  }
}

module.exports = new TransactionController();
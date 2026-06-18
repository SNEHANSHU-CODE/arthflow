const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [100, 'Description cannot exceed 100 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    validate: {
      validator: function(value) {
        return value !== 0;
      },
      message: 'Amount cannot be zero'
    }
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: ['Income', 'Expense']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      // Income categories
      'Salary', 'Freelance', 'Bonus', 'Investment', 'Other Income',
      // Expense categories
      'Food', 'Transportation', 'Shopping', 'Entertainment', 'Utilities', 
      'Healthcare', 'Education', 'Travel', 'Insurance', 'Rent', 'Other Expense'
    ]
  },
  date: {
    type: Date,
    default: Date.now,
    required: [true, 'Transaction date is required'],
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Transaction date cannot be in the future'
    }
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'],
    default: 'Other'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  notes: {
    type: String,
    maxlength: [200, 'Notes cannot exceed 200 characters']
  },
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    default: null
  },
  location: {
    name: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  receiptUrl: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Receipt URL must be a valid URL'
    }
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
      required: function() { return this.isRecurring; }
    },
    nextDate: {
      type: Date,
      required: function() { return this.isRecurring; }
    },
    endDate: Date,
    parentTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    }
  },
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'recurring', 'guest-migration'],
      default: 'manual'
    },
    deviceInfo: String,
    ipAddress: String,
    isGuestMigrated: {
      type: Boolean,
      default: false
    },
    migratedAt: Date
  },
  _fingerprint: {
    type: String,
    index: true,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for better performance - updated to use userId
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ userId: 1, date: -1, type: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, tags: 1 });
transactionSchema.index({ 'recurringPattern.nextDate': 1, isRecurring: 1 });
transactionSchema.index({ userId: 1, 'recurringPattern.nextDate': 1 });
transactionSchema.index({ userId: 1, paymentMethod: 1 });
transactionSchema.index({ userId: 1, tags: 1, date: -1 });

// Text index for search functionality
transactionSchema.index({
  description: 'text',
  notes: 'text',
  tags: 'text'
});

// Virtual for absolute amount (always positive)
transactionSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

// Virtual for formatted amount with currency
transactionSchema.virtual('formattedAmount').get(function() {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });
  return formatter.format(this.absoluteAmount);
});

// Virtual for display amount with sign
transactionSchema.virtual('displayAmount').get(function() {
  const prefix = this.type === 'Income' ? '+' : '-';
  return `${prefix}${this.formattedAmount}`;
});

// Virtual for month/year grouping
transactionSchema.virtual('monthYear').get(function() {
  const date = new Date(this.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
});

// Virtual for week of year
transactionSchema.virtual('weekOfYear').get(function() {
  const date = new Date(this.date);
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
});

// Pre-save middleware to ensure amount sign consistency
transactionSchema.pre('save', function(next) {
  // Ensure expenses are negative and income is positive
  if (this.type === 'Expense' && this.amount > 0) {
    this.amount = -Math.abs(this.amount);
  } else if (this.type === 'Income' && this.amount < 0) {
    this.amount = Math.abs(this.amount);
  }
  
  // Clean and validate tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .filter(tag => tag && tag.trim())
      .map(tag => tag.trim().toLowerCase())
      .slice(0, 10); // Limit to 10 tags
  }
  
  next();
});

// Static method to get transactions by user with advanced filtering
transactionSchema.statics.getByUser = function(userId, options = {}) {
  const {
    startDate,
    endDate,
    type,
    category,
    paymentMethod,
    tags,
    searchText,
    minAmount,
    maxAmount,
    limit = 50,
    skip = 0,
    sortBy = 'date',
    sortOrder = 'desc'
  } = options;
  
  const query = { userId };
  
  // Date range filter
  if (startDate && endDate) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  // Type filter
  if (type) query.type = type;
  
  // Category filter
  if (category) query.category = category;
  
  // Payment method filter
  if (paymentMethod) query.paymentMethod = paymentMethod;
  
  // Tags filter
  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }
  
  // Amount range filter
  if (minAmount !== undefined || maxAmount !== undefined) {
    query.amount = {};
    if (minAmount !== undefined) query.amount.$gte = minAmount;
    if (maxAmount !== undefined) query.amount.$lte = maxAmount;
  }
  
  // Text search
  if (searchText) {
    query.$text = { $search: searchText };
  }
  
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  if (sortBy !== 'createdAt') {
    sortOptions.createdAt = sortOrder === 'desc' ? -1 : 1;
  }
  
  return this.find(query)
    .populate('goalId', 'name category targetAmount')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);
};

// Static method to get monthly summary with enhanced analytics
transactionSchema.statics.getMonthlySummary = async function(userId, month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate }
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
        transactionCount: { $sum: 1 },
        avgTransactionAmount: { $avg: { $abs: '$amount' } },
        categories: {
          $push: {
            category: '$category',
            amount: { $abs: '$amount' },
            type: '$type'
          }
        },
        paymentMethods: {
          $push: {
            method: '$paymentMethod',
            amount: { $abs: '$amount' }
          }
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  const summary = result[0] || {
    totalIncome: 0,
    totalExpenses: 0,
    transactionCount: 0,
    avgTransactionAmount: 0,
    categories: [],
    paymentMethods: []
  };
  
  // Calculate derived metrics
  const netSavings = summary.totalIncome - summary.totalExpenses;
  const savingsRate = summary.totalIncome > 0 ? (netSavings / summary.totalIncome) * 100 : 0;
  
  // Category breakdown
  const categoryBreakdown = {};
  summary.categories.forEach(cat => {
    if (!categoryBreakdown[cat.category]) {
      categoryBreakdown[cat.category] = { income: 0, expense: 0, total: 0 };
    }
    if (cat.type === 'Income') {
      categoryBreakdown[cat.category].income += cat.amount;
    } else {
      categoryBreakdown[cat.category].expense += cat.amount;
    }
    categoryBreakdown[cat.category].total += cat.amount;
  });
  
  // Payment method breakdown
  const paymentMethodBreakdown = {};
  summary.paymentMethods.forEach(pm => {
    paymentMethodBreakdown[pm.method] = (paymentMethodBreakdown[pm.method] || 0) + pm.amount;
  });
  
  const daysInMonth = new Date(year, month, 0).getDate();
  
  return {
    period: { month, year, startDate, endDate },
    summary: {
      totalIncome: Math.round(summary.totalIncome * 100) / 100,
      totalExpenses: Math.round(summary.totalExpenses * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
      transactionCount: summary.transactionCount,
      averageTransactionAmount: Math.round(summary.avgTransactionAmount * 100) / 100,
      dailyAverage: Math.round((summary.totalIncome + summary.totalExpenses) / daysInMonth * 100) / 100
    },
    breakdowns: {
      categories: categoryBreakdown,
      paymentMethods: paymentMethodBreakdown
    }
  };
};

// Static method for advanced category analysis
transactionSchema.statics.getCategoryAnalysis = async function (userId) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1);

  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type: 'Expense',
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: { $abs: '$amount' } }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ];

  const results = await this.aggregate(pipeline);

  const totalAmount = results.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );

  const categories = results.map(item => ({
    category: item._id,
    amount: Number(item.totalAmount.toFixed(2)),
    percentage: totalAmount
      ? Number(((item.totalAmount / totalAmount) * 100).toFixed(2))
      : 0
  }));

  return {
    type: 'Expense',
    period: { startDate, endDate },
    totalAmount: Number(totalAmount.toFixed(2)),
    categories,
    topCategory: categories[0] || null,
    categoryCount: categories.length
  };
};


// Helper method to find common tags
transactionSchema.statics.getCommonTags = function(tags) {
  const tagCount = {};
  tags.forEach(tag => {
    if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
  });
  
  return Object.entries(tagCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
};

// Static method to get spending trends with comparison
transactionSchema.statics.getSpendingTrends = async function(userId, months = 6) {
  const trends = [];
  const currentDate = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    const summary = await this.getMonthlySummary(userId, month, year);
    
    // Calculate month-over-month change if not the first month
    let monthOverMonthChange = null;
    if (trends.length > 0) {
      const previousMonth = trends[trends.length - 1];
      const currentExpenses = summary.summary.totalExpenses;
      const previousExpenses = previousMonth.totalExpenses;
      
      if (previousExpenses > 0) {
        monthOverMonthChange = ((currentExpenses - previousExpenses) / previousExpenses) * 100;
      }
    }
    
    trends.push({
      month: date.toLocaleString('default', { month: 'long' }),
      year,
      monthYear: `${year}-${String(month).padStart(2, '0')}`,
      ...summary.summary,
      monthOverMonthChange: monthOverMonthChange ? Math.round(monthOverMonthChange * 100) / 100 : null
    });
  }
  
  return {
    trends,
    period: `${months} months`,
    averageMonthlyExpenses: trends.length > 0 ? 
      Math.round((trends.reduce((sum, t) => sum + t.totalExpenses, 0) / trends.length) * 100) / 100 : 0,
    totalPeriodExpenses: trends.reduce((sum, t) => sum + t.totalExpenses, 0)
  };
};

// Static method to get recent transactions with enhanced data
transactionSchema.statics.getRecent = function(userId, limit = 5) {
  return this.find({ userId })
    .populate('goalId', 'name category targetAmount savedAmount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('description amount type category date paymentMethod tags notes createdAt');
};

// Instance method to set recurring pattern
transactionSchema.methods.setRecurring = function(frequency, endDate = null) {
  this.isRecurring = true;
  this.recurringPattern = {
    frequency,
    nextDate: this.calculateNextDate(frequency),
    endDate,
    parentTransactionId: this._id
  };
  return this.save();
};

// Helper method to calculate next recurring date
transactionSchema.methods.calculateNextDate = function(frequency) {
  const currentDate = new Date(this.date);
  
  switch (frequency) {
    case 'Daily':
      return new Date(currentDate.setDate(currentDate.getDate() + 1));
    case 'Weekly':
      return new Date(currentDate.setDate(currentDate.getDate() + 7));
    case 'Monthly':
      return new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    case 'Yearly':
      return new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
    default:
      return new Date(currentDate.setDate(currentDate.getDate() + 1));
  }
};

// Static method to process recurring transactions
transactionSchema.statics.processRecurringTransactions = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dueTransactions = await this.find({
    isRecurring: true,
    'recurringPattern.nextDate': { $lte: today },
    $or: [
      { 'recurringPattern.endDate': { $exists: false } },
      { 'recurringPattern.endDate': null },
      { 'recurringPattern.endDate': { $gte: today } }
    ]
  });
  
  const processedTransactions = [];
  
  for (const transaction of dueTransactions) {
    try {
      // Create new transaction
      const newTransaction = new this({
        userId: transaction.userId,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        date: new Date(),
        paymentMethod: transaction.paymentMethod,
        tags: transaction.tags,
        notes: transaction.notes,
        goalId: transaction.goalId,
        metadata: {
          ...transaction.metadata,
          source: 'recurring'
        }
      });
      
      await newTransaction.save();
      
      // Update next date for the recurring transaction
      transaction.recurringPattern.nextDate = transaction.calculateNextDate(
        transaction.recurringPattern.frequency
      );
      await transaction.save();
      
      processedTransactions.push(newTransaction);
    } catch (error) {
      console.error(`Error processing recurring transaction ${transaction._id}:`, error);
    }
  }
  
  return processedTransactions;
};

// Static method for transaction search
transactionSchema.statics.search = function(userId, searchTerm, options = {}) {
  const { limit = 20, type, category } = options;
  
  const query = {
    userId,
    $text: { $search: searchTerm }
  };
  
  if (type) query.type = type;
  if (category) query.category = category;
  
  return this.find(query)
    .populate('goalId', 'name category')
    .sort({ score: { $meta: 'textScore' }, date: -1, createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Transaction', transactionSchema);
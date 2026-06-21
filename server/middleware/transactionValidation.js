const { body, query, param, validationResult } = require('express-validator');

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation for creating a transaction
const validateTransactionCreate = [
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Description must be between 1 and 100 characters')
    .trim(),

  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (value === 0) {
        throw new Error('Amount cannot be zero');
      }
      return true;
    }),

  body('type')
    .notEmpty()
    .withMessage('Transaction type is required')
    .isIn(['Income', 'Expense'])
    .withMessage('Type must be either Income or Expense'),

  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn([
      'Salary', 'Freelance', 'Bonus', 'Investment', 'Other Income',
      'Food', 'Transportation', 'Shopping', 'Entertainment', 'Utilities',
      'Healthcare', 'Education', 'Travel', 'Insurance', 'Rent', 'Other Expense'
    ])
    .withMessage('Invalid category'),

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be in valid ISO format'),

  body('paymentMethod')
    .optional()
    .isIn(['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'])
    .withMessage('Invalid payment method'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Each tag cannot exceed 20 characters')
    .trim(),

  body('notes')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 200 })
    .withMessage('Notes cannot exceed 200 characters'),

  body('goalId')
    .optional()
    .isMongoId()
    .withMessage('Goal ID must be a valid MongoDB ObjectId'),

  handleValidationErrors
];

// Validation for updating a transaction
const validateTransactionUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Transaction ID must be a valid MongoDB ObjectId'),

  body('description')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Description must be between 1 and 100 characters')
    .trim(),

  body('amount')
    .optional()
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (value === 0) {
        throw new Error('Amount cannot be zero');
      }
      return true;
    }),

  body('type')
    .optional()
    .isIn(['Income', 'Expense'])
    .withMessage('Type must be either Income or Expense'),

  body('category')
    .optional()
    .isIn([
      'Salary', 'Freelance', 'Bonus', 'Investment', 'Other Income',
      'Food', 'Transportation', 'Shopping', 'Entertainment', 'Utilities',
      'Healthcare', 'Education', 'Travel', 'Insurance', 'Rent', 'Other Expense'
    ])
    .withMessage('Invalid category'),

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be in valid ISO format'),

  body('paymentMethod')
    .optional()
    .isIn(['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'])
    .withMessage('Invalid payment method'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 20 })
    .withMessage('Each tag cannot exceed 20 characters'),

  body('notes')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 200 })
    .withMessage('Notes cannot exceed 200 characters'),

  body('goalId')
    .optional()
    .isMongoId()
    .withMessage('Goal ID must be a valid MongoDB ObjectId'),

  handleValidationErrors
];

// Validation for bulk delete
const validateBulkDelete = [
  body('transactionIds')
    .isArray({ min: 1 })
    .withMessage('Transaction IDs must be a non-empty array'),

  body('transactionIds.*')
    .isMongoId()
    .withMessage('Each transaction ID must be a valid MongoDB ObjectId'),

  handleValidationErrors
];

// Validation for recurring transaction setup
const validateRecurringSetup = [
  param('id')
    .isMongoId()
    .withMessage('Transaction ID must be a valid MongoDB ObjectId'),

  body('frequency')
    .notEmpty()
    .withMessage('Frequency is required')
    .isIn(['Daily', 'Weekly', 'Monthly', 'Yearly'])
    .withMessage('Frequency must be Daily, Weekly, Monthly, or Yearly'),

  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in valid ISO format')
    .custom((value, { req }) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('End date must be in the future');
      }
      return true;
    }),

  handleValidationErrors
];

// Validation for query parameters
const validateTransactionQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('type')
    .optional()
    .isIn(['Income', 'Expense'])
    .withMessage('Type must be either Income or Expense'),

  query('category')
    .optional()
    .isIn([
      'Salary', 'Freelance', 'Bonus', 'Investment', 'Other Income',
      'Food', 'Transportation', 'Shopping', 'Entertainment', 'Utilities',
      'Healthcare', 'Education', 'Travel', 'Insurance', 'Rent', 'Other Expense'
    ])
    .withMessage('Invalid category'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in valid ISO format'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in valid ISO format'),

  query('paymentMethod')
    .optional()
    .isIn(['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'])
    .withMessage('Invalid payment method'),

  query('sortBy')
    .optional()
    .isIn(['date', 'amount', 'description', 'category'])
    .withMessage('Sort by must be date, amount, description, or category'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),

  handleValidationErrors
];

// Validation for monthly summary parameters
const validateMonthlySummary = [
  param('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),

  param('year')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Year must be between 2000 and 2100'),

  handleValidationErrors
];

// Validation for category analysis
const validateCategoryAnalysis = [
  handleValidationErrors
];


// Validation for bulk insert (PDF / CSV / Excel import)
const validateBulkInsert = [
  body('transactions')
    .isArray({ min: 1 })
    .withMessage('transactions must be a non-empty array'),

  body('transactions.*.description')
    .notEmpty()
    .withMessage('Each transaction must have a description')
    .isLength({ min: 1, max: 100 })
    .withMessage('Description must be between 1 and 100 characters')
    .trim(),

  body('transactions.*.amount')
    .notEmpty()
    .withMessage('Each transaction must have an amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (Number(value) === 0) throw new Error('Amount cannot be zero');
      return true;
    }),

  body('transactions.*.type')
    .notEmpty()
    .withMessage('Each transaction must have a type')
    .isIn(['Income', 'Expense'])
    .withMessage('Type must be Income or Expense'),

  body('transactions.*.category')
    .notEmpty()
    .withMessage('Each transaction must have a category')
    .isIn([
      'Salary', 'Freelance', 'Bonus', 'Investment', 'Other Income',
      'Food', 'Transportation', 'Shopping', 'Entertainment', 'Utilities',
      'Healthcare', 'Education', 'Travel', 'Insurance', 'Rent', 'Other Expense'
    ])
    .withMessage('Invalid category'),

  body('transactions.*.date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date string'),

  body('transactions.*.paymentMethod')
    .optional()
    .isIn(['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'])
    .withMessage('Invalid payment method'),

  handleValidationErrors
];

module.exports = {
  validateTransactionCreate,
  validateTransactionUpdate,
  validateBulkDelete,
  validateBulkInsert,
  validateRecurringSetup,
  validateTransactionQuery,
  validateMonthlySummary,
  validateCategoryAnalysis,
  handleValidationErrors
};
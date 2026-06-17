// middleware/analytics.js
const { body, query, param, validationResult } = require('express-validator');
const { AppError } = require('../utils/errorHandler');
const { checkRateLimit } = require('./rateLimiter');
const { cacheResult, getCachedResult } = require('../utils/cacheUtils');

// Validation middleware
const validateAnalyticsQuery = [
  query('period')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .withMessage('Period must be one of: daily, weekly, monthly, quarterly, yearly'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors
];

const validatePeriodParameter = [
  query('period')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .withMessage('Period must be one of: daily, weekly, monthly, quarterly, yearly'),
  handleValidationErrors
];

const validateMetricParameter = [
  query('metric')
    .optional()
    .isIn(['amount', 'count', 'average', 'percentage'])
    .withMessage('Metric must be one of: amount, count, average, percentage'),
  handleValidationErrors
];

const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (value && req.query.endDate) {
        const start = new Date(value);
        const end = new Date(req.query.endDate);
        if (start >= end) {
          throw new Error('Start date must be before end date');
        }
        // Check for reasonable date range (max 2 years)
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 730) {
          throw new Error('Date range cannot exceed 2 years');
        }
      }
      return true;
    }),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors
];

const validateComparisonPeriod = [
  query('currentStartDate')
    .isISO8601()
    .withMessage('Current start date is required and must be valid'),
  query('currentEndDate')
    .isISO8601()
    .withMessage('Current end date is required and must be valid'),
  query('compareStartDate')
    .isISO8601()
    .withMessage('Compare start date is required and must be valid'),
  query('compareEndDate')
    .isISO8601()
    .withMessage('Compare end date is required and must be valid'),
  query('metrics')
    .optional()
    .isArray()
    .withMessage('Metrics must be an array'),
  handleValidationErrors
];

const validateChartType = [
  param('chartType')
    .isIn(['line', 'bar', 'pie', 'doughnut', 'area', 'scatter', 'heatmap'])
    .withMessage('Invalid chart type'),
  query('granularity')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .withMessage('Invalid granularity'),
  handleValidationErrors
];

const validateExportFormat = [
  param('format')
    .isIn(['csv', 'xlsx', 'pdf', 'json'])
    .withMessage('Export format must be one of: csv, xlsx, pdf, json'),
  handleValidationErrors
];

const validateCustomMetrics = [
  body('name')
    .notEmpty()
    .withMessage('Custom analytics name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('metrics')
    .isArray({ min: 1 })
    .withMessage('At least one metric is required'),
  body('metrics.*.type')
    .isIn(['sum', 'avg', 'count', 'max', 'min', 'percentage'])
    .withMessage('Invalid metric type'),
  body('metrics.*.field')
    .notEmpty()
    .withMessage('Metric field is required'),
  body('dateRange')
    .optional()
    .isObject()
    .withMessage('Date range must be an object'),
  body('filters')
    .optional()
    .isArray()
    .withMessage('Filters must be an array'),
  handleValidationErrors
];

// Error handling middleware
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return next(new AppError(`Validation error: ${errorMessages.join(', ')}`, 400));
  }
  next();
}

// Data sanitization middleware
const sanitizeAnalyticsData = (req, res, next) => {
  // Sanitize query parameters
  if (req.query.startDate) {
    req.query.startDate = new Date(req.query.startDate).toISOString();
  }
  if (req.query.endDate) {
    req.query.endDate = new Date(req.query.endDate).toISOString();
  }
  
  // Ensure numeric parameters are properly converted
  if (req.query.limit) {
    req.query.limit = Math.min(parseInt(req.query.limit) || 10, 100);
  }
  if (req.query.months) {
    req.query.months = Math.min(parseInt(req.query.months) || 6, 24);
  }

  // Sanitize boolean parameters
  ['includeProjections', 'includeSubcategories'].forEach(param => {
    if (req.query[param] !== undefined) {
      req.query[param] = req.query[param] === 'true';
    }
  });

  next();
};

// Activity logging middleware
const logAnalyticsActivity = (activityType) => {
  return async (req, res, next) => {
    try {
      // Log the analytics request for audit purposes
      const logData = {
        userId: req.user ? req.user.id : (req.userId || 'anonymous'),
        activityType,
        endpoint: req.originalUrl,
        method: req.method,
        query: req.query,
        body: req.method === 'POST' ? req.body : undefined,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };

      // Store in analytics log (you might want to use a separate logging service)
      // await AnalyticsLog.create(logData);
      
      // Add to request for potential use in response
      req.analyticsLog = logData;
      
      next();
    } catch (error) {
      // Don't fail the request if logging fails
      console.error('Analytics logging failed:', error);
      next();
    }
  };
};

// Rate limiting for analytics endpoints
const checkAnalyticsLimits = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : (req.userId || 'anonymous');
    const key = `analytics_limit_${userId}`;
    
    // Check rate limit (e.g., 100 requests per hour)
    const limitResult = checkRateLimit(key, { windowMs: 3600 * 1000, max: 100 });
    
    if (!limitResult.allowed) {
      return next(new AppError('Analytics rate limit exceeded. Please try again later.', 429));
    }

    // Check for premium features if applicable
    if (req.path.includes('/custom') || req.path.includes('/export')) {
      const userPlan = req.user.plan || 'basic';
      if (userPlan === 'basic') {
        return next(new AppError('Premium feature. Upgrade your plan to access custom analytics.', 403));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Add computed fields to request
const addAnalyticsComputedFields = (req, res, next) => {
  // Add default date range if not provided
  if (!req.query.startDate || !req.query.endDate) {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (req.query.period) {
      case 'weekly':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'quarterly':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case 'yearly':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30); // Default to 30 days
    }
    
    if (!req.query.startDate) req.query.startDate = startDate.toISOString();
    if (!req.query.endDate) req.query.endDate = endDate.toISOString();
  }

  // Add timezone handling
  req.userTimezone = req.headers['x-timezone'] || 'UTC';
  
  // Add analytics context
  req.analyticsContext = {
    requestId: `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    userPlan: req.user.plan || 'basic',
    features: {
      customAnalytics: req.user.plan !== 'basic',
      exportData: req.user.plan !== 'basic',
      realTimeData: req.user.plan === 'premium'
    }
  };

  next();
};

// Performance monitoring middleware
const monitorAnalyticsPerformance = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.json to capture response time
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log slow queries (> 5 seconds)
    if (responseTime > 5000) {
      console.warn(`Slow analytics query detected: ${req.originalUrl} took ${responseTime}ms`);
    }
    
    // Add performance metrics to response headers
    res.set('X-Response-Time', `${responseTime}ms`);
    res.set('X-Request-ID', req.analyticsContext?.requestId);
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Cache middleware for analytics
const cacheAnalyticsResponse = (cacheTTL = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const userId = req.user ? (req.user.id || req.user._id) : (req.userId || 'anonymous');
    const cacheKey = `analytics_${userId}_${req.originalUrl}_${JSON.stringify(req.query)}`;
    
    try {
      // Try to get cached result
      const cachedResult = await getCachedResult(cacheKey);
      if (cachedResult) {
        return res.status(200).json({
          success: true,
          data: cachedResult,
          message: 'Analytics retrieved successfully',
          cached: true,
          timestamp: new Date()
        });
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache successful responses
        if (res.statusCode === 200 && data.success) {
          cacheResult(cacheKey, data.data, cacheTTL).catch(console.error);
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      // Don't fail request if caching fails
      console.error('Analytics caching error:', error);
      next();
    }
  };
};

module.exports = {
  validateAnalyticsQuery,
  validatePeriodParameter,
  validateMetricParameter,
  validateDateRange,
  validateComparisonPeriod,
  validateChartType,
  validateExportFormat,
  validateCustomMetrics,
  handleValidationErrors,
  sanitizeAnalyticsData,
  logAnalyticsActivity,
  checkAnalyticsLimits,
  addAnalyticsComputedFields,
  monitorAnalyticsPerformance,
  cacheAnalyticsResponse
};
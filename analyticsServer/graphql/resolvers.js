const AnalyticsService = require('../services/analyticsService');
const PdfReportService = require('../services/pdfReportService');
const { GraphQLError } = require('graphql');
const fs = require('fs');
const path = require('path');
const os = require('os');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Budget = require('../models/Budget');
const ReportComputationService = require('../services/reportComputationService');

/**
 * Error Handler for GraphQL Resolvers
 * Wraps errors in structured GraphQL errors and logs internally
 */
const handleResolverError = (error, context = {}) => {
  const errorCode = error.extensions?.code || error.code || 'ANALYTICS_ERROR';
  const errorMessage = error.message || 'An unexpected error occurred';
  
  console.error(`[${errorCode}] ${errorMessage}`, {
    userId: context.userId,
    timestamp: new Date().toISOString(),
    stack: error.stack
  });

  // Return safe error message to client
  throw new GraphQLError(errorMessage, {
    extensions: {
      code: errorCode,
      timestamp: new Date().toISOString()
    }
  });
};

const resolvers = {
  Query: {
    dashboard: async (_, { startDate, endDate }, context) => {
      try {
        // Authentication check
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        // Validate date inputs
        if (!startDate || !endDate) {
          throw new GraphQLError('Invalid date range provided', {
            extensions: { code: 'INVALID_INPUT' }
          });
        }

        return await AnalyticsService.getDashboardData(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },
    
    spendingTrends: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getSpendingTrends(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    categoryAnalysis: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getCategoryAnalysis(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    goalsProgress: async (_, __, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getGoalsProgress(context.user.id);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    incomeTrends: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getIncomeTrends(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    savingsTrends: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getSavingsTrends(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    transactionInsights: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getTransactionInsights(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    budgetPerformance: async (_, { startDate, endDate }, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getBudgetPerformance(context.user.id, startDate, endDate);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    },

    currentMonthAnalytics: async (_, __, context) => {
      try {
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }
        return await AnalyticsService.getCurrentMonthAnalytics(context.user.id);
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    }
  },

  Mutation: {
    generateFinancialReport: async (_, { startDate, endDate, currencySymbol }, context) => {
      try {
        // Authentication and validation
        if (!context.user) {
          throw new GraphQLError('Unauthorized: User not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        if (!startDate || !endDate) {
          throw new GraphQLError('Invalid date range for report generation', {
            extensions: { code: 'INVALID_INPUT' }
          });
        }

        console.log(`📄 Generating report for user ${context.user.id} from ${startDate} to ${endDate}`);

        // Convert strings to safe Dates
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Compute months for budget query
        const startMonth = start.getMonth() + 1;
        const startYear  = start.getFullYear();
        const endMonth   = end.getMonth() + 1;
        const endYear    = end.getFullYear();
        const monthYearConditions = [];
        let y = startYear, m = startMonth;
        while (y < endYear || (y === endYear && m <= endMonth)) {
          monthYearConditions.push({ month: m, year: y });
          m++;
          if (m > 12) { m = 1; y++; }
        }

        const now = new Date();
        const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const minStart = start < curStart ? start : curStart;
        const maxEnd = end > curEnd ? end : curEnd;

        // Fetch all raw data once
        const [transactions, goals, budgetDocs] = await Promise.all([
          Transaction.find({
            userId: context.user.id,
            date: { $gte: minStart, $lte: maxEnd }
          }).lean(),
          Goal.find({ userId: context.user.id }).lean(),
          monthYearConditions.length > 0 ? Budget.find({
            userId: context.user.id,
            $or: monthYearConditions
          }).lean() : Promise.resolve([])
        ]);

        // Pass to pure computation service
        const analyticsData = ReportComputationService.generateReportData(
          transactions,
          goals,
          budgetDocs,
          startDate,
          endDate
        );

        // Use the generated analyticsData

        const dateRange = { startDate, endDate };
        // Fetch user from DB to get name (since JWT only has email/id)
        const dbUser = await User.findById(context.user.id);
        const userInfo = { name: dbUser?.username || dbUser?.email || context.user.email, email: context.user.email };
        const baseFileName = `Financial_Report_${context.user.id}_${Date.now()}.pdf`;
        const tempFilePath = path.join(os.tmpdir(), baseFileName);

        try {
          const result = await PdfReportService.generateFinancialReport(
            analyticsData,
            dateRange,
            userInfo,
            tempFilePath,
            currencySymbol
          );
          console.log(`✅ Report generated: ${result.fileName}`);

          // Schedule cleanup of the temp file after 5 seconds
          setTimeout(() => {
            fs.unlink(result.filePath, (err) => {
              if (err && err.code !== 'ENOENT') console.error('Failed to clean up PDF:', err);
            });
          }, 5000);

          return {
            success: result.success,
            message: result.message,
            fileName: result.fileName,
            filePath: result.filePath
          };
        } catch (error) {
          throw new GraphQLError('PDF generation failed', {
            extensions: { code: 'PDF_GENERATION_ERROR', originalError: error.message }
          });
        }
      } catch (error) {
        handleResolverError(error, { userId: context.user?.id });
      }
    }
  }
};

module.exports = resolvers;
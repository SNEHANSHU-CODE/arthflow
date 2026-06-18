const AnalyticsService = require('../services/analyticsService');
const PdfReportService = require('../services/pdfReportService');
const { GraphQLError } = require('graphql');
const fs = require('fs');
const User = require('../models/User');

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

        // Fetch all analytics data for the report (batch query - avoids N+1)
        const [
          dashboard,
          spendingTrends,
          categoryAnalysis,
          goalsProgress,
          incomeTrends,
          savingsTrends,
          transactionInsights,
          budgetPerformance,
          currentMonthAnalytics
        ] = await Promise.all([
          AnalyticsService.getDashboardData(context.user.id, startDate, endDate),
          AnalyticsService.getSpendingTrends(context.user.id, startDate, endDate),
          AnalyticsService.getCategoryAnalysis(context.user.id, startDate, endDate),
          AnalyticsService.getGoalsProgress(context.user.id),
          AnalyticsService.getIncomeTrends(context.user.id, startDate, endDate),
          AnalyticsService.getSavingsTrends(context.user.id, startDate, endDate),
          AnalyticsService.getTransactionInsights(context.user.id, startDate, endDate),
          AnalyticsService.getBudgetPerformance(context.user.id, startDate, endDate),
          AnalyticsService.getCurrentMonthAnalytics(context.user.id)
        ]).catch(error => {
          throw new GraphQLError('Failed to fetch analytics data for report', {
            extensions: { code: 'DATA_FETCH_ERROR', originalError: error.message }
          });
        });

        const analyticsData = {
          dashboard,
          spendingTrends,
          categoryAnalysis,
          goalsProgress,
          incomeTrends,
          savingsTrends,
          transactionInsights,
          budgetPerformance,
          currentMonthAnalytics
        };

        const dateRange = { startDate, endDate };
        // Fetch user from DB to get name (since JWT only has email/id)
        const dbUser = await User.findById(context.user.id);
        const userInfo = { name: dbUser?.username || dbUser?.email || context.user.email, email: context.user.email };
        const fileName = `Financial_Report_${context.user.id}_${Date.now()}.pdf`;

        try {
          const result = await PdfReportService.generateFinancialReport(
            analyticsData,
            dateRange,
            userInfo,
            fileName,
            currencySymbol
          );
          console.log(`✅ Report generated: ${result.fileName}`);

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
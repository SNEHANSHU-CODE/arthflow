import { useQuery } from '@apollo/client';
import { GET_ALL_ANALYTICS } from '../graphql/analyticsQueries';
import { useCallback, useEffect, useMemo } from 'react';

/**
 * Custom hook to fetch all analytics data in a single GraphQL query
 * IMPORTANT: Uses 'network-only' fetch policy to always get fresh data
 * This prevents stale cache issues and ensures analytics are current
 */
export const useAllAnalyticsData = (startDate, endDate, options = {}) => {
  const { 
    skip = false,
    pollInterval = 0,
    // Override the default fetchPolicy if not specified - use network-only for fresh data
    fetchPolicy = options.fetchPolicy || 'network-only',
    onCompleted = null,
    onError = null
  } = options;

  const { data, loading, error, refetch, fetchMore } = useQuery(GET_ALL_ANALYTICS, {
    variables: {
      startDate,
      endDate,
    },
    skip,
    pollInterval,
    fetchPolicy, // Ensures fresh data on every query (no stale cache)
    errorPolicy: 'all', // Return partial data on error for better UX
    onCompleted: (resultData) => {
      onCompleted?.(resultData);
    },
    onError: (queryError) => {
      onError?.(queryError);
    }
  });

  // Parse and normalize the data with null-safe defaults
  const analytics = useMemo(() => {
    if (!data) return null;

    return {
      dashboard: data.dashboard || {
        monthly: {
          summary: { totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0 }
        },
        recent: []
      },
      spendingTrends: data.spendingTrends || { trends: [], averageMonthlySpending: 0 },
      categoryAnalysis: data.categoryAnalysis || { categories: [], totalAmount: 0 },
      goalsProgress: data.goalsProgress || { goals: [], summary: { totalGoals: 0, onTrackGoals: 0 } },
      incomeTrends: data.incomeTrends || { trends: [], averageMonthlyIncome: 0 },
      savingsTrends: data.savingsTrends || { trends: [], averageMonthlySavings: 0 },
      transactionInsights: data.transactionInsights || { insights: [] },
      budgetPerformance: data.budgetPerformance || { performance: [] },
      currentMonthAnalytics: data.currentMonthAnalytics || {},
    };
  }, [data]);

  return {
    analytics,
    loading,
    error,
    refetch,
    fetchMore,
    data
  };
};

/**
 * Hook to fetch individual analytics data
 * Use this for specific data queries without fetching everything
 */
export const useDashboardData = (startDate, endDate, options = {}) => {
  const { skip = false, ...rest } = options;
  
  const { data, loading, error, refetch } = useQuery(GET_ALL_ANALYTICS, {
    variables: { startDate, endDate },
    skip,
    ...rest
  });

  return {
    dashboard: data?.dashboard,
    loading,
    error,
    refetch
  };
};

export const useGoalsProgress = (options = {}) => {
  const { skip = false, ...rest } = options;
  
  const { data, loading, error, refetch } = useQuery(GET_ALL_ANALYTICS, {
    variables: {
      startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    },
    skip,
    ...rest
  });

  return {
    goalsProgress: data?.goalsProgress,
    loading,
    error,
    refetch
  };
};

export const useSpendingAnalysis = (startDate, endDate, options = {}) => {
  const { skip = false, ...rest } = options;
  
  const { data, loading, error, refetch } = useQuery(GET_ALL_ANALYTICS, {
    variables: { startDate, endDate },
    skip,
    ...rest
  });

  return {
    spendingTrends: data?.spendingTrends,
    categoryAnalysis: data?.categoryAnalysis,
    loading,
    error,
    refetch
  };
};

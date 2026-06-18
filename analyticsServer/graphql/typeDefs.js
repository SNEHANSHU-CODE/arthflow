const typeDefs = `#graphql
  type Summary {
    totalIncome: Float
    totalExpenses: Float
    netSavings: Float
    savingsRate: Float
  }

  type MonthlyData {
    summary: Summary
  }

  type Transaction {
    id: ID
    description: String
    category: String
    date: String
    amount: Float
    type: String
  }

  type DashboardData {
    monthly: MonthlyData
    recent: [Transaction]
    generatedAt: String
  }

  type TrendPoint {
    monthYear: String
    totalIncome: Float
    totalExpenses: Float
    netSavings: Float
  }

  type SpendingTrends {
    trends: [TrendPoint]
    averageMonthlySpending: Float
    totalSpending: Float
    period: String
  }

  type CategoryItem {
    category: String
    amount: Float
    percentage: Float
  }

  type CategoryAnalysis {
    categories: [CategoryItem]
    totalAmount: Float
    period: String
  }

  type Goal {
    id: ID
    name: String
    progress: Float
    savedAmount: Float
    targetAmount: Float
    deadline: String
    status: String
    isOverdue: Boolean
  }

  type GoalSummary {
    totalGoals: Int
    onTrackGoals: Int
    overdueGoals: Int
    averageProgress: Float
  }

  type GoalsProgress {
    goals: [Goal]
    summary: GoalSummary
  }

  type IncomeTrends {
    trends: [TrendPoint]
    averageMonthlyIncome: Float
  }

  type SavingsTrendPoint {
    monthYear: String
    savings: Float
    savingsRate: Float
  }

  type BestMonth {
    month: String
    amount: Float
  }

  type SavingsTrends {
    trends: [SavingsTrendPoint]
    averageMonthlySavings: Float
    totalSavings: Float
    bestMonth: BestMonth
    period: String
  }

  type TransactionSummary {
    amount: Float
    description: String
    date: String
  }

  type TransactionInsights {
    period: String
    totalTransactions: Int
    dailyAverage: Float
    maxTransaction: TransactionSummary
    minTransaction: TransactionSummary
    averagePerDay: Float
    mostUsedPaymentMethod: String
    topCategory: String
  }

  type BudgetCategory {
    category: String
    budgeted: Float
    spent: Float
    remaining: Float
    percentageUsed: Float
    status: String
  }

  type BudgetPerformance {
    message: String
    categories: [BudgetCategory]
    overallPerformance: String
    recommendations: [String]
  }

  type CategoryBreakdown {
    category: String
    amount: Float
    percentage: Float
  }

  type CurrentMonthAnalytics {
    year: Int
    month: Int
    summary: Summary
    categoryBreakdown: [CategoryBreakdown]
  }

  # The "Query" type defines the entry points (what the frontend calls)
  type Query {
    dashboard(startDate: String!, endDate: String!): DashboardData
    spendingTrends(startDate: String!, endDate: String!): SpendingTrends
    categoryAnalysis(startDate: String!, endDate: String!): CategoryAnalysis
    goalsProgress: GoalsProgress
    incomeTrends(startDate: String!, endDate: String!): IncomeTrends
    savingsTrends(startDate: String!, endDate: String!): SavingsTrends
    transactionInsights(startDate: String!, endDate: String!): TransactionInsights
    budgetPerformance(startDate: String!, endDate: String!): BudgetPerformance
    currentMonthAnalytics: CurrentMonthAnalytics
  }

  # PDF Report Types
  type PdfReportResponse {
    success: Boolean!
    message: String!
    fileName: String
    filePath: String
  }

  type Mutation {
    generateFinancialReport(
      startDate: String!
      endDate: String!
      currencySymbol: String
    ): PdfReportResponse
  }
`;

module.exports = typeDefs;
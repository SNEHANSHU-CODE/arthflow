const mongoose = require('mongoose');

class ReportComputationService {
  static generateReportData(transactions, goals, budgetDocs, startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.max(1, Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / msPerDay));

    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryTotals = {};
    const monthlyGroups = {};

    // Group dynamically
    let groupKeyFn;
    if (diffDays <= 35) {
      groupKeyFn = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (diffDays <= 95) {
      // rough week
      groupKeyFn = (d) => {
        const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d2 - yearStart) / msPerDay) + 1) / 7);
        return `${d.getFullYear()} W${String(weekNo).padStart(2, '0')}`;
      };
    } else {
      groupKeyFn = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    transactions.forEach(t => {
      const isIncome = t.type === 'income' || t.type === 'Income';
      const isExpense = t.type === 'expense' || t.type === 'Expense';
      const amt = Math.abs(t.amount);
      const cat = t.category || 'Uncategorized';
      const d = new Date(t.date);
      const groupKey = groupKeyFn(d);

      if (!monthlyGroups[groupKey]) {
        monthlyGroups[groupKey] = { income: 0, expenses: 0 };
      }

      if (isIncome) {
        totalIncome += amt;
        monthlyGroups[groupKey].income += amt;
      } else if (isExpense) {
        totalExpenses += amt;
        monthlyGroups[groupKey].expenses += amt;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      }
    });

    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // Dashboard
    const dashboard = {
      monthly: {
        summary: {
          totalIncome: parseFloat(totalIncome.toFixed(2)),
          totalExpenses: parseFloat(totalExpenses.toFixed(2)),
          netSavings: parseFloat(netSavings.toFixed(2)),
          savingsRate: parseFloat(savingsRate.toFixed(2))
        }
      },
      recent: transactions.slice(0, 10).map(t => ({
        id: t._id ? t._id.toString() : '',
        description: t.description || t.category,
        category: t.category,
        date: new Date(t.date).toISOString().split('T')[0],
        amount: t.amount,
        type: t.type
      })),
      generatedAt: new Date().toISOString()
    };

    // Trends
    const trends = Object.keys(monthlyGroups).sort().map(key => {
      const inc = monthlyGroups[key].income;
      const exp = monthlyGroups[key].expenses;
      return {
        monthYear: key,
        totalIncome: parseFloat(inc.toFixed(2)),
        totalExpenses: parseFloat(exp.toFixed(2)),
        netSavings: parseFloat((inc - exp).toFixed(2)),
        savings: parseFloat((inc - exp).toFixed(2)),
        savingsRate: inc > 0 ? parseFloat(((inc - exp) / inc * 100).toFixed(2)) : 0
      };
    });

    const spendingTrends = {
      trends,
      averageMonthlySpending: trends.length > 0 ? parseFloat((totalExpenses / trends.length).toFixed(2)) : 0,
      totalSpending: parseFloat(totalExpenses.toFixed(2)),
      period: `${startDate} to ${endDate}`
    };

    const incomeTrends = {
      trends: trends.map(t => ({ monthYear: t.monthYear, totalIncome: t.totalIncome })),
      averageMonthlyIncome: trends.length > 0 ? parseFloat((totalIncome / trends.length).toFixed(2)) : 0
    };

    const totalSavings = trends.reduce((acc, t) => acc + t.savings, 0);
    const bestMonth = trends.length > 0 ? trends.reduce((max, t) => t.savings > max.savings ? t : max) : null;
    const savingsTrends = {
      trends: trends.map(t => ({ monthYear: t.monthYear, savings: t.savings, savingsRate: t.savingsRate })),
      averageMonthlySavings: trends.length > 0 ? parseFloat((totalSavings / trends.length).toFixed(2)) : 0,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      bestMonth: bestMonth ? { month: bestMonth.monthYear, amount: bestMonth.savings } : null,
      period: `${startDate} to ${endDate}`
    };

    // Category
    const categoryAnalysis = {
      categories: Object.entries(categoryTotals)
        .map(([cat, amt]) => ({
          category: cat,
          amount: parseFloat(amt.toFixed(2)),
          percentage: totalExpenses > 0 ? parseFloat((amt / totalExpenses * 100).toFixed(2)) : 0
        })).sort((a, b) => b.amount - a.amount),
      totalAmount: parseFloat(totalExpenses.toFixed(2)),
      period: `${startDate} to ${endDate}`
    };

    // Goals
    let onTrackGoals = 0;
    let overdueGoals = 0;
    let goalsProgressSum = 0;
    const goalsFormatted = goals.map(g => {
      const progress = g.targetAmount > 0 ? (g.savedAmount / g.targetAmount) * 100 : 0;
      const isOverdue = g.deadline && new Date(g.deadline) < new Date();
      if (isOverdue) overdueGoals++;
      if (progress >= 100) onTrackGoals++;
      goalsProgressSum += progress;
      return {
        id: g._id ? g._id.toString() : '',
        name: g.name,
        progress: parseFloat(progress.toFixed(2)),
        savedAmount: parseFloat(g.savedAmount.toFixed(2)),
        targetAmount: parseFloat(g.targetAmount.toFixed(2)),
        deadline: g.deadline ? new Date(g.deadline).toISOString().split('T')[0] : null,
        status: progress >= 100 ? 'Completed' : isOverdue ? 'Overdue' : 'On Track',
        isOverdue
      };
    });
    const goalsProgress = {
      goals: goalsFormatted,
      summary: {
        totalGoals: goals.length,
        onTrackGoals,
        overdueGoals,
        averageProgress: goals.length > 0 ? parseFloat((goalsProgressSum / goals.length).toFixed(2)) : 0
      }
    };

    // Insights
    let maxTxn = null, minTxn = null;
    if (transactions.length > 0) {
      const sorted = [...transactions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      maxTxn = sorted[0];
      minTxn = sorted[sorted.length - 1];
    }
    const topCategory = categoryAnalysis.categories.length > 0 ? categoryAnalysis.categories[0].category : 'N/A';
    const transactionInsights = {
      totalTransactions: transactions.length,
      dailyAverage: parseFloat((transactions.length / diffDays).toFixed(2)),
      maxTransaction: maxTxn ? { amount: Math.abs(maxTxn.amount), description: maxTxn.description || maxTxn.category, date: new Date(maxTxn.date).toISOString().split('T')[0] } : {},
      minTransaction: minTxn ? { amount: Math.abs(minTxn.amount), description: minTxn.description || minTxn.category, date: new Date(minTxn.date).toISOString().split('T')[0] } : {},
      averagePerDay: parseFloat((transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / diffDays).toFixed(2)),
      mostUsedPaymentMethod: 'N/A',
      topCategory,
      period: `${startDate} to ${endDate}`
    };

    // Budgets
    let totalBudgetDays = 0;
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
    for (const cond of monthYearConditions) {
      totalBudgetDays += new Date(cond.year, cond.month, 0).getDate();
    }
    const prorationFactor = totalBudgetDays > 0 ? (diffDays / totalBudgetDays) : 1;
    const categoryLimitMap = {};
    for (const doc of budgetDocs) {
      for (const cat of (doc.categories || [])) {
        categoryLimitMap[cat.name] = (categoryLimitMap[cat.name] || 0) + ((cat.limit || 0) * prorationFactor);
      }
    }
    const budgetCategories = Object.entries(categoryLimitMap).map(([catName, budgeted]) => {
      const spent = categoryTotals[catName] || 0;
      const remaining = budgeted - spent;
      const percentageUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      return {
        category: catName,
        budgeted: parseFloat(budgeted.toFixed(2)),
        spent: parseFloat(spent.toFixed(2)),
        remaining: parseFloat(remaining.toFixed(2)),
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        status: percentageUsed > 100 ? 'Over Budget' : percentageUsed > 80 ? 'Warning' : 'Within Budget'
      };
    });
    const budgetPerformance = {
      message: budgetCategories.length ? 'Budget Performance Summary' : 'No budget set for this period',
      categories: budgetCategories,
      overallPerformance: budgetCategories.length > 0 && budgetCategories.every(c => c.percentageUsed <= 100) ? 'Good' : 'Needs Attention',
      recommendations: budgetCategories.filter(c => c.percentageUsed > 80).map(c => `${c.category} is at ${c.percentageUsed}% of budget`)
    };

    // Current Month Analytics
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curStart = new Date(curYear, now.getMonth(), 1);
    const curEnd = new Date(curYear, now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    let curIncome = 0;
    let curExpenses = 0;
    const curCategoryTotals = {};
    
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d >= curStart && d <= curEnd) {
        const amt = Math.abs(t.amount);
        if (t.type === 'income' || t.type === 'Income') {
          curIncome += amt;
        } else if (t.type === 'expense' || t.type === 'Expense') {
          curExpenses += amt;
          const cat = t.category || 'Uncategorized';
          curCategoryTotals[cat] = (curCategoryTotals[cat] || 0) + amt;
        }
      }
    });
    const curNetSavings = curIncome - curExpenses;
    const curSavingsRate = curIncome > 0 ? (curNetSavings / curIncome) * 100 : 0;
    const currentMonthAnalytics = {
      year: curYear,
      month: curMonth,
      summary: {
        totalIncome: parseFloat(curIncome.toFixed(2)),
        totalExpenses: parseFloat(curExpenses.toFixed(2)),
        netSavings: parseFloat(curNetSavings.toFixed(2)),
        savingsRate: parseFloat(curSavingsRate.toFixed(2))
      },
      categoryBreakdown: Object.entries(curCategoryTotals)
        .map(([cat, amt]) => ({
          category: cat,
          amount: parseFloat(amt.toFixed(2)),
          percentage: curExpenses > 0 ? parseFloat((amt / curExpenses * 100).toFixed(2)) : 0
        })).sort((a, b) => b.amount - a.amount)
    };

    return {
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
  }
}

module.exports = ReportComputationService;

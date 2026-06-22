import React, { useState, useEffect, useMemo } from 'react';
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAllAnalyticsData } from '../hooks/useAnalyticsGraphQL';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import ToastNotification from '../components/ToastNotification';
import {
  validateDashboard,
  validateSpendingTrends,
  validateCategoryAnalysis,
  validateGoalsProgress,
  getChangeValues,
  ensureAllCategories,
  isAnalyticsEmpty,
  toNumber,
} from '../utils/analyticsTransformers';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import {
  FaArrowUp,
  FaArrowDown,
  FaWallet,
  FaChartLine,
  FaCalendarAlt,
  FaDownload,
  FaCreditCard,
  FaPiggyBank,
  FaSync,
  FaBalanceScale
} from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const AnalyticsDashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('30days');
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const { showToast, toasts, removeToast } = useToast();

  const accessToken = useSelector((state) => state.auth?.accessToken);
  const { formatCurrency: formatCurrencyFromSettings, formatDate: formatDateFromSettings, isDark, getCurrencySymbol } = useSettings();

  useEffect(() => {
    const getDateRange = (period) => {
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case '30days':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    };

    setDateRange(getDateRange(selectedPeriod));
  }, [selectedPeriod]);

  const { analytics: analyticsData, loading: isLoading, error, refetch } = useAllAnalyticsData(
    dateRange.startDate,
    dateRange.endDate,
    {
      skip: !dateRange.startDate || !dateRange.endDate,
      onError: (error) => {
        console.error('Analytics fetch error:', error);
      }
    }
  );

  const validatedData = useMemo(() => {
    if (!analyticsData) {
      return {
        dashboard: validateDashboard(null),
        spendingTrends: validateSpendingTrends(null),
        categoryAnalysis: validateCategoryAnalysis(null),
        goalsProgress: validateGoalsProgress(null),
        isEmpty: true,
      };
    }
    return {
      dashboard: validateDashboard(analyticsData.dashboard),
      spendingTrends: validateSpendingTrends(analyticsData.spendingTrends),
      categoryAnalysis: validateCategoryAnalysis(analyticsData.categoryAnalysis),
      goalsProgress: validateGoalsProgress(analyticsData.goalsProgress),
      budgetPerformance: analyticsData.budgetPerformance || null,
      isEmpty: isAnalyticsEmpty(analyticsData),
    };
  }, [analyticsData]);

  const dashboardData = validatedData.dashboard;
  const spendingTrends = validatedData.spendingTrends;
  const categoryData = validatedData.categoryAnalysis;
  const goalsData = validatedData.goalsProgress;
  const budgetData = validatedData.budgetPerformance;
  const hasNoData = validatedData.isEmpty;

  const safeTrends = useMemo(() => {
    const rawTrends = (spendingTrends?.trends || []).map(item => ({
      monthYear: item.monthYear,
      totalIncome: toNumber(item.totalIncome),
      totalExpenses: Math.abs(toNumber(item.totalExpenses)), // Convert to positive
      netSavings: toNumber(item.netSavings),
    }));

    if (!dateRange.startDate || !dateRange.endDate) return rawTrends;
    
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 35) {
      const filled = [];
      let curr = new Date(start);
      while(curr <= end) {
        const label = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
        const existing = rawTrends.find(t => t.monthYear === label);
        filled.push(existing || { monthYear: label, totalIncome: 0, totalExpenses: 0, netSavings: 0 });
        curr.setDate(curr.getDate() + 1);
      }
      return filled;
    }

    return rawTrends;
  }, [spendingTrends, dateRange]);

  const safeCategories = useMemo(() => {
    return (categoryData.categories || []).map(c => ({
      category: c.category,
      amount: toNumber(c.amount),
      percentage: toNumber(c.percentage),
    }));
  }, [categoryData]);

  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD'];
  
  const chartColors = useMemo(() => ({
    grid: isDark ? '#374151' : '#f0f0f0',
    axis: isDark ? '#9CA3AF' : '#8884d8',
    tooltip: isDark ? '#1F2937' : 'white',
    tooltipBorder: isDark ? '#374151' : '#ccc',
    text: isDark ? '#E5E7EB' : '#333',
  }), [isDark]);

  const formatCurrency = (amount) => formatCurrencyFromSettings(Math.abs(toNumber(amount)));

  const getChangeColor = (value) => {
    return toNumber(value) >= 0 ? 'text-success' : 'text-danger';
  };

  const getChangeValuesFromTrends = () => {
    return getChangeValues(spendingTrends?.trends || []);
  };

  const handleRefresh = () => {
    if (refetch) {
      refetch();
    }
  };

  const handleExportPDF = async () => {
    try {
      if (!accessToken) {
        showToast('Please login to export PDF', 'warning');
        return;
      }

      const apiUrl = import.meta.env.VITE_ANALYTICS_URL
        ? `${import.meta.env.VITE_ANALYTICS_URL}/api`
        : 'http://localhost:5001/api';
      const url = `${apiUrl}/pdf/generate-report`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencySymbol: getCurrencySymbol()
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url_obj = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url_obj;
      link.download = `financial-report-${dateRange.startDate}-${dateRange.endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url_obj);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      showToast(`Failed to download report: ${error.message}`, 'error');
    }
  };

  const StatCard = ({ title, value, change, icon, color = 'primary' }) => (
    <div className="col-xl-3 col-md-6 mb-4">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col">
              <div className={`text-${color} text-uppercase mb-1 small fw-bold`}>
                {title}
              </div>
              <div className="h5 mb-0 fw-bold text-gray-800">
                {typeof value === 'number' ? formatCurrency(value) : value}
              </div>
              {change !== undefined && (
                <div className={`small ${getChangeColor(change)}`}>
                  {change >= 0 ? <FaArrowUp /> : <FaArrowDown />}
                  {' '}{Math.abs(change).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="col-auto">
              <div 
                className={`bg-${color} text-white rounded-circle p-3 d-flex align-items-center justify-content-center`}
                style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', aspectRatio: '1', flexShrink: 0 }}
              >
                {icon}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 border rounded shadow-sm" style={{
          backgroundColor: chartColors.tooltip,
          borderColor: chartColors.tooltipBorder,
          color: chartColors.text,
        }}>
          <p className="mb-2 fw-bold">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="mb-1" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const EmptyState = ({ message }) => (
    <div className="text-center py-5">
      <FaChartLine className="text-muted mb-3" size={48} />
      <h5 className="text-muted">{message || 'No data available'}</h5>
      <p className="text-muted">Add transactions to see analytics</p>
    </div>
  );

  const renderOverview = () => {
    if (hasNoData && !isLoading) {
      return <EmptyState message={'No analytics data'} />;
    }

    if (!safeTrends.length && !isLoading) {
      return <EmptyState message={'No trend data'} />;
    }

    const changeValues = getChangeValuesFromTrends();
    
    const periodLabel = selectedPeriod === '30days' ? 'Monthly'
      : selectedPeriod === '90days' ? '90-Day'
      : 'Annual';
    
    return (
      <div className="row">
        <div className="col-12 mb-4">
          <div className="row">
            <StatCard
              title={`${periodLabel} Income`}
              value={dashboardData?.monthly?.summary?.totalIncome || 0}
              change={changeValues.incomeChange}
              icon={<FaWallet />}
              color="success"
            />
            <StatCard
              title={`${periodLabel} Expenses`}
              value={dashboardData?.monthly?.summary?.totalExpenses || 0}
              change={changeValues.expenseChange}
              icon={<FaCreditCard />}
              color="danger"
            />
            <StatCard
              title={`${periodLabel} Net Savings`}
              value={dashboardData?.monthly?.summary?.netSavings || 0}
              change={changeValues.savingsChange}
              icon={<FaPiggyBank />}
              color="info"
            />
            <StatCard
              title={`${periodLabel} Savings Rate`}
              value={`${(dashboardData?.monthly?.summary?.savingsRate || 0).toFixed(1)}%`}
              change={changeValues.savingsRateChange}
              icon={<FaChartLine />}
              color="warning"
            />
          </div>
        </div>

        <div className="col-xl-8 col-lg-7 mb-4">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Financial Trends</h6>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={safeTrends} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis
                    dataKey="monthYear"
                    stroke={chartColors.axis}
                    tick={{ fontSize: 12, fill: chartColors.text }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke={chartColors.axis}
                    tick={{ fontSize: 12, fill: chartColors.text }}
                    tickFormatter={(value) => `${getCurrencySymbol()}${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="line" />
                  <Line
                    type="monotone"
                    dataKey="totalIncome"
                    stroke="#28a745"
                    strokeWidth={2}
                    dot={{ fill: '#28a745', r: 3 }}
                    activeDot={{ r: 5 }}
                    name={'Income'}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalExpenses"
                    stroke="#dc3545"
                    strokeWidth={2}
                    dot={{ fill: '#dc3545', r: 3 }}
                    activeDot={{ r: 5 }}
                    name={'Expenses'}
                  />
                  <Line
                    type="monotone"
                    dataKey="netSavings"
                    stroke="#17a2b8"
                    strokeWidth={2}
                    dot={{ fill: '#17a2b8', r: 3 }}
                    activeDot={{ r: 5 }}
                    name={'Net Savings'}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="col-xl-4 col-lg-5 mb-4">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Spending by Category</h6>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={safeCategories}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                    label={({ category, percentage }) => `${category} ${percentage.toFixed(0)}%`}
                    labelLine={true}
                  >
                    {safeCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, props) => [formatCurrency(value), props.payload.category]}
                    contentStyle={{
                      backgroundColor: chartColors.tooltip,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      color: chartColors.text
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="col-xl-8 col-lg-7 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Recent Transactions</h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="border-0">Description</th>
                      <th className="border-0">Category</th>
                      <th className="border-0">Date</th>
                      <th className="border-0 text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboardData?.recent || []).map((transaction) => (
                      <tr key={transaction.id}>
                        <td>
                          <div className="fw-bold">{transaction.description}</div>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark">
                            {transaction.category}
                          </span>
                        </td>
                        <td className="text-muted small">
                          {formatDateFromSettings(transaction.date)}
                        </td>
                        <td className={`text-end fw-bold ${transaction.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                          {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4 col-lg-5 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Goals Progress</h6>
            </div>
            <div className="card-body">
              {goalsData.goals.length === 0 ? (
                <EmptyState message={'No goals'} />
              ) : (
                goalsData.goals.map((goal, index) => (
                  <div key={index} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-bold">{goal.name}</span>
                      <span className="text-muted">{goal.progress.toFixed(1)}%</span>
                    </div>
                    <div className="progress mb-2" style={{ height: '8px' }}>
                      <div
                        className="progress-bar bg-success"
                        role="progressbar"
                        style={{ width: `${Math.min(goal.progress, 100)}%` }}
                        aria-valuenow={goal.progress}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      ></div>
                    </div>
                    <div className="d-flex justify-content-between text-muted small">
                      <span>{formatCurrency(goal.savedAmount)}</span>
                      <span>{formatCurrency(goal.targetAmount)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSpending = () => {
    if (hasNoData && !isLoading) {
    return <EmptyState message={'No analytics data'} />;
  }

  const completeCategories = safeCategories.length > 0 
    ? safeCategories 
    : ensureAllCategories(categoryData.categories);

    return (
      <div className="row">
        <div className="col-12 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Spending by Category</h6>
            </div>
            <div className="card-body">
  {completeCategories.length === 0 || completeCategories.every(c => c.amount === 0) ? (
    <EmptyState message={'No category data'} />
  ) : (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={completeCategories}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis
          dataKey="category"
          stroke={chartColors.axis}
          tick={{ fill: chartColors.text }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          stroke={chartColors.axis}
          tick={{ fill: chartColors.text }}
          tickFormatter={(value) => `${getCurrencySymbol()}${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(value) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: chartColors.tooltip,
            border: `1px solid ${chartColors.tooltipBorder}`,
            color: chartColors.text
          }}
        />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {completeCategories.map((_, index) => (
            <Cell key={`bar-cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )}
</div>
          </div>
        </div>

        <div className="col-12 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Spending Trends</h6>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={safeTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis 
                    dataKey="monthYear" 
                    stroke={chartColors.axis} 
                    tick={{ fill: chartColors.text }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke={chartColors.axis} 
                    tick={{ fill: chartColors.text }}
                    tickFormatter={(value) => `${getCurrencySymbol()}${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalExpenses"
                    stroke="#dc3545"
                    fill="#dc3545"
                    fillOpacity={0.3}
                    strokeWidth={2}
                    name={'Expenses'}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderIncome = () => (
    <div className="row">
      <div className="col-12 mb-4">
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white border-0 py-3">
            <h6 className="m-0 fw-bold text-primary">Income Trends</h6>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={safeTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis 
                  dataKey="monthYear" 
                  stroke={chartColors.axis} 
                  tick={{ fill: chartColors.text }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke={chartColors.axis} 
                  tick={{ fill: chartColors.text }}
                  tickFormatter={(value) => `${getCurrencySymbol()}${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="totalIncome"
                  stroke="#28a745"
                  fill="#28a745"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name={'Income'}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBudget = () => {
    const categories = budgetData?.categories || [];
    const message    = budgetData?.message || '';
    const overall    = budgetData?.overallPerformance || '';
    const recs       = budgetData?.recommendations || [];

    if (!budgetData || categories.length === 0) {
      return (
        <div className="text-center py-5">
          <FaBalanceScale className="text-muted mb-3" size={48} />
          <h5 className="text-muted">No Budget Data</h5>
          <p className="text-muted">Set up a budget for the selected period to see performance here.</p>
        </div>
      );
    }

    const STATUS_COLOR = { 'Within Budget': 'success', 'Warning': 'warning', 'Over Budget': 'danger' };
    const overallColor = overall === 'Excellent' ? 'success' : overall === 'Good' ? 'info' : overall === 'Warning' ? 'warning' : 'danger';

    return (
      <div className="row">
        {/* Summary header */}
        <div className="col-12 mb-3">
          <div className={`alert alert-${overallColor} d-flex justify-content-between align-items-center mb-0`}>
            <span><strong>Overall Performance:</strong> {overall}</span>
            {message && <span className="text-muted small">{message}</span>}
          </div>
        </div>

        {/* Category performance cards */}
        <div className="col-12 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary"><FaBalanceScale className="me-2" />Budget vs Actual by Category</h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Category</th>
                      <th className="text-end">Budgeted</th>
                      <th className="text-end">Spent</th>
                      <th className="text-end">Remaining</th>
                      <th className="text-end">Used</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat, i) => {
                      const pct       = cat.percentageUsed ?? 0;
                      const barColor  = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success';
                      const badgeColor = STATUS_COLOR[cat.status] || 'secondary';
                      return (
                        <tr key={i}>
                          <td className="fw-semibold">{cat.category}</td>
                          <td className="text-end">{formatCurrency(cat.budgeted ?? 0)}</td>
                          <td className={`text-end fw-bold ${pct > 100 ? 'text-danger' : ''}`}>{formatCurrency(cat.spent ?? 0)}</td>
                          <td className={`text-end ${(cat.remaining ?? 0) < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(cat.remaining ?? 0)}</td>
                          <td className="text-end" style={{ minWidth: 120 }}>
                            <div className="d-flex align-items-center gap-2 justify-content-end">
                              <div className="progress flex-grow-1" style={{ height: 6, minWidth: 60 }}>
                                <div className={`progress-bar ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span style={{ fontSize: 12 }}>{(pct).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="text-center">
                            <span className={`badge bg-${badgeColor}`}>{cat.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Bar chart: budgeted vs spent */}
        <div className="col-xl-8 mb-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Budgeted vs Spent</h6>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categories} margin={{ top: 4, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: chartColors.text }} angle={-35} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: chartColors.text }} tickFormatter={v => formatCurrency(v)} />
                  <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ backgroundColor: chartColors.tooltip, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.text }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="budgeted" name="Budgeted" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
                    {categories.map((entry, i) => (
                      <Cell key={i} fill={(entry.spent ?? 0) > (entry.budgeted ?? 0) ? '#ef4444' : '#22c55e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="col-xl-4 mb-4">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white border-0 py-3">
                <h6 className="m-0 fw-bold text-primary">Alerts & Recommendations</h6>
              </div>
              <div className="card-body">
                <ol className="ps-3 mb-0">
                  {recs.map((rec, i) => (
                    <li key={i} className="mb-2 small text-muted">{rec}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGoals = () => {
    const totalGoals = goalsData.summary.totalGoals || 0;
    const completedGoals = goalsData.goals.filter(g => g.progress >= 100).length;
    const overdueGoals = goalsData.summary.overdueGoals || 0;
    const onTrackGoals = totalGoals - completedGoals - overdueGoals;

    return (
      <div className="row">
        <div className="col-12 mb-4">
          <div className="row">
            <div className="col-md-3">
              <div className="card bg-primary text-white mb-3">
                <div className="card-body text-center">
                  <h3 className="card-title">{totalGoals}</h3>
                  <p className="card-text">Total Goals</p>
                </div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card bg-success text-white mb-3">
                <div className="card-body text-center">
                  <h3 className="card-title">{onTrackGoals}</h3>
                  <p className="card-text">On Track</p>
                </div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card bg-warning text-white mb-3">
                <div className="card-body text-center">
                  <h3 className="card-title">{overdueGoals}</h3>
                  <p className="card-text">Overdue</p>
                </div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card bg-info text-white mb-3">
                <div className="card-body text-center">
                  <h3 className="card-title">
                    {Number(goalsData?.summary?.averageProgress ?? 0).toFixed(1)}%
                  </h3>
                  <p className="card-text">Average Progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="m-0 fw-bold text-primary">Goal Details</h6>
            </div>
            <div className="card-body">
              {goalsData.goals.length === 0 ? (
                <EmptyState message={'No goals'} />
              ) : (
                <div className="row">
                  {goalsData.goals.map((goal, index) => (
                    <div key={index} className="col-md-6 mb-4">
                      <div className="card border-0 bg-light">
                        <div className="card-body">
                          <h6 className="card-title">{goal.name}</h6>
                          <div className="progress mb-3" style={{ height: '12px' }}>
                            <div
                              className="progress-bar bg-success"
                              role="progressbar"
                              style={{ width: `${Math.min(goal.progress, 100)}%` }}
                              aria-valuenow={goal.progress}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            ></div>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span className="text-muted">Progress</span>
                            <span className="fw-bold">{goal.progress.toFixed(1)}%</span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span className="text-muted">Saved</span>
                            <span className="fw-bold text-success">{formatCurrency(goal.savedAmount)}</span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span className="text-muted">Target</span>
                            <span className="fw-bold">{formatCurrency(goal.targetAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'spending':
        return renderSpending();
      case 'income':
        return renderIncome();
      case 'budget':
        return renderBudget();
      case 'goals':
        return renderGoals();
      default:
        return renderOverview();
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="container-fluid px-4">
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
              <h1 className="h3 mb-0 text-gray-800">Analytics Dashboard</h1>
              <p className="text-muted mb-0">Track your financial performance and trends</p>
            </div>
            <div className="d-flex flex-column flex-sm-row gap-2 w-100 w-md-auto" style={{ maxWidth: '400px' }}>
              <div className="dropdown">
                <button
                  className="btn btn-outline-primary dropdown-toggle w-100 w-sm-auto"
                  type="button"
                  id="periodDropdown"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <FaCalendarAlt className="me-2" />
                  <span className="d-none d-sm-inline">
                    {selectedPeriod === '30days' ? 'Last 30 Days' :
                      selectedPeriod === '90days' ? 'Last 90 Days' :
                        selectedPeriod === '1year' ? 'Last Year' : 'Last 30 Days'}
                  </span>
                  <span className="d-inline d-sm-none">
                    {selectedPeriod === '30days' ? '30D' :
                      selectedPeriod === '90days' ? '90D' :
                        selectedPeriod === '1year' ? '1Y' : '30D'}
                  </span>
                </button>
                <ul className="dropdown-menu" aria-labelledby="periodDropdown">
                  <li><Link className="dropdown-item" to="#" onClick={() => setSelectedPeriod('30days')}>Last 30 Days</Link></li>
                  <li><Link className="dropdown-item" to="#" onClick={() => setSelectedPeriod('90days')}>Last 90 Days</Link></li>
                  <li><Link className="dropdown-item" to="#" onClick={() => setSelectedPeriod('1year')}>Last Year</Link></li>
                </ul>
              </div>
              <button 
                className="btn btn-outline-secondary w-100 w-sm-auto"
                onClick={handleExportPDF}
              >
                <FaDownload className="me-2" />
                <span className="d-none d-sm-inline">Export</span>
              </button>
              <button className="btn btn-primary w-100 w-sm-auto" onClick={handleRefresh}>
                <FaSync className={`me-2 ${isLoading ? 'fa-spin' : ''}`} />
                <span className="d-none d-sm-inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-12">
          <ul className="nav nav-tabs">
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <FaChartLine className="me-2" />
                Overview
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'spending' ? 'active' : ''}`}
                onClick={() => setActiveTab('spending')}
              >
                <FaCreditCard className="me-2" />
                Spending
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'income' ? 'active' : ''}`}
                onClick={() => setActiveTab('income')}
              >
                <FaWallet className="me-2" />
                Income
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'budget' ? 'active' : ''}`}
                onClick={() => setActiveTab('budget')}
              >
                <FaBalanceScale className="me-2" />
                Budget
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'goals' ? 'active' : ''}`}
                onClick={() => setActiveTab('goals')}
              >
                <FaPiggyBank className="me-2" />
                Goals
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="row">
        <div className="col-12">
          {renderTabContent()}
        </div>
      </div>
      <ToastNotification toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default AnalyticsDashboard;
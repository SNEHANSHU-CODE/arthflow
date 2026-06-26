import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { fetchBudget, createBudget, updateBudget, deleteBudget } from '../app/budgetSlice';
import { fetchTransactions } from '../app/transactionSlice';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import ToastNotification from '../components/ToastNotification';
import transactionService from '../services/transactionService';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const CATEGORY_COLORS = [
  '#6366f1','#22c55e','#f59e0b','#ef4444',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function computeSpend(transactions, month, year) {
  return transactions
    .filter(t => {
      if (t.type !== 'Expense') return false;
      const d = new Date(t.date);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    })
    .reduce((acc, t) => {
      const cat = t.category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount || 0);
      return acc;
    }, {});
}

// ─── NoBudget ─────────────────────────────────────────────────────────────────
function NoBudget({ month, year, onCreateClick }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-center">
      <div style={{ fontSize: 56 }}>📋</div>
      <h4 className="mt-3 fw-bold">No Budget for {MONTH_NAMES[month - 1]} {year}</h4>
      <p className="text-muted mb-4" style={{ maxWidth: 380 }}>
        Set category-wise spending limits to track your expenses and avoid overspending.
      </p>
      <button className="btn btn-primary px-4" onClick={onCreateClick}>
        + Create Budget
      </button>
    </div>
  );
}

// ─── BudgetCategoryCard ───────────────────────────────────────────────────────
function BudgetCategoryCard({ category, spent, color }) {
  const { formatCurrency } = useSettings();
  const { name, limit } = category;
  const remaining = limit - spent;
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const over = spent > limit;

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold" style={{ color }}>{name}</span>
          {over && (
            <span className="badge bg-danger-subtle text-danger" style={{ fontSize: 11 }}>
              Over Budget
            </span>
          )}
        </div>
        <div className="progress mb-2" style={{ height: 8, borderRadius: 4, background: '#f1f5f9' }}>
          <div
            className="progress-bar"
            style={{ width: `${pct}%`, background: over ? '#ef4444' : color, borderRadius: 4, transition: 'width 0.4s ease' }}
          />
        </div>
        <div className="d-flex justify-content-between" style={{ fontSize: 13 }}>
          <span className="text-muted">Spent: <strong className={over ? 'text-danger' : ''}>{formatCurrency(spent)}</strong></span>
          <span className="text-muted">Limit: <strong>{formatCurrency(limit)}</strong></span>
        </div>
        <div className="mt-1" style={{ fontSize: 13 }}>
          {over
            ? <span className="text-danger fw-semibold">{formatCurrency(Math.abs(remaining))} overspent</span>
            : <span className="text-success fw-semibold">{formatCurrency(remaining)} remaining</span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── UnplannedCategories ──────────────────────────────────────────────────────
function UnplannedCategories({ items }) {
  const { formatCurrency } = useSettings();
  if (!items.length) return null;
  return (
    <div className="alert alert-warning border-0 shadow-sm mt-3">
      <h6 className="fw-bold mb-2">⚠️ Unplanned Categories</h6>
      <p className="text-muted mb-2" style={{ fontSize: 13 }}>
        Spending detected in categories not included in this budget:
      </p>
      <div className="d-flex flex-wrap gap-2">
        {items.map(({ category, spent }) => (
          <span key={category} className="badge bg-warning text-dark">
            {category}: {formatCurrency(spent)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── BudgetChart ──────────────────────────────────────────────────────────────
function BudgetChart({ chartData }) {
  const { formatCurrency, getCurrencySymbol } = useSettings();
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card border-0 shadow p-2" style={{ fontSize: 13 }}>
        <p className="fw-semibold mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color, margin: 0 }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  const CustomLegend = ({ payload }) => {
    if (!payload) return null;
    return (
      <div className="d-flex justify-content-center gap-4 mt-2" style={{ fontSize: 13 }}>
        {payload.map((entry, index) => (
          <span key={`item-${index}`} className="d-flex align-items-center gap-1">
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: entry.color }} />
            {entry.value}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <h6 className="fw-bold mb-3">Budget vs Actual Spending</h6>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${getCurrencySymbol()}${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
            <Bar dataKey="limit" name="Budget" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.spent > entry.limit ? '#ef4444' : '#22c55e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── BudgetForm ───────────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  'Food', 'Transportation', 'Shopping', 'Entertainment',
  'Utilities', 'Healthcare', 'Education', 'Travel',
  'Insurance', 'Rent', 'Other Expense',
];

function BudgetForm({ existingBudget, month, year, onCancel, onSaved }) {
  const dispatch = useDispatch();
  const { getCurrencySymbol, formatCurrency } = useSettings();
  const { showToast } = useToast();
  const { loading } = useSelector(s => s.budget);

  const initialLimits = () => {
    const map = Object.fromEntries(EXPENSE_CATEGORIES.map(name => [name, '']));
    if (existingBudget?.categories) {
      existingBudget.categories.forEach(c => {
        if (map[c.name] !== undefined) map[c.name] = String(c.limit);
      });
    }
    return map;
  };

  const [limits, setLimits] = useState(initialLimits);
  const [error, setError]   = useState('');
  const [activeCats, setActiveCats] = useState(() => 
    EXPENSE_CATEGORIES.filter(name => initialLimits()[name] !== '')
  );

  const isOn     = name => activeCats.includes(name);
  const setLimit = (name, value) => setLimits(prev => ({ ...prev, [name]: value }));
  const toggle   = name => setActiveCats(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const included    = EXPENSE_CATEGORIES.filter(isOn);
  const totalBudget = included.reduce((s, n) => s + (parseFloat(limits[n]) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (included.some(n => parseFloat(limits[n]) < 0)) {
      return setError('Budget limits cannot be negative.');
    }

    const validIncluded = included.filter(n => parseFloat(limits[n]) > 0);
    if (!validIncluded.length) return setError('Select at least one category with a valid limit greater than 0.');

    const categories = validIncluded.map(name => ({ name, limit: parseFloat(limits[name]) }));
    const payload    = { month, year, categories, totalBudget: validIncluded.reduce((s, n) => s + parseFloat(limits[n]), 0) };
    const action     = existingBudget
      ? await dispatch(updateBudget({ id: existingBudget._id, data: payload }))
      : await dispatch(createBudget(payload));

    if (action.error) return setError(action.payload || 'Something went wrong.');
    onSaved();
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <h6 className="fw-bold mb-1">
          {existingBudget ? 'Edit' : 'Create'} Budget — {MONTH_NAMES[month - 1]} {year}
        </h6>
        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
          Toggle the categories you want to budget for and enter a spending limit.
        </p>
        {error && (
          <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="d-flex flex-column gap-2 mb-3">
            {EXPENSE_CATEGORIES.map(name => (
              <div
                key={name}
                className="d-flex align-items-center gap-3 px-3 py-2 rounded"
                style={{
                  background: isOn(name) ? '#f0f9ff' : '#f8fafc',
                  border: `1px solid ${isOn(name) ? '#bae6fd' : '#e2e8f0'}`,
                  transition: 'all 0.15s',
                }}
              >
                {/* Toggle */}
                <div
                  onClick={() => toggle(name)}
                  style={{
                    cursor: 'pointer', minWidth: 36, height: 20, borderRadius: 10,
                    background: isOn(name) ? '#6366f1' : '#cbd5e1',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2,
                    left: isOn(name) ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }} />
                </div>

                {/* Category name — read-only, locked to schema enum */}
                <span
                  className="fw-medium flex-grow-1"
                  style={{ fontSize: 14, color: isOn(name) ? '#1e293b' : '#94a3b8' }}
                >
                  {name}
                </span>

                {/* Limit input — only visible when toggled on */}
                {isOn(name) && (
                  <div className="d-flex align-items-center gap-1">
                    <span className="text-muted" style={{ fontSize: 13 }}>{getCurrencySymbol()}</span>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      placeholder="Limit"
                      min="1"
                      value={limits[name]}
                      onChange={e => {
                        const val = e.target.value;
                        if (val !== '' && Number(val) < 0) {
                          showToast("Budget limit cannot be less than 0", "warning");
                          return;
                        }
                        if (val === '0') {
                          toggle(name);
                        } else {
                          setLimit(name, val);
                        }
                      }}
                      style={{ width: 110, textAlign: 'right' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center pt-3 border-top">
            <div style={{ fontSize: 13 }}>
              <span className="text-muted">
                {included.length} of {EXPENSE_CATEGORIES.length} selected
              </span>
              {included.length > 0 && (
                <span className="ms-3 fw-semibold text-dark">
                  Total: {formatCurrency(totalBudget)}
                </span>
              )}
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm px-3" disabled={loading}>
                {loading ? 'Saving…' : existingBudget ? 'Update Budget' : 'Create Budget'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Budget (Main Page) ───────────────────────────────────────────────────────
export default function Budget() {
  const dispatch = useDispatch();
  const { formatCurrency } = useSettings();
  const { toasts, removeToast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [showForm, setShowForm] = useState(false);

  const { budget, loading: budgetLoading } = useSelector(s => s.budget);
  const userId = useSelector(s => s.auth.user?.userId);
  const [budgetTransactions, setBudgetTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    dispatch(fetchBudget({ month, year }));
    
    if (!userId) return;
    const fetchTx = async () => {
      setTxLoading(true);
      try {
        const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
        const endDate   = new Date(year, month, 0).toISOString().split("T")[0];
        const response = await transactionService.getTransactions({ startDate, endDate, limit: 1000, userId });
        setBudgetTransactions(response.data?.transactions || []);
      } catch (err) {
        console.error(err);
      } finally {
        setTxLoading(false);
      }
    };
    fetchTx();
  }, [dispatch, month, year, userId]);

  // Transactions are source of truth — always computed dynamically
  const spendMap = useMemo(
    () => computeSpend(budgetTransactions, month, year),
    [budgetTransactions, month, year]
  );

  const totalBudget = budget?.totalBudget || 0;
  const totalSpent  = Object.values(spendMap).reduce((a, b) => a + b, 0);
  const totalLeft   = totalBudget - totalSpent;

  const budgetNames = new Set((budget?.categories || []).map(c => c.name));
  const unplanned   = Object.entries(spendMap)
    .filter(([cat]) => !budgetNames.has(cat))
    .map(([category, spent]) => ({ category, spent }));

  const chartData = (budget?.categories || []).map(c => ({
    name: c.name, limit: c.limit, spent: spendMap[c.name] || 0,
  }));

  const loading     = budgetLoading || txLoading;
  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <div className="container-fluid py-4 px-3 px-md-4">

      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-0">Monthly Budget</h4>
          <p className="text-muted mb-0" style={{ fontSize: 13 }}>Category-wise limits vs actual spending</p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <select
            className="form-select form-select-sm"
            value={month}
            onChange={e => { setMonth(Number(e.target.value)); setShowForm(false); }}
            style={{ width: 130 }}
          >
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            className="form-select form-select-sm"
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setShowForm(false); }}
            style={{ width: 90 }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {budget && !showForm && (
            <>
              <button className="btn btn-outline-primary btn-sm me-2" onClick={() => setShowForm(true)}>
                ✏️ Edit Budget
              </button>
              <button className="btn btn-outline-danger btn-sm" onClick={() => setShowDeleteModal(true)}>
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
        </div>
      )}

      {/* No budget CTA */}
      {!loading && !budget && !showForm && (
        <NoBudget month={month} year={year} onCreateClick={() => setShowForm(true)} />
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-4">
          <BudgetForm
            existingBudget={budget}
            month={month}
            year={year}
            onCancel={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); dispatch(fetchBudget({ month, year })); }}
          />
        </div>
      )}

      {/* Dashboard */}
      {!loading && budget && !showForm && (
        <>
          <div className="row g-3 mb-4">
            {[
              { label: 'Total Budget', value: totalBudget, color: '#6366f1' },
              { label: 'Total Spent',  value: totalSpent,  color: totalSpent > totalBudget ? '#ef4444' : '#f59e0b' },
              { label: totalLeft >= 0 ? 'Remaining' : 'Overspent', value: Math.abs(totalLeft), color: totalLeft >= 0 ? '#22c55e' : '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} className="col-12 col-sm-4">
                <div className="card border-0 shadow-sm text-center py-3">
                  <div className="fw-bold fs-5" style={{ color }}>{formatCurrency(value)}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && <div className="mb-4"><BudgetChart chartData={chartData} /></div>}

          <div className="row g-3 mb-2">
            {budget.categories.map((cat, i) => (
              <div key={cat.name} className="col-12 col-sm-6 col-lg-4">
                <BudgetCategoryCard
                  category={cat}
                  spent={spendMap[cat.name] || 0}
                  color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                />
              </div>
            ))}
          </div>

          <UnplannedCategories items={unplanned} />
        </>
      )}
      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title text-danger fw-bold">Delete Budget</h5>
                <button type="button" className="btn-close" onClick={() => setShowDeleteModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="mb-0">Are you sure you want to delete this budget? This action cannot be undone.</p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={async () => {
                    const id = budget._id;
                    setShowDeleteModal(false);
                    await dispatch(deleteBudget(id));
                    showToast("Budget deleted successfully", "success");
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastNotification toasts={toasts} onClose={removeToast} />
    </div>
  );
}
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../hooks/usePreferences';
import FileImportModal from '../components/FileImportModal';

import {
  FaPlus,
  FaSearch,
  FaFilter,
  FaEdit,
  FaTrash,
  FaArrowUp,
  FaArrowDown,
  FaCalendarAlt,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaSpinner,
  FaFileImport
} from "react-icons/fa";
import {
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  setFilters,
  clearFilters,
  clearError
} from "../app/transactionSlice";

export default function Transactions() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userId = useSelector(state => state.auth.user?.userId);
  const searchTimeoutRef = useRef(null);
  const { formatCurrency, formatDate } = usePreferences();

  // Redux state
  const {
    transactions = [],
    pagination = {},
    loading,
    error,
    filters
  } = useSelector(state => state.transaction);

  // Local component state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [formError, setFormError] = useState('');
  const [localSortBy, setLocalSortBy] = useState('date');
  const [localSortOrder, setLocalSortOrder] = useState('desc');
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    type: "expense",
    category: "",
    date: new Date().toISOString().split('T')[0],
    description: ""
  });

  const categories = {
    income: ["Salary", "Freelance", "Bonus", "Investment", "Other Income"],
    expense: ["Food", "Transportation", "Shopping", "Entertainment", "Utilities", "Healthcare", "Education", "Travel", "Insurance", "Rent", "Other Expense"]
  };

  // Fetch transactions on component mount and when filters change
  useEffect(() => {
    if (userId) {
      const params = {
        userId,
        page: pagination.currentPage || 1,
        limit: pagination.itemsPerPage || 10,
        ...filters
      };
      dispatch(fetchTransactions(params));
    }
  }, [dispatch, userId, filters, pagination.currentPage, pagination.itemsPerPage]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      dispatch(clearError());
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [dispatch]);

  const handleFilterChange = (newFilters) => {
    const transformedFilters = {
      ...filters,
      ...newFilters,
      currentPage: 1
    };

    // Transform type filter to match backend expectations
    if (transformedFilters.type && transformedFilters.type !== 'all') {
      transformedFilters.type = transformedFilters.type === 'income' ? 'Income' : 'Expense';
    } else if (transformedFilters.type === 'all') {
      delete transformedFilters.type;
    }

    dispatch(setFilters(transformedFilters));

    // Explicitly fetch with new filters
    if (userId) {
      dispatch(fetchTransactions({
        userId,
        page: 1,
        limit: pagination.itemsPerPage || 10,
        ...transformedFilters
      }));
    }
  };

  // Direct search handler with timeout
  const handleSearch = (e) => {
    const searchTerm = e.target.value;

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      handleFilterChange({ searchTerm });
    }, 200);
  };

  const getSortIcon = (key) => {
    if (localSortBy !== key) return <FaSort className="text-muted" />;
    return localSortOrder === 'asc' ? <FaSortUp /> : <FaSortDown />;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.title || !formData.amount || !formData.category) {
      setFormError('Title, amount, and category are required');
      return;
    }

    const transactionData = {
      description: formData.title,
      amount: parseFloat(formData.amount),
      type: formData.type === 'income' ? 'Income' : 'Expense',
      category: formData.category,
      date: formData.date,
      notes: formData.description,
    };

    try {
      if (editingTransaction) {
        await dispatch(updateTransaction({
          id: editingTransaction._id,
          data: transactionData
        })).unwrap();
      } else {
        await dispatch(createTransaction(transactionData)).unwrap();
      }

      resetForm();

      dispatch(fetchTransactions({
        userId,
        page: pagination.currentPage,
        limit: pagination.itemsPerPage,
        ...filters
      }));
      console.log(editingTransaction ? 'Transaction updated successfully' : 'Transaction created successfully');

    } catch (error) {
      setFormError(error.message || 'Failed to save transaction');
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      amount: "",
      type: "expense",
      category: "",
      date: new Date().toISOString().split('T')[0],
      description: ""
    });
    setEditingTransaction(null);
    setShowAddModal(false);
    setFormError('');
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      title: transaction.description || "",
      amount: Math.abs(transaction.amount).toString(),
      type: transaction.type === 'Income' ? 'income' : 'expense',
      category: transaction.category || "",
      date: transaction.date ? transaction.date.split('T')[0] : "",
      description: transaction.notes || ""
    });
    setShowAddModal(true);
  };

  const handleDelete = (transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;

    try {
      await dispatch(deleteTransaction(transactionToDelete._id)).unwrap();

      // Refresh transactions after successful deletion
      dispatch(fetchTransactions({
        userId,
        page: pagination.currentPage,
        limit: pagination.itemsPerPage,
        ...filters
      }));

      // Close modal and reset state
      setShowDeleteModal(false);
      setTransactionToDelete(null);

    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setTransactionToDelete(null);
  };

  const handlePageChange = (page) => {
    dispatch(fetchTransactions({
      userId,
      page,
      limit: pagination.itemsPerPage,
      ...filters
    }));
  };

  // Display category name (capitalize first letter)
  const tCategory = (name) => {
    if (!name) return 'Uncategorized';
    return String(name)
      .charAt(0)
      .toUpperCase() + String(name).slice(1);
  };

  // Client-side sort handler
  const handleSort = (sortBy) => {
    let newSortOrder = 'desc';

    if (localSortBy === sortBy) {
      // If clicking the same column, toggle order
      newSortOrder = localSortOrder === 'asc' ? 'desc' : 'asc';
    }

    setLocalSortBy(sortBy);
    setLocalSortOrder(newSortOrder);
  };

  const clearAllFilters = () => {
    dispatch(clearFilters());
    // Reset local sort to default
    setLocalSortBy('date');
    setLocalSortOrder('desc');
  };

  // Client-side sorting of transactions
   const sortedTransactions = React.useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    
    const sorted = [...transactions].sort((a, b) => {
      let aValue, bValue;

      switch (localSortBy) {
        case 'date':
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
          break;
        case 'amount':
          // Use absolute values for comparison to sort by magnitude
          aValue = Math.abs(parseFloat(a.amount) || 0);
          bValue = Math.abs(parseFloat(b.amount) || 0);
          break;
        case 'description':
          aValue = (a.description || '').toLowerCase();
          bValue = (b.description || '').toLowerCase();
          break;
        default:
          return 0;
      }

      // Handle numeric comparison properly
      if (localSortOrder === 'asc') {
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return aValue - bValue;
        }
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return bValue - aValue;
        }
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return sorted;
  }, [transactions, localSortBy, localSortOrder]);

  return (
    <div className="container-fluid p-0">
      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {typeof error === 'string' ? error : error?.message}
          <button
            type="button"
            className="btn-close"
            onClick={() => dispatch(clearError())}
          ></button>
        </div>
      )}

      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="mb-1">Transactions</h4>
              <p className="text-muted mb-0">Manage your income and expenses</p>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary d-flex align-items-center gap-2"
                onClick={() => setShowImportModal(true)}
                disabled={loading}
              >
                <FaFileImport size={14} />
                Import
              </button>
              <button
                className="btn btn-primary d-flex align-items-center gap-2"
                onClick={() => setShowAddModal(true)}
                disabled={loading}
              >
                <FaPlus size={14} />
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-lg-4 col-md-6">
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0">
                      <FaSearch className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Search transactions"
                      value={filters.searchTerm || ''}
                      onChange={handleSearch}
                    />
                  </div>
                </div>
                <div className="col-lg-2 col-md-3 col-sm-6">
                  <select
                    className="form-select"
                    value={filters.type === 'Income' ? 'income' : filters.type === 'Expense' ? 'expense' : 'all'}
                    onChange={(e) => handleFilterChange({ type: e.target.value })}
                  >
                    <option value="all">All Types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <div className="col-lg-2 col-md-3 col-sm-6">
                  <select
                    className="form-select"
                    value={filters.category || ''}
                    onChange={(e) => handleFilterChange({ category: e.target.value })}
                  >
                    <option value="">All Categories</option>
                    {[...categories.income, ...categories.expense].map((cat, index) => (
                      <option key={`${cat}-${index}`} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="col-lg-2 col-md-3 col-sm-6">
                  <input
                    type="date"
                    className="form-control"
                    placeholder="From date"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange({ startDate: e.target.value })}
                  />
                </div>
                <div className="col-lg-2 col-md-3 col-sm-6">
                  <input
                    type="date"
                    className="form-control"
                    placeholder="To date"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange({ endDate: e.target.value })}
                  />
                </div>
                <div className="col-lg-12">
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-outline-secondary"
                      onClick={clearAllFilters}
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="row">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 py-3">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0">
                  All Transactions ({pagination.totalItems || 0})
                  {loading && <FaSpinner className="fa-spin ms-2" />}
                </h6>
                <div className="d-flex align-items-center gap-2">
                  <small className="text-muted">Sort by</small>
                  <div className="btn-group btn-group-sm">
                    <button
                      className={`btn ${localSortBy === 'date' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => handleSort('date')}
                    >
                      Date {getSortIcon('date')}
                    </button>
                    <button
                      className={`btn ${localSortBy === 'amount' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => handleSort('amount')}
                    >
                      Amount {getSortIcon('amount')}
                    </button>
                    <button
                      className={`btn ${localSortBy === 'description' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => handleSort('description')}
                    >
                      Title {getSortIcon('description')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="border-0 ps-4">Transaction</th>
                      <th className="border-0">Category</th>
                      <th className="border-0">Date</th>
                      <th className="border-0 text-end">Amount</th>
                      <th className="border-0 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransactions.map((transaction) => (
                      <tr key={transaction._id}>
                        <td className="border-0 ps-4">
                          <div className="d-flex align-items-center">
                            <div className={`p-2 rounded me-3 ${transaction.type === 'Income'
                              ? 'bg-success bg-opacity-10'
                              : 'bg-danger bg-opacity-10'
                              }`}>
                              {transaction.type === 'Income'
                                ? <FaArrowUp className="text-success" size={14} />
                                : <FaArrowDown className="text-danger" size={14} />
                              }
                            </div>
                            <div>
                              <div className="fw-medium">{transaction.description}</div>
                              <small className="text-muted text-capitalize">{transaction.type === 'Income' ? 'Income' : 'Expense'}</small>
                              {transaction.notes && (
                                <div className="small text-muted">{transaction.notes}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="border-0">
                          <span className="badge bg-light text-dark">{transaction.category}</span>
                        </td>
                        <td className="border-0 text-muted">{formatDate(transaction.date)}</td>
                        <td className={`border-0 text-end fw-medium ${transaction.amount > 0 ? 'text-success' : 'text-danger'
                          }`}>
                          {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                        </td>
                        <td className="border-0 text-center">
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => handleEdit(transaction)}
                              disabled={loading}
                            >
                              <FaEdit size={12} />
                            </button>
                            <button
                              className="btn btn-outline-danger"
                              onClick={() => handleDelete(transaction)}
                              disabled={loading}
                            >
                              <FaTrash size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && sortedTransactions.length === 0 && (
                  <div className="text-center py-5">
                    <div className="text-muted">
                      <FaSearch size={48} className="mb-3 opacity-50" />
                      <p>No transactions found</p>
                    </div>
                  </div>
                )}
                {loading && transactions.length === 0 && (
                  <div className="text-center py-5">
                    <FaSpinner className="fa-spin" size={48} />
                    <p className="mt-3 text-muted">Loading transactions</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="card-footer bg-white border-0">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                    {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                    {pagination.totalItems} entries
                  </div>
                  <nav>
                    <ul className="pagination pagination-sm mb-0">
                      <li className={`page-item ${pagination.currentPage === 1 ? 'disabled' : ''}`}>
                        <button
                          className="page-link"
                          onClick={() => handlePageChange(pagination.currentPage - 1)}
                          disabled={pagination.currentPage === 1 || loading}
                        >
                          Previous
                        </button>
                      </li>
                      {[...Array(pagination.totalPages)].map((_, index) => {
                        const page = index + 1;
                        return (
                          <li key={page} className={`page-item ${pagination.currentPage === page ? 'active' : ''}`}>
                            <button
                              className="page-link"
                              onClick={() => handlePageChange(page)}
                              disabled={loading}
                            >
                              {page}
                            </button>
                          </li>
                        );
                      })}
                      <li className={`page-item ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''}`}>
                        <button
                          className="page-link"
                          onClick={() => handlePageChange(pagination.currentPage + 1)}
                          disabled={pagination.currentPage === pagination.totalPages || loading}
                        >
                          Next
                        </button>
                      </li>
                    </ul>
                  </nav>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Transaction Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={resetForm}
                  disabled={loading}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {formError && (
                    <div className="alert alert-danger" role="alert">
                      {formError}
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Title (Required)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Amount (Required)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Type</label>
                      <select
                        className="form-select"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value, category: "" })}
                        disabled={loading}
                      >
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Category (Required)</label>
                      <select
                        className="form-select"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        required
                        disabled={loading}
                      >
                        <option value="">Select Category</option>
                        {categories[formData.type].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Date (Required)</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Description (Optional)</label>
                      <textarea
                        className="form-control"
                        rows="3"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        disabled={loading}
                      ></textarea>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading && <FaSpinner className="fa-spin me-2" />}
                    {editingTransaction ? 'Update' : 'Add'} Transaction
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {showDeleteModal && transactionToDelete && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title text-danger">
                  <FaTrash className="me-2" />
                  Delete Transaction
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={cancelDelete}
                  disabled={loading}
                ></button>
              </div>
              <div className="modal-body pt-0">
                <div className="text-center py-3">
                  <div className="mb-4">
                    <div className="bg-danger bg-opacity-10 rounded-circle d-inline-flex p-3 mb-3">
                      <FaTrash className="text-danger" size={24} />
                    </div>
                    <h6 className="mb-2">Are you sure?</h6>
                    <p className="text-muted mb-0">This action cannot be undone</p>
                  </div>

                  {/* Transaction Details Preview */}
                  <div className="card bg-light border-0">
                    <div className="card-body py-3">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center">
                          <div className={`p-2 rounded me-3 ${transactionToDelete.type === 'Income'
                            ? 'bg-success bg-opacity-10'
                            : 'bg-danger bg-opacity-10'
                            }`}>
                            {transactionToDelete.type === 'Income'
                              ? <FaArrowUp className="text-success" size={14} />
                              : <FaArrowDown className="text-danger" size={14} />
                            }
                          </div>
                          <div className="text-start">
                            <div className="fw-medium">{transactionToDelete.description}</div>
                            <small className="text-muted">{tCategory(transactionToDelete.category)}</small>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className={`fw-medium ${transactionToDelete.amount > 0 ? 'text-success' : 'text-danger'}`}>
                            {transactionToDelete.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transactionToDelete.amount))}
                          </div>
                          <small className="text-muted">{formatDate(transactionToDelete.date)}</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={cancelDelete}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDelete}
                  disabled={loading}
                >
                  {loading && <FaSpinner className="fa-spin me-2" />}
                  Delete Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* PDF / CSV / Excel Import Modal */}
      {showImportModal && (
        <FileImportModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}
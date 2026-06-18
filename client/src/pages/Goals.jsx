import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaDollarSign,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaSpinner,
  FaChartLine
} from "react-icons/fa";
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  fetchDashboardStats,
  clearError
} from "../app/goalSlice";

import { formatCurrency, formatPercent } from '../utils/formatters';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from '../components/LodingSpinner';

import goalService from "../services/goalService";
import { usePreferences } from "../hooks/usePreferences";

import {
  selectGoals,
  selectActiveGoals,
  selectCompletedGoals,
  selectGoalsLoading,
  selectGoalsError,
  selectDashboardStats,
} from '../utils/goalSelectors';

export default function Goals() {
  const dispatch = useDispatch();
  const { formatCurrency: formatCurrencyPref, formatDate: formatDatePref, getCurrencySymbol } = usePreferences();

  const auth = useSelector(state => state.auth);
  const userId = useSelector(state => state.auth.user?.userId);
  const goals = useSelector(selectGoals);
  const activeGoals = useSelector(selectActiveGoals);
  const completedGoals = useSelector(selectCompletedGoals);
  const loading = useSelector(selectGoalsLoading);
  const error = useSelector(selectGoalsError);
  const dashboardStats = useSelector(selectDashboardStats);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState(null);
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    targetAmount: "",
    targetDate: "",
    priority: "Medium",
    category: ""
  });

  const categories = ["Savings", "Travel", "Technology", "Transportation", "Education", "Health", "Home", "Other"];
  const priorityColors = {
    High: "danger",
    Medium: "warning",
    Low: "success"
  };

  useEffect(() => {
    if (showAddModal && !editingGoal) {
      const tomorrow = new Date(Date.now() + 86400000);
      setFormData(prev => ({
        ...prev,
        targetDate: tomorrow.toISOString().split('T')[0]
      }));
    }
  }, [showAddModal, editingGoal]);

  // Load data on component mount
  useEffect(() => {
    console.log('=== Goals Fetch Debug ===');
    console.log('userId:', userId);
    console.log('Auth state:', auth); // Add this to see full auth state

    if (!userId) {
      console.log('No userId available, skipping fetch');
      return;
    }

    // Clear any previous errors
    dispatch(clearError());

    const fetchData = async () => {
      try {
        await dispatch(fetchGoals()).unwrap();
        await dispatch(fetchDashboardStats()).unwrap();
      } catch (error) {
        console.error('Error object:', error);
        console.error('Error message:', error.message);

        // If it's a network error, log more details
        if (error.response) {
          console.error('Response status:', error.response);
        } else if (error.request) {
          console.error('Request made but no response:', error.request);
        }
      }
    };

    fetchData();
  }, [dispatch, userId, auth.isAuthenticated]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const getProgressPercentage = (saved, target) => {
    return goalService.getProgressPercentage(saved || 0, target || 1);
  };

  const getProgressColor = (percentage) => {
    return goalService.getProgressColor(percentage);
  };

  const getDaysRemaining = (targetDate) => {
    if (!targetDate) return 0;
    return goalService.getDaysRemaining(targetDate);
  };

  const getStatusIcon = (goal) => {
    const iconName = goalService.getStatusIcon(goal);

    switch (iconName) {
      case 'check-circle':
        return <FaCheckCircle className="text-success" />;
      case 'exclamation-triangle':
        return <FaChartLine className="text-warning" />;
      default:
        return <FaClock className="text-info" />;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.targetAmount) return;

    // Validate form data
    const validationErrors = goalService.validateGoalData(formData);
    if (validationErrors.length > 0) {
      alert(validationErrors.join('\n'));
      return;
    }

    const goalData = {
      ...formData,
      targetAmount: parseFloat(formData.targetAmount),
      userId // Ensure userId is included
    };

    try {
      if (editingGoal) {
        await dispatch(updateGoal({
          id: editingGoal._id,
          goalData
        })).unwrap();
      } else {
        console.log("Form values:", formData);
        console.log("Final goal data:", goalData);
        await dispatch(createGoal(goalData)).unwrap();
      }

      resetForm();

      // Refresh data after successful operation
      dispatch(fetchGoals());
      dispatch(fetchDashboardStats());
    } catch (error) {
      console.error('Error saving goal:', error.errors);
      // Error is already handled by Redux, just log it
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      targetAmount: "",
      targetDate: "",
      priority: "Medium",
      category: ""
    });
    setEditingGoal(null);
    setShowAddModal(false);
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name || "",
      targetAmount: goal.targetAmount ? goal.targetAmount.toString() : "",
      targetDate: goal.targetDate ? goal.targetDate.split('T')[0] : '',
      priority: goal.priority || "Medium",
      category: goal.category || ""
    });
    setShowAddModal(true);
  };

  const handleDelete = (goal) => {
    setGoalToDelete(goal);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!goalToDelete) return;

    try {
      await dispatch(deleteGoal(goalToDelete._id)).unwrap();
      dispatch(fetchDashboardStats());
      setShowDeleteModal(false);
      setGoalToDelete(null);
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const handleAddFunds = (goal) => {
    setSelectedGoal(goal);
    setAddFundsAmount("");
    setShowAddFundsModal(true);
  };

  const submitAddFunds = async (e) => {
    e.preventDefault();
    if (!addFundsAmount || parseFloat(addFundsAmount) <= 0) return;

    const amount = parseFloat(addFundsAmount);

    try {
      await dispatch(addContribution({
        goalId: selectedGoal._id,
        amount
      })).unwrap();
      dispatch(fetchDashboardStats());

      setShowAddFundsModal(false);
      setSelectedGoal(null);
      setAddFundsAmount("");
    } catch (error) {
      console.error('Error adding contribution:', error);
    }
  };

  const formatCurrency = (amount) => formatCurrencyPref(amount || 0);
  const formatDate = (dateString) => {
    if (!dateString) return 'No date set';
    return formatDatePref(dateString);
  };

  // Loading state
  if (loading && goals.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid p-0">
      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <strong>Error:</strong> {error}
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
              <h4 className="mb-1">Financial Goals</h4>
              <p className="text-muted mb-0">Track and manage your financial goals</p>
            </div>
            <button
              className="btn btn-primary d-flex align-items-center gap-2"
              onClick={() => setShowAddModal(true)}
              disabled={loading}
            >
              <FaPlus size={14} />
              Add New Goal
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-lg-3 col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="mb-3">
                <div 
                  className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10" 
                  style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, aspectRatio: '1' }}
                >
                  <FaChartLine className="text-primary" size={24} />
                </div>
              </div>
              <h5 className="fw-bold">{dashboardStats.totalGoals || 0}</h5>
              <p className="text-muted mb-0">Total Goals</p>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="mb-3">
                <div 
                  className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success bg-opacity-10" 
                  style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, aspectRatio: '1' }}
                >
                  <FaCheckCircle className="text-success" size={24} />
                </div>
              </div>
              <h5 className="fw-bold">{dashboardStats.completedGoals || 0}</h5>
              <p className="text-muted mb-0">Completed</p>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="mb-3">
                <div 
                  className="bg-info bg-opacity-10 rounded-circle d-inline-flex justify-content-center align-items-center"
                  style={{ width: 56, height: 56, minWidth: 56, minHeight: 56, aspectRatio: '1' }}
                >
                  <span className="text-info fs-4 fw-bold">{getCurrencySymbol()}</span>
                </div>
              </div>
              <h5 className="fw-bold">{formatCurrency(dashboardStats.totalSavedAmount)}</h5>
              <p className="text-muted mb-0">Total Saved</p>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="mb-3">
                <div 
                  className="bg-warning bg-opacity-10 rounded-circle d-inline-flex justify-content-center align-items-center"
                  style={{ width: 56, height: 56, minWidth: 56, minHeight: 56, aspectRatio: '1' }}
                >
                  <span className="text-warning fs-4 fw-bold">{getCurrencySymbol()}</span>
                </div>
              </div>
              <h5 className="fw-bold">{formatCurrency(dashboardStats.totalTargetAmount)}</h5>
              <p className="text-muted mb-0">Total Target</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Goals */}
      {activeGoals && activeGoals.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <h5 className="mb-3">Active Goals</h5>
            <div className="row g-3">
              {activeGoals.map((goal) => {
                const percentage = getProgressPercentage(goal.savedAmount, goal.targetAmount);
                const daysRemaining = getDaysRemaining(goal.targetDate);
                const progressColor = getProgressColor(percentage);

                return (
                  <div key={goal._id} className="col-lg-6 col-xl-4">
                    <div className="card border-0 shadow-sm h-100">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2 mb-2">
                              {getStatusIcon(goal)}
                              <h6 className="mb-0 fw-bold">{goal.name}</h6>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                              <span className={`badge bg-${priorityColors[goal.priority]} bg-opacity-10 text-${priorityColors[goal.priority]} text-capitalize`}>
                                {goal.priority}
                              </span>
                              <small className="text-muted">{goal.category}</small>
                            </div>
                          </div>
                          <div className="dropdown">
                            <button className="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                              Actions
                            </button>
                            <ul className="dropdown-menu">
                              <li>
                                <button className="dropdown-item" onClick={() => handleAddFunds(goal)}>
                                  <FaPlus className="me-2" size={12} />
                                  Add Funds
                                </button>
                              </li>
                              <li>
                                <button className="dropdown-item" onClick={() => handleEdit(goal)}>
                                  <FaEdit className="me-2" size={12} />
                                  Edit Goal
                                </button>
                              </li>
                              <li><hr className="dropdown-divider" /></li>
                              <li>
                                <button className="dropdown-item text-danger" onClick={() => handleDelete(goal)}>
                                  <FaTrash className="me-2" size={12} />
                                  Delete
                                </button>
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="text-muted">Progress</span>
                            <span className="fw-medium">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="progress" style={{ height: '8px' }}>
                            <div
                              className={`progress-bar bg-${progressColor}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="row g-2 mb-3">
                          <div className="col-6">
                            <div className="text-center p-2 bg-light rounded">
                              <div className="fw-bold text-success">{formatCurrency(goal.savedAmount || 0)}</div>
                              <small className="text-muted">Saved</small>
                            </div>
                          </div>
                          <div className="col-6">
                            <div className="text-center p-2 bg-light rounded">
                              <div className="fw-bold text-primary">{formatCurrency(goal.targetAmount)}</div>
                              <small className="text-muted">Target</small>
                            </div>
                          </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center text-sm">
                          <div className="d-flex align-items-center text-muted">
                            <FaCalendarAlt className="me-1" size={12} />
                            <small>{formatDate(goal.targetDate)}</small>
                          </div>
                          <div className={`text-${daysRemaining < 30 ? 'danger' : 'muted'}`}>
                            <small>
                              {daysRemaining > 0
                                ? `${daysRemaining} days left`
                                : daysRemaining === 0
                                  ? 'Due today'
                                  : `${Math.abs(daysRemaining)} days overdue`
                              }
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals && completedGoals.length > 0 && (
        <div className="row">
          <div className="col-12">
            <h5 className="mb-3 text-success">Completed Goals</h5>
            <div className="row g-3">
              {completedGoals.map((goal) => (
                <div key={goal._id} className="col-lg-6 col-xl-4">
                  <div className="card border-success border-opacity-25 shadow-sm h-100">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <FaCheckCircle className="text-success" />
                            <h6 className="mb-0 fw-bold">{goal.name}</h6>
                          </div>
                          <small className="text-muted">{goal.category}</small>
                        </div>
                        <div className="dropdown">
                          <button className="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                            Actions
                          </button>
                          <ul className="dropdown-menu">
                            <li>
                              <button className="dropdown-item" onClick={() => handleEdit(goal)}>
                                <FaEdit className="me-2" size={12} />
                                Edit Goal
                              </button>
                            </li>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                              <button className="dropdown-item text-danger" onClick={() => handleDelete(goal)}>
                                <FaTrash className="me-2" size={12} />
                                Delete
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="progress" style={{ height: '8px' }}>
                          <div className="progress-bar bg-success" style={{ width: '100%' }}></div>
                        </div>
                      </div>

                      <div className="text-center p-3 bg-success bg-opacity-10 rounded">
                        <div className="fw-bold text-success">{formatCurrency(goal.targetAmount)}</div>
                        <small className="text-success">Goal Achieved!</small>
                      </div>

                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <div className="d-flex align-items-center text-muted">
                          <FaCalendarAlt className="me-1" size={12} />
                          <small>Target Date: {formatDate(goal.targetDate)}</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!goals || goals.length === 0) && !loading && (
        <div className="row">
          <div className="col-12">
            <div className="text-center py-5">
              <div className="mb-4">
                <span className="text-muted opacity-50 display-4 fw-bold">{getCurrencySymbol()}</span>
              </div>
              <h5>No Goals Yet</h5>
              <p className="text-muted mb-4">Create your first goal to get started</p>
              <button
                className="btn btn-primary"
                onClick={() => setShowAddModal(true)}
              >
                <FaPlus className="me-2" />
                Create First Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Goal Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingGoal ? 'Edit Goal' : 'Add New Goal'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={resetForm}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Goal Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter goal name"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Target Amount</label>
                      <div className="input-group">
                        <span className="input-group-text">{getCurrencySymbol()}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="form-control"
                          value={formData.targetAmount}
                          onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Target Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.targetDate}
                        onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Priority</label>
                      <select
                        className="form-select"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Category</label>
                      <select
                        className="form-select"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        required
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <FaSpinner className="fa-spin me-2" />
                        {editingGoal ? 'Updating' : 'Creating'}
                      </>
                    ) : (
                      editingGoal ? 'Update Goal' : 'Create Goal'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && goalToDelete && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title text-danger">
                  <FaTrash className="me-2" />
                  Delete Goal
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setGoalToDelete(null);
                  }}
                  disabled={loading}
                ></button>
              </div>
              <div className="modal-body pt-0">
                <div className="text-center py-3">
                  <div className="mb-4">
                    <div className="bg-danger bg-opacity-10 rounded-circle d-inline-flex p-3 mb-3">
                      <FaTrash className="text-danger" size={32} />
                    </div>
                    <h6 className="mb-2">Delete Goal?</h6>
                    <p className="text-muted mb-0">This action cannot be undone</p>
                  </div>

                  {/* Goal Details Preview */}
                  <div className="card bg-light border-0">
                    <div className="card-body py-3">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <div className="d-flex align-items-center">
                          <div className="p-2 rounded me-3 bg-primary bg-opacity-10">
                            {getStatusIcon(goalToDelete)}
                          </div>
                          <div className="text-start">
                            <div className="fw-medium">{goalToDelete.name}</div>
                            <small className="text-muted">{goalToDelete.category}</small>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="fw-medium text-primary">
                            {formatCurrency(goalToDelete.targetAmount)}
                          </div>
                          <small className="text-muted">
                            Target Date: {formatDate(goalToDelete.targetDate)}
                          </small>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="text-muted small">Current Progress</span>
                          <span className="fw-medium small">
                            {getProgressPercentage(goalToDelete.savedAmount, goalToDelete.targetAmount).toFixed(1)}%
                          </span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div
                            className={`progress-bar bg-${getProgressColor(
                              getProgressPercentage(goalToDelete.savedAmount, goalToDelete.targetAmount)
                            )}`}
                            style={{
                              width: `${Math.min(
                                getProgressPercentage(goalToDelete.savedAmount, goalToDelete.targetAmount),
                                100
                              )}%`
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Amount Details */}
                      <div className="row g-2">
                        <div className="col-6">
                          <div className="text-center p-2 bg-success bg-opacity-10 rounded">
                            <div className="fw-bold text-success small">
                              {formatCurrency(goalToDelete.savedAmount || 0)}
                            </div>
                            <small className="text-muted">Saved</small>
                          </div>
                        </div>
                        <div className="col-6">
                          <div className="text-center p-2 bg-warning bg-opacity-10 rounded">
                            <div className="fw-bold text-warning small">
                              {formatCurrency(goalToDelete.targetAmount - (goalToDelete.savedAmount || 0))}
                            </div>
                            <small className="text-muted">Remaining</small>
                          </div>
                        </div>
                      </div>

                      {/* Priority Badge */}
                      <div className="mt-3 text-center">
                        <span className={`badge bg-${priorityColors[goalToDelete.priority]} bg-opacity-10 text-${priorityColors[goalToDelete.priority]} text-capitalize`}>
                          {goalToDelete.priority} Priority
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning Message */}
                  {goalToDelete.savedAmount > 0 && (
                    <div className="alert alert-warning mt-3 mb-0">
                      <small>
                        <strong>Warning:</strong> You will lose {formatCurrency(goalToDelete.savedAmount)} in savings if you delete this goal.
                      </small>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setGoalToDelete(null);
                  }}
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
                  {loading ? (
                    <>
                      <FaSpinner className="fa-spin me-2" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <FaTrash className="me-2" />
                      Delete Goal
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Funds Modal */}
      {showAddFundsModal && selectedGoal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Funds</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddFundsModal(false)}
                ></button>
              </div>
              <form onSubmit={submitAddFunds}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Goal: {selectedGoal.name}</label>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Amount to Add</label>
                    <div className="input-group">
                      <span className="input-group-text">{getCurrencySymbol()}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="form-control"
                        value={addFundsAmount}
                        onChange={(e) => setAddFundsAmount(e.target.value)}
                        max={selectedGoal.targetAmount - (selectedGoal.savedAmount || 0)}
                        required
                      />
                    </div>
                    <div className="form-text">
                      Remaining: {formatCurrency(selectedGoal.targetAmount - (selectedGoal.savedAmount || 0))}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAddFundsModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <FaSpinner className="fa-spin me-2" />
                        Adding...
                      </>
                    ) : (
                      'Add Funds'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
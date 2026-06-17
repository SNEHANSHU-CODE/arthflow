import { createSelector } from '@reduxjs/toolkit';

// Base selectors
const selectGoalsState = (state) => state.goals;
const selectGoals = (state) => state.goals.goals;
const selectGoalsLoading = (state) => state.goals.loading;
const selectGoalsError = (state) => state.goals.error;
const selectDashboardStats = (state) => state.goals.dashboardStats;
const selectGoalFilters = (state) => state.goals.filters;

// Memoized selectors using createSelector
export const selectActiveGoals = createSelector(
  [selectGoals],
  (goals) => goals.filter(goal => goal.status === 'Active')
);

export const selectCompletedGoals = createSelector(
  [selectGoals],
  (goals) => goals.filter(goal => goal.status === 'Completed')
);

export const selectPausedGoals = createSelector(
  [selectGoals],
  (goals) => goals.filter(goal => goal.status === 'Paused')
);

export const selectOverdueGoals = createSelector(
  [selectGoals],
  (goals) => {
    const today = new Date();
    return goals.filter(goal => {
      const targetDate = new Date(goal.targetDate);
      return targetDate < today && goal.status !== 'Completed';
    });
  }
);

// Selector for goals by category
export const selectGoalsByCategory = createSelector(
  [selectGoals],
  (goals) => {
    return goals.reduce((acc, goal) => {
      const category = goal.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(goal);
      return acc;
    }, {});
  }
);

// Selector for goals by priority
export const selectGoalsByPriority = createSelector(
  [selectGoals],
  (goals) => {
    return goals.reduce((acc, goal) => {
      const priority = goal.priority || 'Medium';
      if (!acc[priority]) {
        acc[priority] = [];
      }
      acc[priority].push(goal);
      return acc;
    }, {});
  }
);

// Selector for filtered and sorted goals
export const selectFilteredGoals = createSelector(
  [selectGoals, selectGoalFilters],
  (goals, filters) => {
    let filteredGoals = goals;

    // Apply filters
    if (filters.status) {
      filteredGoals = filteredGoals.filter(goal => goal.status === filters.status);
    }
    if (filters.category) {
      filteredGoals = filteredGoals.filter(goal => goal.category === filters.category);
    }
    if (filters.priority) {
      filteredGoals = filteredGoals.filter(goal => goal.priority === filters.priority);
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'targetDate';
    const sortOrder = filters.sortOrder || 'asc';

    return [...filteredGoals].sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'targetDate':
          aValue = new Date(a.targetDate);
          bValue = new Date(b.targetDate);
          break;
        case 'targetAmount':
          aValue = a.targetAmount;
          bValue = b.targetAmount;
          break;
        case 'savedAmount':
          aValue = a.savedAmount || 0;
          bValue = b.savedAmount || 0;
          break;
        case 'progress':
          aValue = ((a.savedAmount || 0) / a.targetAmount) * 100;
          bValue = ((b.savedAmount || 0) / b.targetAmount) * 100;
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'priority': {
          const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
          aValue = priorityOrder[a.priority] || 0;
          bValue = priorityOrder[b.priority] || 0;
          break;
        }
        default:
          aValue = a[sortBy];
          bValue = b[sortBy];
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }
);

// High priority active goals
export const selectHighPriorityActiveGoals = createSelector(
  [selectActiveGoals],
  (activeGoals) => activeGoals.filter(goal => goal.priority === 'High')
);

// Goals with upcoming deadlines (within 30 days)
export const selectUpcomingDeadlineGoals = createSelector(
  [selectActiveGoals],
  (activeGoals) => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    return activeGoals.filter(goal => {
      const targetDate = new Date(goal.targetDate);
      return targetDate <= thirtyDaysFromNow && targetDate >= today;
    });
  }
);

// Goals close to completion (>= 90% progress)
export const selectNearCompletionGoals = createSelector(
  [selectActiveGoals],
  (activeGoals) => {
    return activeGoals.filter(goal => {
      const progress = ((goal.savedAmount || 0) / goal.targetAmount) * 100;
      return progress >= 90;
    });
  }
);

// Export all base selectors as well
export {
  selectGoalsState,
  selectGoals,
  selectGoalsLoading,
  selectGoalsError,
  selectDashboardStats,
  selectGoalFilters
};

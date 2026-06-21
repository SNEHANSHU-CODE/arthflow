import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import goalService from '../services/goalService';

// Async thunks for API calls
export const fetchGoals = createAsyncThunk(
  'goals/fetchGoals',
  async (filters = {}, { getState, rejectWithValue }) => {
    try {
      const userId = getState().auth.user?.userId;
      const response = await goalService.getGoals({...filters, userId});
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch goals' });
    }
  }
);

export const createGoal = createAsyncThunk(
  'goals/createGoal',
  async (goalData, { rejectWithValue }) => {
    try {
      const response = await goalService.createGoal(goalData);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to create goal' });
    }
  }
);

export const updateGoal = createAsyncThunk(
  'goals/updateGoal',
  async ({ id, goalData }, { rejectWithValue }) => {
    try {
      const response = await goalService.updateGoal(id, goalData);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to update goal' });
    }
  }
);

export const deleteGoal = createAsyncThunk(
  'goals/deleteGoal',
  async (goalId, { rejectWithValue }) => {
    try {
      await goalService.deleteGoal(goalId);
      return goalId;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to delete goal' });
    }
  }
);

export const addContribution = createAsyncThunk(
  'goals/addContribution',
  async ({ goalId, amount }, { rejectWithValue }) => {
    try {
      const response = await goalService.addContribution(goalId, amount);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to add contribution' });
    }
  }
);

export const markGoalComplete = createAsyncThunk(
  'goals/markGoalComplete',
  async (goalId, { rejectWithValue }) => {
    try {
      const response = await goalService.markGoalComplete(goalId);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to mark goal complete' });
    }
  }
);

export const pauseGoal = createAsyncThunk(
  'goals/pauseGoal',
  async (goalId, { rejectWithValue }) => {
    try {
      const response = await goalService.pauseGoal(goalId);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to pause goal' });
    }
  }
);

export const resumeGoal = createAsyncThunk(
  'goals/resumeGoal',
  async (goalId, { rejectWithValue }) => {
    try {
      const response = await goalService.resumeGoal(goalId);
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to resume goal' });
    }
  }
);

export const fetchDashboardStats = createAsyncThunk(
  'goals/fetchDashboardStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await goalService.getDashboardStats();
      return response.data?.data || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch dashboard stats' });
    }
  }
);

export const bulkDeleteGoals = createAsyncThunk(
  'goals/bulkDeleteGoals',
  async (goalIds, { rejectWithValue }) => {
    try {
      const response = await goalService.bulkDeleteGoals(goalIds);
      return { goalIds, deletedCount: response.data?.data.deletedCount || response.data.deletedCount };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to delete goals' });
    }
  }
);

const initialState = {
  goals: [],
  dashboardStats: {
    totalGoals: 0,
    activeGoals: 0,
    completedGoals: 0,
    pausedGoals: 0,
    overdueGoals: 0,
    totalTargetAmount: 0,
    totalSavedAmount: 0,
    averageProgress: 0,
    goalsByCategory: {},
    goalsByPriority: {},
    recentlyCompleted: [],
    upcomingDeadlines: []
  },
  loading: false,
  error: null,
  filters: {
    status: '',
    category: '',
    priority: '',
    sortBy: 'targetDate',
    sortOrder: 'asc'
  }
};

const goalSlice = createSlice({
  name: 'goals',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
    resetGoals: (state) => {
      state.goals = [];
      state.dashboardStats = initialState.dashboardStats;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch goals
      .addCase(fetchGoals.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGoals.fulfilled, (state, action) => {
        state.loading = false;
        state.goals = action.payload;
        state.error = null;
      })
      .addCase(fetchGoals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to fetch goals';
      })

      // Create goal
      .addCase(createGoal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createGoal.fulfilled, (state, action) => {
        state.loading = false;
        state.goals.push(action.payload);
        state.error = null;
      })
      .addCase(createGoal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to create goal';
      })

      // Update goal
      .addCase(updateGoal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateGoal.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.goals.findIndex(goal => goal._id === action.payload._id);
        if (index !== -1) {
          state.goals[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(updateGoal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to update goal';
      })

      // Delete goal
      .addCase(deleteGoal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteGoal.fulfilled, (state, action) => {
        state.loading = false;
        state.goals = state.goals.filter(goal => goal._id !== action.payload);
        state.error = null;
      })
      .addCase(deleteGoal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to delete goal';
      })

      // Add contribution
      .addCase(addContribution.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addContribution.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.goals.findIndex(goal => goal._id === action.payload._id);
        if (index !== -1) {
          state.goals[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(addContribution.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to add contribution';
      })

      // Mark goal complete
      .addCase(markGoalComplete.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(markGoalComplete.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.goals.findIndex(goal => goal._id === action.payload._id);
        if (index !== -1) {
          state.goals[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(markGoalComplete.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to mark goal complete';
      })

      // Pause goal
      .addCase(pauseGoal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(pauseGoal.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.goals.findIndex(goal => goal._id === action.payload._id);
        if (index !== -1) {
          state.goals[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(pauseGoal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to pause goal';
      })

      // Resume goal
      .addCase(resumeGoal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resumeGoal.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.goals.findIndex(goal => goal._id === action.payload._id);
        if (index !== -1) {
          state.goals[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(resumeGoal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to resume goal';
      })

      // Fetch dashboard stats
      .addCase(fetchDashboardStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.loading = false;
        state.dashboardStats = action.payload;
        state.error = null;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to fetch dashboard stats';
      })

      // Bulk delete goals
      .addCase(bulkDeleteGoals.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(bulkDeleteGoals.fulfilled, (state, action) => {
        state.loading = false;
        const { goalIds } = action.payload;
        state.goals = state.goals.filter(goal => !goalIds.includes(goal._id));
        state.error = null;
      })
      .addCase(bulkDeleteGoals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to delete goals';
      });
  }
});

export const { clearError, setFilters, clearFilters, resetGoals } = goalSlice.actions;

export default goalSlice.reducer;
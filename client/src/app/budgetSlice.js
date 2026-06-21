import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import budgetService from '../services/budgetService';

export const fetchBudget = createAsyncThunk(
  'budget/fetchBudget',
  async ({ year, month }, { rejectWithValue }) => {
    try {
      return await budgetService.getBudget(month, year);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const fetchBudgetAnalysis = createAsyncThunk(
  'budget/fetchBudgetAnalysis',
  async ({ year, month }, { rejectWithValue }) => {
    try {
      return await budgetService.getBudgetAnalysis(month, year);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const createBudget = createAsyncThunk(
  'budget/createBudget',
  async (data, { rejectWithValue }) => {
    try {
      return await budgetService.createBudget(data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateBudget = createAsyncThunk(
  'budget/updateBudget',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      return await budgetService.updateBudget(id, data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const deleteBudget = createAsyncThunk(
  'budget/deleteBudget',
  async (id, { rejectWithValue }) => {
    try {
      await budgetService.deleteBudget(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  budget: null,        // { _id, month, year, categories, totalBudget }
  analysis: null,      // { categorySpend: [{name, spent}], unplanned: [{name, spent}] }
  loading: false,
  analysisLoading: false,
  error: null,
};

const budgetSlice = createSlice({
  name: 'budget',
  initialState,
  reducers: {
    clearBudget: (state) => { state.budget = null; state.analysis = null; },
    clearError:  (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      // fetchBudget
      .addCase(fetchBudget.pending,    (state) => { state.loading = true; state.error = null; })
      .addCase(fetchBudget.fulfilled,  (state, { payload }) => { state.loading = false; state.budget = payload.data ?? null; })
      .addCase(fetchBudget.rejected,   (state, { payload }) => { state.loading = false; state.budget = null; state.error = payload; })

      // fetchBudgetAnalysis
      .addCase(fetchBudgetAnalysis.pending,   (state) => { state.analysisLoading = true; })
      .addCase(fetchBudgetAnalysis.fulfilled, (state, { payload }) => { state.analysisLoading = false; state.analysis = payload; })
      .addCase(fetchBudgetAnalysis.rejected,  (state) => { state.analysisLoading = false; })

      // createBudget
      .addCase(createBudget.pending,   (state) => { state.loading = true; state.error = null; })
      .addCase(createBudget.fulfilled, (state, { payload }) => { state.loading = false; state.budget = payload.data; })
      .addCase(createBudget.rejected,  (state, { payload }) => { state.loading = false; state.error = payload; })

      // updateBudget
      .addCase(updateBudget.fulfilled, (state, { payload }) => { state.budget = payload.data; })
      
      // deleteBudget
      .addCase(deleteBudget.fulfilled, (state) => { state.budget = null; state.analysis = null; });
  },
});

export const { clearBudget, clearError } = budgetSlice.actions;
export default budgetSlice.reducer;
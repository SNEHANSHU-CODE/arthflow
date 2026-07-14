// store/reminderSlice.js (Fixed)
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import reminderService from '../services/reminderService';

export const fetchReminders = createAsyncThunk(
  'reminder/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await reminderService.getReminders();
      return res.reminders || [];
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const createReminder = createAsyncThunk(
  'reminder/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await reminderService.createReminder(data);
      // API returns 201 even when Google sync fails — check for the error code
      if (res.googleError === 'GOOGLE_TOKEN_EXPIRED') {
        // Controller returns the saved reminder even on token expiry — pass it through
        // so the calendar shows the new reminder immediately (it's in DB, just not synced to Google)
        return { reminder: res.reminder, googleTokenExpired: true, googleMessage: res.googleMessage };
      }
      return { reminder: res.reminder, googleTokenExpired: false };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const deleteReminder = createAsyncThunk(
  'reminder/delete',
  async (id, { rejectWithValue }) => {
    try {
      const res = await reminderService.deleteReminder(id);
      if (res.googleError === 'GOOGLE_TOKEN_EXPIRED') {
        return { id, reminder: res.reminder, googleTokenExpired: true, googleMessage: res.googleMessage };
      }
      return { id, reminder: res.reminder, googleTokenExpired: false };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateReminder = createAsyncThunk(
  'reminder/update',
  async ({ id, ...data }, { rejectWithValue }) => {
    try {
      const res = await reminderService.updateReminder(id, data);
      if (res.googleError === 'GOOGLE_TOKEN_EXPIRED') {
        return { reminder: null, googleTokenExpired: true, googleMessage: res.googleMessage };
      }
      return { reminder: res.reminder, googleTokenExpired: false };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const googleConnect = createAsyncThunk(
  'reminder/googleConnect',
  async (_, { rejectWithValue }) => {
    try {
      const res = await reminderService.googleConnect();
      const { url } = res;
      window.location.href = url; // ✅ Redirect to Google
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const reminderSlice = createSlice({
  name: 'reminder',
  initialState: {
    events: [],
    loading: false,
    error: null,
    googleTokenExpired: false,  // true when Google refresh token is dead — show reconnect banner
  },
  reducers: {
    clearReminderError: (state) => {
      state.error = null;
    },
    clearGoogleTokenExpired: (state) => {
      state.googleTokenExpired = false;
    },
    // Add optimistic update for better UX
    optimisticUpdate: (state, action) => {
      const { id, updates } = action.payload;
      const index = state.events.findIndex(event => event.id === id);
      if (index !== -1) {
        state.events[index] = { ...state.events[index], ...updates };
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Reminders
      .addCase(fetchReminders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReminders.fulfilled, (state, action) => {
        state.loading = false;
        state.events = action.payload.map(r => ({
          id: r._id,
          title: r.title,
          date: r.date,
          description: r.description || '',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }));
      })
      .addCase(fetchReminders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Create Reminder
      .addCase(createReminder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createReminder.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.googleTokenExpired) {
          state.googleTokenExpired = true;
        }
        if (action.payload.reminder) {
          state.events.push({
            id: action.payload.reminder._id,
            title: action.payload.reminder.title,
            date: action.payload.reminder.date,
            description: action.payload.reminder.description || '',
            createdAt: action.payload.reminder.createdAt,
            updatedAt: action.payload.reminder.updatedAt
          });
        }
      })
      .addCase(createReminder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update Reminder
      .addCase(updateReminder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateReminder.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.googleTokenExpired) {
          state.googleTokenExpired = true;
        }
        if (action.payload.reminder) {
          const index = state.events.findIndex(event => event.id === action.payload.reminder._id);
          if (index !== -1) {
            state.events[index] = {
              id: action.payload.reminder._id,
              title: action.payload.reminder.title,
              date: action.payload.reminder.date,
              description: action.payload.reminder.description || '',
              createdAt: action.payload.reminder.createdAt,
              updatedAt: action.payload.reminder.updatedAt
            };
          }
        }
      })
      .addCase(updateReminder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Delete Reminder
      .addCase(deleteReminder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteReminder.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.googleTokenExpired) {
          state.googleTokenExpired = true;
        }
        state.events = state.events.filter(event => event.id !== action.payload.id);
      })
      .addCase(deleteReminder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearReminderError, clearGoogleTokenExpired, optimisticUpdate } = reminderSlice.actions;
export default reminderSlice.reducer;
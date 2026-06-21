// Import Google OAuth thunks
import { initiateGoogleOAuth, handleOAuthCallback } from '../utils/auth/googleAuth';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authService } from '../services/authService';
import { settingsService } from '../services/settingsService';
import sessionManager from '../utils/sessionManager';

// Existing auth async thunks
export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      return await authService.register(userData);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      // Only create session if MFA is not required (user & token present)
      if (!response.mfaRequired) {
        sessionManager.createSession(response.user, response.accessToken);
      }
      return response;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const refreshToken = createAsyncThunk(
  'auth/refresh',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.refreshToken();
      sessionManager.createSession(response.user, response.accessToken);
      return response;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      sessionManager.destroySession();
      await authService.logout();
      return {};
    } catch (error) {
      sessionManager.destroySession();
      return rejectWithValue(error.message);
    }
  }
);

export const fetchUserProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      return await authService.getProfile();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      return await authService.updateProfile(profileData);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateUserPassword = createAsyncThunk(
  'auth/updatePassword',
  async (newPassword, { rejectWithValue }) => {
    try {
      return await authService.updateUserPassword(newPassword);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deleteUserAccount = createAsyncThunk(
  'auth/deleteAccount',
  async (accountData, { rejectWithValue }) => {
    try {
      return await authService.deleteUserAccount(accountData);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const verifyAuthToken = createAsyncThunk(
  'auth/verify',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.verifyToken();
      sessionManager.createSession(response.user, response.accessToken);
      return response;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchUserPreferences = createAsyncThunk(
  'auth/fetchPreferences',
  async (_, { rejectWithValue }) => {
    try {
      return await settingsService.getPreferences();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateUserPreferences = createAsyncThunk(
  'auth/updatePreferences',
  async (preferences, { rejectWithValue }) => {
    try {
      return await settingsService.updatePreferences(preferences);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const resetUserPreferences = createAsyncThunk(
  'auth/resetPreferences',
  async (_, { rejectWithValue }) => {
    try {
      return await settingsService.resetPreferences();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchActiveSessions = createAsyncThunk(
  'auth/fetchActiveSessions',
  async (_, { rejectWithValue }) => {
    try {
      return await settingsService.getActiveSessions();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const terminateSessionAction = createAsyncThunk(
  'auth/terminateSession',
  async (sessionId, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      const session = state.auth.sessions.find(s => s._id === sessionId);
      const wasCurrent = !!session?.isCurrent;

      const response = await settingsService.terminateSession(sessionId);

      if (wasCurrent || response?.data?.currentSessionTerminated || response?.currentSessionTerminated) {
        await dispatch(logoutUser());
      }

      return { sessionId, wasCurrent: wasCurrent || response?.currentSessionTerminated };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const terminateAllSessionsAction = createAsyncThunk(
  'auth/terminateAllSessions',
  async (_, { rejectWithValue }) => {
    try {
      return await settingsService.terminateAllSessions();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const verifyMFAOtp = createAsyncThunk(
  'auth/verifyMFA',
  async ({ userId, otp }, { rejectWithValue }) => {
    try {
      const response = await authService.verifyMFAOtp({ userId, otp });
      if (response.user && response.accessToken) {
        sessionManager.createSession(
          { ...response.user, id: response.user._id },
          response.accessToken
        );
      }
      return response;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const toggleMFA = createAsyncThunk(
  'auth/toggleMFA',
  async (enabled, { rejectWithValue }) => {
    try {
      return await settingsService.toggleMFA(enabled);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const DEFAULT_PREFERENCES = {
  currency: 'INR',
  theme: 'light',
};

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    loading: false,
    formError: null,
    oauthError: null,
    profileLoading: false,
    isInitialized: false,
    sessionId: null,
    authMethod: 'email',
    preferences: { ...DEFAULT_PREFERENCES },
    preferencesLoading: false,
    preferencesError: null,
    sessions: [],
    sessionsLoading: false,
    sessionsError: null,
    mfaPending: false,
    mfaUserId: null,
    passwordChanged: false,
  },
  reducers: {
    clearError: (state) => {
      state.formError = null;
      state.oauthError = null;
      state.preferencesError = null;
    },
    clearFormError: (state) => {
      state.formError = null;
    },
    clearOAuthError: (state) => {
      state.oauthError = null;
    },
    clearMFAPending: (state) => {
      state.mfaPending = false;
      state.mfaUserId = null;
      state.formError = null;
    },
    setCredentials: (state, action) => {
      state.user = {
        ...action.payload.user,
        userId: action.payload.user._id,
      };
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      state.isInitialized = true;
      if (action.payload.user.preferences) {
        state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
      }
    },
    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.formError = null;
      state.oauthError = null;
      state.preferencesError = null;
      state.preferences = { ...DEFAULT_PREFERENCES };
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setInitialized: (state) => {
      state.isInitialized = true;
    },
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    updatePreferences: (state, action) => {
      state.preferences = { ...state.preferences, ...action.payload };
      if (state.user) {
        state.user.preferences = { ...state.user.preferences, ...action.payload };
      }
    },
    clearPreferencesError: (state) => {
      state.preferencesError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Google OAuth
      .addCase(initiateGoogleOAuth.pending, (state) => {
        state.loading = true;
        state.oauthError = null;
      })
      .addCase(initiateGoogleOAuth.fulfilled, (state) => {
        state.loading = false;
        state.oauthError = null;
      })
      .addCase(initiateGoogleOAuth.rejected, (state, action) => {
        state.loading = false;
        state.oauthError = action.payload;
      })
      .addCase(handleOAuthCallback.pending, (state) => {
        state.loading = true;
        state.oauthError = null;
      })
      .addCase(handleOAuthCallback.fulfilled, (state, action) => {
        state.loading = false;
        state.oauthError = null;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.sessionId = action.payload.sessionId;
        state.authMethod = action.payload.authMethod;
        state.isInitialized = true;
      })
      .addCase(handleOAuthCallback.rejected, (state, action) => {
        state.loading = false;
        state.oauthError = action.payload;
      })
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.formError = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.formError = null;
        state.user = { ...action.payload.user, userId: action.payload.user._id };
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.isInitialized = true;
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.formError = action.payload;
        state.isInitialized = true;
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.formError = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.formError = null;
        if (action.payload.mfaRequired) {
          state.mfaPending = true;
          state.mfaUserId = action.payload.userId;
        } else {
          state.mfaPending = false;
          state.mfaUserId = null;
          state.user = { ...action.payload.user, userId: action.payload.user._id };
          state.accessToken = action.payload.accessToken;
          state.isAuthenticated = true;
          state.isInitialized = true;
          if (action.payload.user.preferences) {
            state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
          }
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.formError = action.payload;
        state.isInitialized = true;
      })
      // Refresh
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.user = { ...action.payload.user, userId: action.payload.user._id };
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.isInitialized = true;
        state.formError = null;
        state.oauthError = null;
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(refreshToken.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.isInitialized = true;
        state.preferences = { ...DEFAULT_PREFERENCES };
      })
      // Logout
      .addCase(logoutUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.formError = null;
        state.oauthError = null;
        state.preferencesError = null;
        state.preferences = { ...DEFAULT_PREFERENCES };
      })
      .addCase(logoutUser.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.preferences = { ...DEFAULT_PREFERENCES };
      })
      // Verify token
      .addCase(verifyAuthToken.fulfilled, (state, action) => {
        state.user = { ...action.payload.user, userId: action.payload.user._id };
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.isInitialized = true;
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(verifyAuthToken.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.isInitialized = true;
        state.preferences = { ...DEFAULT_PREFERENCES };
      })
      // Profile
      .addCase(fetchUserProfile.pending, (state) => {
        state.profileLoading = true;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.profileLoading = false;
        state.user = { ...state.user, ...action.payload.user };
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.profileLoading = false;
        state.formError = action.payload;
      })
      .addCase(updateUserProfile.pending, (state) => {
        state.profileLoading = true;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.profileLoading = false;
        state.user = { ...state.user, ...action.payload.user };
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.profileLoading = false;
        state.formError = action.payload;
      })
      // Preferences
      .addCase(fetchUserPreferences.pending, (state) => {
        state.preferencesLoading = true;
        state.preferencesError = null;
      })
      .addCase(fetchUserPreferences.fulfilled, (state, action) => {
        state.preferencesLoading = false;
        state.preferences = { ...state.preferences, ...action.payload.preferences };
        if (state.user) {
          state.user.preferences = { ...state.user.preferences, ...action.payload.preferences };
        }
      })
      .addCase(fetchUserPreferences.rejected, (state, action) => {
        state.preferencesLoading = false;
        state.preferencesError = action.payload;
      })
      .addCase(updateUserPreferences.pending, (state) => {
        state.preferencesLoading = true;
        state.preferencesError = null;
      })
      .addCase(updateUserPreferences.fulfilled, (state, action) => {
        state.preferencesLoading = false;
        state.preferences = { ...state.preferences, ...action.payload.preferences };
        if (state.user) {
          state.user.preferences = { ...state.user.preferences, ...action.payload.preferences };
        }
      })
      .addCase(updateUserPreferences.rejected, (state, action) => {
        state.preferencesLoading = false;
        state.preferencesError = action.payload;
      })
      .addCase(resetUserPreferences.pending, (state) => {
        state.preferencesLoading = true;
        state.preferencesError = null;
      })
      .addCase(resetUserPreferences.fulfilled, (state, action) => {
        state.preferencesLoading = false;
        state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.preferences };
        if (state.user) {
          state.user.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.preferences };
        }
      })
      .addCase(resetUserPreferences.rejected, (state, action) => {
        state.preferencesLoading = false;
        state.preferencesError = action.payload;
      })
      // Update Password
      .addCase(updateUserPassword.pending, (state) => {
        state.loading = true;
        state.formError = null;
      })
      .addCase(updateUserPassword.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.formError = null;
        state.oauthError = null;
        state.preferences = { ...DEFAULT_PREFERENCES };
        state.passwordChanged = true;
        state.isInitialized = true;
      })
      .addCase(updateUserPassword.rejected, (state, action) => {
        state.loading = false;
        state.formError = action.payload;
      })
      // Delete Account
      .addCase(deleteUserAccount.pending, (state) => {
        state.loading = true;
        state.formError = null;
      })
      .addCase(deleteUserAccount.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.formError = null;
        state.oauthError = null;
        state.profileLoading = false;
        state.preferencesLoading = false;
        state.preferencesError = null;
        state.preferences = { ...DEFAULT_PREFERENCES };
      })
      .addCase(deleteUserAccount.rejected, (state, action) => {
        state.loading = false;
        state.formError = action.payload;
      })
      // Sessions
      .addCase(fetchActiveSessions.pending, (state) => {
        state.sessionsLoading = true;
        state.sessionsError = null;
      })
      .addCase(fetchActiveSessions.fulfilled, (state, action) => {
        state.sessionsLoading = false;
        state.sessions = action.payload.sessions || [];
      })
      .addCase(fetchActiveSessions.rejected, (state, action) => {
        state.sessionsLoading = false;
        state.sessionsError = action.payload;
      })
      .addCase(terminateSessionAction.pending, (state) => {
        state.sessionsLoading = true;
        state.sessionsError = null;
      })
      .addCase(terminateSessionAction.fulfilled, (state, action) => {
        state.sessionsLoading = false;
        const removedId = action.payload?.sessionId || action.payload;
        state.sessions = state.sessions.filter(s => s._id !== removedId);
      })
      .addCase(terminateSessionAction.rejected, (state, action) => {
        state.sessionsLoading = false;
        state.sessionsError = action.payload;
      })
      .addCase(terminateAllSessionsAction.pending, (state) => {
        state.sessionsLoading = true;
        state.sessionsError = null;
      })
      .addCase(terminateAllSessionsAction.fulfilled, (state) => {
        state.sessionsLoading = false;
        state.sessions = [];
      })
      .addCase(terminateAllSessionsAction.rejected, (state, action) => {
        state.sessionsLoading = false;
        state.sessionsError = action.payload;
      })
      // Verify MFA OTP
      .addCase(verifyMFAOtp.pending, (state) => {
        state.loading = true;
        state.formError = null;
      })
      .addCase(verifyMFAOtp.fulfilled, (state, action) => {
        state.loading = false;
        state.mfaPending = false;
        state.mfaUserId = null;
        state.formError = null;
        state.user = { ...action.payload.user, userId: action.payload.user._id };
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.isInitialized = true;
        if (action.payload.user.preferences) {
          state.preferences = { ...DEFAULT_PREFERENCES, ...action.payload.user.preferences };
        }
      })
      .addCase(verifyMFAOtp.rejected, (state, action) => {
        state.loading = false;
        state.formError = action.payload;
      })
      // Toggle MFA
      .addCase(toggleMFA.fulfilled, (state, action) => {
        state.preferences = { ...state.preferences, ...action.payload.preferences };
        if (state.user) {
          state.user.preferences = { ...state.user.preferences, ...action.payload.preferences };
        }
      })
      .addCase(toggleMFA.rejected, (state, action) => {
        state.preferencesError = action.payload;
      });
  },
});

export const {
  clearError,
  clearFormError,
  clearOAuthError,
  clearMFAPending,
  setCredentials,
  clearCredentials,
  setLoading,
  setInitialized,
  updateUser,
  updatePreferences,
  clearPreferencesError,
} = authSlice.actions;

export { initiateGoogleOAuth, handleOAuthCallback };
export const selectAuth = (state) => ({ loading: state.auth.loading, formError: state.auth.formError, oauthError: state.auth.oauthError });
export default authSlice.reducer;
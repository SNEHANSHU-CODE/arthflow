import { createAsyncThunk } from '@reduxjs/toolkit';
import sessionManager from '../sessionManager';

// OAuth error mappings for user-friendly messages
const OAUTH_ERROR_MESSAGES = {
  invalid_code: 'Authorization code is invalid or expired',
  invalid_state: 'Security validation failed. Please try again',
  code_expired: 'Authorization code has expired. Please try again',
  token_exchange_failed: 'Failed to authenticate with Google',
  user_info_failed: 'Failed to retrieve user information',
  email_not_verified: 'Your Google email is not verified',
  duplicate_google_account: 'This Google account is already linked to another user',
  user_creation_failed: 'Failed to create user account',
  missing_parameters: 'Missing OAuth parameters',
  consent_denied: 'You denied the authorization request',
  server_error: 'Server error during authentication',
  popup_blocked: 'Popup blocked. Please allow popups for this site',
  network_error: 'Network error. Please check your connection',
  timeout: 'OAuth flow timed out. Please try again'
};

/**
 * Initiate Google OAuth Flow
 * Opens popup window and handles OAuth URL generation
 * @returns {Promise} - Resolves with authUrl and state
 */
export const initiateGoogleOAuth = createAsyncThunk(
  'auth/googleOAuthStart',
  async (_, { rejectWithValue }) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(
        `${apiUrl}/auth/google/start`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OAuth start failed:', { status: response.status, body: errorText });
        throw new Error(`OAuth initialization failed: ${response.statusText}`);
      }

      const { authUrl, state } = await response.json();

      if (!authUrl || !state) {
        throw new Error('Invalid OAuth response from server');
      }

      // Store state in sessionStorage for CSRF validation
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('oauth_initTime', Date.now().toString());

      console.info('OAuth URL generated successfully');
      return { authUrl, state };
    } catch (error) {
      if (error.name === 'AbortError') {
        error.message = 'OAuth initialization timeout';
      }
      const errorMessage = error.message || 'Unknown error';
      console.error('OAuth initiation error:', errorMessage);

      const friendlyMessage = Object.values(OAUTH_ERROR_MESSAGES).includes(errorMessage)
        ? errorMessage
        : OAUTH_ERROR_MESSAGES.server_error;

      return rejectWithValue(friendlyMessage);
    }
  }
);

/**
 * Handle OAuth Callback
 * Validates state and exchanges token for user data
 * @param {Object} params - { accessToken, sessionId }
 * @returns {Promise} - Resolves with user data and auth tokens
 */
export const handleOAuthCallback = createAsyncThunk(
  'auth/googleOAuthCallback',
  async ({ accessToken, sessionId }, { rejectWithValue }) => {
    try {
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Invalid access token');
      }

      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid session ID');
      }

      // Validate stored OAuth state
      const storedState = sessionStorage.getItem('oauth_state');
      const initTime = sessionStorage.getItem('oauth_initTime');

      if (!storedState || !initTime) {
        throw new Error('OAuth state not found. Session may have expired.');
      }

      // Check for timeout (15 minute max)
      const elapsedTime = Date.now() - parseInt(initTime, 10);
      if (elapsedTime > 15 * 60 * 1000) {
        throw new Error(OAUTH_ERROR_MESSAGES.timeout);
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const userResponse = await fetch(
        `${apiUrl}/auth/profile`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!userResponse.ok) {
        if (userResponse.status === 401) {
          throw new Error('Authentication token invalid');
        }
        const errorData = await userResponse.text();
        console.error('Failed to fetch user profile:', errorData);
        throw new Error('Failed to fetch user profile');
      }

      const user = await userResponse.json();

      if (!user || !user._id) {
        throw new Error('Invalid user data from server');
      }

      // Clear OAuth state from session storage
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_initTime');

      console.info('OAuth callback successful:', { userId: user._id });

      const userData = {
        ...user,
        userId: user._id,
        authMethod: 'google',
        lastLogin: new Date().toISOString()
      };
      sessionManager.createSession(userData, accessToken);

      return {
        user: userData,
        accessToken,
        sessionId,
        authMethod: 'google'
      };
    } catch (error) {
      // Clear OAuth state on error
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_initTime');

      const errorMessage = error.message || 'Unknown error';
      console.error('OAuth callback error:', errorMessage);

      const friendlyMessage = OAUTH_ERROR_MESSAGES[errorMessage] || OAUTH_ERROR_MESSAGES.server_error;
      return rejectWithValue(friendlyMessage);
    }
  }
);

export { OAUTH_ERROR_MESSAGES };

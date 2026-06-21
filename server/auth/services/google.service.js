const { google } = require('googleapis');
const User = require('../../models/userModel');
const oauthStateManager = require('../../utils/oauthState');
const logger = console;

// OAuth error codes for better debugging
const OAUTH_ERRORS = {
  INVALID_CODE: 'invalid_code',
  INVALID_STATE: 'invalid_state',
  EXPIRED_CODE: 'code_expired',
  TOKEN_EXCHANGE_FAILED: 'token_exchange_failed',
  USER_INFO_FAILED: 'user_info_failed',
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  DUPLICATE_GOOGLE_ACCOUNT: 'duplicate_google_account',
  USER_CREATION_FAILED: 'user_creation_failed'
};

class GoogleOAuthService {
  constructor() {
    // Use LOGIN credentials for authentication flow
    if (!process.env.GOOGLE_LOGIN_CLIENT_ID || !process.env.GOOGLE_LOGIN_CLIENT_SECRET || !process.env.GOOGLE_LOGIN_REDIRECT_URI) {
      throw new Error('Missing required Google OAuth environment variables for Login');
    }
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_LOGIN_CLIENT_ID,
      process.env.GOOGLE_LOGIN_CLIENT_SECRET,
      process.env.GOOGLE_LOGIN_REDIRECT_URI
    );
  }

  /**
   * Generate Google OAuth URL with state parameter
   * @param {string} guestId - Guest user ID for data merging
   * @returns {Object} - OAuth URL and state
   * @throws {Error} - If state generation fails
   */
  generateAuthUrl() {
    try {
      // Generate cryptographically secure state
      const state = oauthStateManager.generateState({
        provider: 'google',
        timestamp: Date.now()
      });

      // Comprehensive scopes for user info
      const scopes = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid'
      ];

      const url = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state,
        prompt: 'consent', // Force consent screen to ensure refresh token
        response_type: 'code'
      });

      return { url, state };
    } catch (error) {
      throw new Error('Failed to generate OAuth URL: ' + error.message);
    }
  }

  /**
   * Handle OAuth callback and token exchange
   * Robust error handling, upsert user, validate tokens
   * @param {string} code - Authorization code from Google
   * @param {string} state - State parameter for CSRF validation
   * @returns {Object} - User object and tokens
   * @throws {Error} - With detailed error code
   */
  async handleCallback(code, state) {
    // Validate input parameters
    if (!code || typeof code !== 'string') {
      const err = new Error(OAUTH_ERRORS.INVALID_CODE);
      err.statusCode = 400;
      throw err;
    }

    if (!state || typeof state !== 'string') {
      const err = new Error(OAUTH_ERRORS.INVALID_STATE);
      err.statusCode = 400;
      throw err;
    }

    // Validate and extract state data (CSRF protection)
    let stateData;
    try {
      stateData = oauthStateManager.validateState(state);
      if (!stateData || stateData.provider !== 'google') {
        const err = new Error(OAUTH_ERRORS.INVALID_STATE);
        err.statusCode = 400;
        throw err;
      }
    } catch (err) {
      if (err.message && err.message.includes('State already used')) {
        const error = new Error('STATE_ALREADY_USED');
        error.statusCode = 400;
        throw error;
      }
      const error = new Error(OAUTH_ERRORS.INVALID_STATE);
      error.statusCode = 400;
      throw error;
    }

    // Exchange authorization code for tokens
    let tokens;
    try {
      console.log('[OAuth] Exchanging code for tokens...');
      const tokenResult = await this.oauth2Client.getToken(code);
      if (!tokenResult || !tokenResult.tokens) {
        throw new Error('No tokens returned from Google');
      }
      tokens = tokenResult.tokens;
      console.log('[OAuth] Tokens received:', { hasAccessToken: !!tokens.access_token, hasRefreshToken: !!tokens.refresh_token });
      
      // Validate token structure
      if (!tokens.access_token) {
        throw new Error('Missing access token');
      }

      this.oauth2Client.setCredentials(tokens);
    } catch (err) {
      console.error('[OAuth] Token exchange failed:', err.message);
      const errorCode = err.message.includes('invalid_grant') ? OAUTH_ERRORS.EXPIRED_CODE : OAUTH_ERRORS.TOKEN_EXCHANGE_FAILED;
      const error = new Error(errorCode);
      error.statusCode = 400;
      error.originalError = err.message;
      throw error;
    }

    // Fetch authenticated user information from Google
    let googleUser;
    try {
      console.log('[OAuth] Fetching user info from Google...');
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      googleUser = data;
      console.log('[OAuth] User info received:', { id: googleUser?.id });

      // Validate required user info
      if (!googleUser || !googleUser.id) {
        throw new Error('Google user ID missing');
      }
      if (!googleUser.email) {
        throw new Error('Google email missing');
      }
    } catch (err) {
      console.error('[OAuth] Failed to fetch user info:', err.message);
      const error = new Error(OAUTH_ERRORS.USER_INFO_FAILED);
      error.statusCode = 400;
      error.originalError = err.message;
      throw error;
    }

    // Verify email is verified with Google
    if (!googleUser.verified_email) {
      const err = new Error(OAUTH_ERRORS.EMAIL_NOT_VERIFIED);
      err.statusCode = 403;
      throw err;
    }

    // Upsert user to database
    let user;
    try {
      console.log('[OAuth] Creating/updating user in database...');
      user = await User.upsertGoogleUser(googleUser, tokens);
      console.log('[OAuth] User upserted successfully:', { userId: user?._id });
      if (!user || !user._id) {
        throw new Error('User object invalid after upsert');
      }
    } catch (err) {
      console.error('[OAuth] User creation failed:', err.message);
      // Check for duplicate Google account error
      if (err.message.includes('already linked to another user')) {
        const error = new Error(OAUTH_ERRORS.DUPLICATE_GOOGLE_ACCOUNT);
        error.statusCode = 409;
        throw error;
      }
      const error = new Error(OAUTH_ERRORS.USER_CREATION_FAILED);
      error.statusCode = 500;
      error.originalError = err.message;
      throw error;
    }

    return {
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    };
  }

  /**
   * Refresh Google access token with error handling
   * @param {string} refreshToken - Google refresh token
   * @returns {Object} - New tokens
   * @throws {Error} - If refresh fails
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials || !credentials.access_token) {
        throw new Error('Invalid credentials returned from Google');
      }

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken,
        expiryDate: credentials.expiry_date
      };
    } catch (err) {
      throw new Error('Token refresh failed: ' + err.message);
    }
  }
}

module.exports = new GoogleOAuthService();
module.exports.OAUTH_ERRORS = OAUTH_ERRORS;
const googleOAuthService = require('../services/google.service');
const JWTUtils = require('../../utils/jwt');
const ResponseUtils = require('../../utils/response');
const Session = require('../../models/sessionModel');
const crypto = require('crypto');
const logger = console;

class GoogleOAuthController {
  /**
   * GET /auth/google/start
   * Initiates Google OAuth flow
   */
  static async startOAuth(req, res) {
    try {
      const { url } = googleOAuthService.generateAuthUrl();

      return res.json({
        success: true,
        authUrl: url
      });
    } catch (error) {
      logger.error('Google OAuth start error:', error);
      return ResponseUtils.error(res, 'Failed to initiate Google OAuth', 500);
    }
  }

  /**
   * GET /auth/google
   * Handles Google OAuth callback
   */
  static async handleCallback(req, res) {
    const requestId = crypto.randomUUID();
    const frontendUrl = process.env.CLIENT_URL;

    try {
      const { code, state, error: oauthError } = req.query;

      // User denied consent
      if (oauthError) {
        logger.warn('Google OAuth denied', { oauthError, requestId });
        return res.redirect(`${frontendUrl}/login?error=google_consent_denied`);
      }

      // Missing required params
      if (!code || !state) {
        logger.warn('Missing OAuth params', { code, state, requestId });
        return res.redirect(`${frontendUrl}/login?error=invalid_oauth_params`);
      }

      // Handle OAuth logic (exchange token, upsert user)
      const { user } = await googleOAuthService.handleCallback(code, state);

      // Create session
      let session;
      try {
        const deviceFingerprint = GoogleOAuthController.getDeviceFingerprint(req);
        session = await Session.create({
          userId: user.id,
          deviceFingerprint,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          lastActivity: new Date(),
          lastLoginProvider: 'google'
        });
      } catch (err) {
        logger.error('Session creation failed', { err, requestId });
        session = { _id: requestId };
      }

      // Generate JWT tokens
      const { accessToken, refreshToken, sessionId } =
        JWTUtils.generateTokenPair(user.id);

      // Persist refresh token
      try {
        const User = require('../../models/userModel');
        const { getClientIp } = require('../../utils/ip');

        await User.findByIdAndUpdate(user.id, {
          $push: {
            refreshTokens: {
              _id: sessionId,
              token: refreshToken,
              device: req.get('user-agent'),
              ip: getClientIp(req),
              createdAt: new Date()
            }
          },
          lastLoginAt: new Date(),
          lastLoginProvider: 'google'
        });
      } catch (err) {
        logger.error('Failed to store refresh token', { err, requestId });
      }

      // Set refresh token cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      // ✅ REDIRECT TO FRONTEND CALLBACK
      return res.redirect(`${frontendUrl}/oauth/callback`);
    } catch (error) {
      logger.error('Google OAuth callback error', {
        error: error.message,
        stack: error.stack,
        requestId
      });

      return res.redirect(
        `${frontendUrl}/login?error=google_oauth_failed`
      );
    }
  }

  /**
   * Helper: Generate device fingerprint
   */
  static getDeviceFingerprint(req) {
    try {
      const fingerprint = [
        req.get('user-agent'),
        req.get('accept-language'),
        req.get('accept-encoding')
      ].join('|');

      return crypto
        .createHash('sha256')
        .update(fingerprint)
        .digest('hex');
    } catch {
      return crypto.randomUUID();
    }
  }
}

module.exports = GoogleOAuthController;
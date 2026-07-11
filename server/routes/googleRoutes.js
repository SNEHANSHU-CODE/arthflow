const express = require('express');
const { google } = require('googleapis');
const { createOAuthClient, getAuthUrl } = require('../utils/googleOauth');
const { saveGoogleTokens, saveOAuthNonce, consumeOAuthNonce } = require('../utils/googleTokenCache');
const crypto = require('crypto'); // built-in Node.js — no install needed
const User = require('../models/userModel');
const Reminder = require('../models/reminderModel');
const { authenticateToken } = require('../middleware/auth');

const googleRouter = express.Router();

// Get frontend URL from environment
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Save tokens to both Redis and MongoDB
const saveTokensComplete = async (userId, tokens) => {
  console.log('Saving tokens for user:', userId);
  console.log('Tokens received:', { 
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: tokens.expiry_date
  });

  try {
    // Save to Redis (access token + refresh token for quick access)
    if (tokens.access_token) {
      await saveGoogleTokens(userId, tokens);
    }

    // Save refresh token to MongoDB for persistence.
    // Google only sends refresh_token on the FIRST authorization or after revoking access.
    // On reconnects it omits it — so we only update if we actually received one.
    if (tokens.refresh_token) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { googleRefreshToken: tokens.refresh_token },
        { new: true }
      );
      
      if (!updatedUser) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      console.log(`✅ Refresh token saved to DB for user: ${userId}`);
    } else {
      // Google did not return a refresh_token (common on reconnect).
      // Check if we already have one persisted in the DB — if yes, it's still valid.
      const existingUser = await User.findById(userId).select('+googleRefreshToken');
      if (existingUser && existingUser.googleRefreshToken) {
        console.log(`ℹ️  No new refresh token from Google — existing DB token is still valid for user: ${userId}`);
      } else {
        // No refresh token anywhere — user must revoke Google access and reconnect from scratch.
        console.warn(`⚠️  No refresh token from Google and none stored in DB for user: ${userId}. User needs to revoke Google access at myaccount.google.com and reconnect.`);
      }
    }
  } catch (error) {
    console.error('❌ Error in saveTokensComplete:', error);
    throw error;
  }
};

const getAuthorizedClient = async (userId) => {
  try {
    const oauth2Client = createOAuthClient();
    // Try to get tokens from Redis first
    const { getGoogleTokens } = require('../utils/googleTokenCache');
    let tokens = await getGoogleTokens(userId);

    // Use expiry_date field (Google standard) to avoid silent 401s from stale tokens
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const tokenValid = !!(
      tokens &&
      tokens.access_token &&
      tokens.expiry_date &&
      tokens.expiry_date > Date.now() + FIVE_MINUTES_MS
    );

    if (tokenValid) {
      oauth2Client.setCredentials(tokens);
    }

    if (!tokenValid) {
      console.log('No tokens in Redis or invalid, checking DB for refresh token...');
      
      // Fallback to DB refresh token
      const user = await User.findById(userId).select('+googleRefreshToken');
      if (!user || !user.googleRefreshToken) {
        throw new Error('Google tokens not found. Please reconnect your Google account.');
      }

      // Use refresh token to get new access token
      oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
      
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        tokens = credentials;
        
        // Save the new tokens
        await saveGoogleTokens(userId, tokens);
        console.log('✅ Access token refreshed and saved');
      } catch (refreshError) {
        console.error('❌ Failed to refresh access token:', refreshError);
        const isInvalidGrant = refreshError.message === 'invalid_grant' || 
                               refreshError.response?.data?.error === 'invalid_grant';
        if (isInvalidGrant) {
          throw new Error('invalid_grant');
        }
        throw new Error('Network error. Failed to refresh Google access token.');
      }
    }

    // Set credentials and return calendar client
    oauth2Client.setCredentials(tokens);

    return google.calendar({ version: 'v3', auth: oauth2Client });
  } catch (error) {
    console.error('❌ Error in getAuthorizedClient:', error);
    throw error;
  }
};

const syncAllRemindersToGoogle = async (userId, userTimezone = 'UTC') => {
  try {
    console.log(`🔄 Starting Google Calendar sync for user: ${userId}`);
    const calendar = await getAuthorizedClient(userId);
    const reminders = await Reminder.find({ userId });

    console.log(`📅 Found ${reminders.length} reminders to sync`);

    let syncedCount = 0;
    for (const reminder of reminders) {
      if (!reminder.calendarEventId) {
        try {
          const event = {
            summary: reminder.title,
            description: reminder.description || '',
            start: { 
              dateTime: new Date(reminder.date).toISOString()
            },
            end: { 
              dateTime: new Date(new Date(reminder.date).getTime() + 60 * 60 * 1000).toISOString()
            },
          };

          const { data } = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
          });

          reminder.calendarEventId = data.id;
          await reminder.save();
          syncedCount++;
          
          console.log(`✅ Synced: "${reminder.title}"`);
        } catch (syncError) {
          console.error(`❌ Failed to sync "${reminder.title}":`, syncError.message);
        }
      }
    }
    
    console.log(`✅ Sync completed: ${syncedCount}/${reminders.length} reminders synced`);
    return syncedCount;
  } catch (error) {
    console.error('❌ Error in syncAllRemindersToGoogle:', error);
    throw error;
  }
};

// Step 1: Frontend requests Google OAuth URL
googleRouter.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId.toString();
    const timeZone = req.body.timeZone || 'UTC';
    console.log('🔐 Generating OAuth URL for user:', userId);

    // Generate a cryptographically random nonce (UUID v4 = 128 bits of entropy).
    // Store { userId, timeZone } in Redis under this nonce — NOT in the URL.
    // Only the opaque nonce goes to Google in the `state` param.
    // An attacker who sees the state URL learns nothing; a forged nonce
    // will never exist in Redis and is rejected in the callback.
    const nonce = crypto.randomUUID();
    await saveOAuthNonce(nonce, { userId, timeZone });

    const url = getAuthUrl(nonce);
    console.log('✅ OAuth URL generated with secure nonce state');
    res.status(200).json({ success: true, url });
  } catch (error) {
    console.error('❌ Error generating OAuth URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate Google connection. Please try again.',
    });
  }
});


// Step 2: Google redirects back after user grants access
googleRouter.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    
    // Consume the nonce from Redis — this IS the CSRF/IDOR protection.
    // consumeOAuthNonce uses GETDEL (atomic read + delete in one Redis command):
    //   - Returns {userId, timeZone} if the nonce is valid and was not yet used
    //   - Returns null if: nonce expired (>10 min), already consumed (replay
    //     attack), forged (never stored in Redis), or Redis error
    //   - Never throws — always returns payload or null cleanly
    let userId = null;
    let timeZone = 'UTC';
    if (state) {
      const noncePayload = await consumeOAuthNonce(state);
      if (noncePayload) {
        userId = noncePayload.userId;
        timeZone = noncePayload.timeZone || 'UTC';
      }
    }
    
    console.log('📥 OAuth callback received');
    console.log('Code present:', !!code);
    console.log('User ID resolved:', !!userId, 'TimeZone:', timeZone); // don't log actual userId (PII)
    console.log('Error:', oauthError);
    
    // Check for OAuth errors
    if (oauthError) {
      console.error('❌ OAuth error:', oauthError);
      return res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=false&error=oauth_denied`);
    }

    if (!code) {
      console.error('❌ No authorization code received');
      return res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=false&error=no_code`);
    }

    if (!userId) {
      // Fires when: nonce expired (>10 min), already consumed (replay attack),
      // state was forged (never existed in Redis), or Redis was unavailable.
      console.error('❌ OAuth state rejected — nonce invalid, expired, or already consumed');
      return res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=false&error=invalid_state`);
    }

    // Defence-in-depth: validate userId format even though it came from our own Redis.
    // Guards against data corruption or unexpected Redis values.
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('❌ Corrupt userId in OAuth nonce payload:', userId);
      return res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=false&error=invalid_user_id`);
    }

    console.log('🔄 Exchanging code for tokens...');
    
    // Exchange code for tokens
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: new Date(tokens.expiry_date).toLocaleString()
    });

    // Save tokens
    await saveTokensComplete(userId, tokens);

    // Set credentials for immediate use
    oauth2Client.setCredentials(tokens);

    // Sync existing reminders
    console.log('🔄 Syncing reminders to Google Calendar...');
    const syncedCount = await syncAllRemindersToGoogle(userId, timeZone);
    console.log(`✅ Synced ${syncedCount} reminders`);

    console.log('✅ Google OAuth flow completed successfully');
    res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=true`);
    
  } catch (error) {
    console.error('❌ Google OAuth Callback Error:', error);
    console.error('Error stack:', error.stack);
    res.redirect(`${CLIENT_URL}/dashboard/reminders?googleConnected=false&error=${encodeURIComponent(error.message)}`);
  }
});

// Route to check Google connection status
// This is a PASSIVE check only — reads DB state, no live Google API call.
// If the refresh token is revoked by Google, the next actual operation
// (add/edit/delete reminder) will fail with invalid_grant and be handled then.
googleRouter.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId.toString();

    // Ground truth: refresh token in MongoDB.
    // Access token in Redis is ephemeral — its absence does NOT mean disconnected.
    const user = await User.findById(userId).select('+googleRefreshToken');
    const isConnected = !!(user && user.googleRefreshToken);

    console.log(`📊 Connection status for user ${userId}: connected=${isConnected}`);

    res.json({
      success: true,
      connected: isConnected,
    });
  } catch (error) {
    console.error('❌ Error checking Google connection status:', error);
    res.status(500).json({ success: false, message: 'Failed to check connection status' });
  }
});


// Route to disconnect Google account
googleRouter.delete('/disconnect', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId.toString();
    
    // Remove from Redis
    const { deleteGoogleTokens } = require('../utils/googleTokenCache');
    await deleteGoogleTokens(userId);
    
    // Revoke token from Google before deleting it
    const user = await User.findById(userId).select('+googleRefreshToken');
    if (user && user.googleRefreshToken) {
      try {
        const { createOAuthClient } = require('../utils/googleOauth');
        const oauth2Client = createOAuthClient();
        await oauth2Client.revokeToken(user.googleRefreshToken);
      } catch (revokeErr) {
        console.warn('Failed to revoke Google token:', revokeErr.message);
      }
    }
    
    // Remove refresh token from DB
    await User.findByIdAndUpdate(userId, { $unset: { googleRefreshToken: 1 } });
    
    console.log('🔓 Google account disconnected for user:', userId);
    res.json({ success: true, message: 'Google account disconnected successfully' });
  } catch (error) {
    console.error('❌ Error disconnecting Google account:', error);
    res.status(500).json({ success: false, message: 'Failed to disconnect Google account' });
  }
});

module.exports = googleRouter;
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const UAParser = require('ua-parser-js');
const { isPrivateIp } = require('../utils/ip');

const settingsService = {
  // Get user preferences
  getUserPreferences: async (userId) => {
    try {
      const user = await User.findById(userId).select('preferences');
      if (!user) {
        throw new Error('User not found');
      }
      
      return user.preferences;
    } catch (error) {
      throw new Error(`Failed to fetch user preferences: ${error.message}`);
    }
  },

  // Update user preferences
  updateUserPreferences: async (userId, preferencesData) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate preference values
      const allowedCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      const allowedThemes = ['light', 'dark', 'auto'];

      const updateData = {};

      if (preferencesData.currency !== undefined) {
        if (!allowedCurrencies.includes(preferencesData.currency)) {
          throw new Error(`Invalid currency. Allowed values: ${allowedCurrencies.join(', ')}`);
        }
        updateData['preferences.currency'] = preferencesData.currency;
      }

      if (preferencesData.theme !== undefined) {
        if (!allowedThemes.includes(preferencesData.theme)) {
          throw new Error(`Invalid theme. Allowed values: ${allowedThemes.join(', ')}`);
        }
        updateData['preferences.theme'] = preferencesData.theme;
      }

      // Update user preferences
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('preferences');

      return updatedUser.preferences;
    } catch (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }
  },

  // Reset user preferences to default
  resetUserPreferences: async (userId) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const defaultPreferences = {
        currency: 'INR',
        theme: 'light'
      };

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { preferences: defaultPreferences } },
        { new: true, runValidators: true }
      ).select('preferences');

      return updatedUser.preferences;
    } catch (error) {
      throw new Error(`Failed to reset preferences: ${error.message}`);
    }
  },

  // Get active sessions (refresh tokens)
  getActiveSessions: async (userId, currentToken) => {
    try {
      const user = await User.findById(userId).select('refreshTokens');
      if (!user) {
        throw new Error('User not found');
      }

      // Format sessions using stored user-agent string on token entry
      const sessions = user.refreshTokens.map((tokenObj, index) => {
        const uaString = tokenObj.device || '';
        const parser = new UAParser(uaString);
        const browser = parser.getBrowser().name || 'Unknown Browser';
        const os = parser.getOS().name || 'Unknown OS';
        const deviceLabel = `${browser} on ${os}`;

        const isCurrent = currentToken ? tokenObj.token === currentToken : false;
        const ip = tokenObj.ip || 'Unknown';
        let location = 'Unknown';
        if (isCurrent) {
          location = 'This device';
        } else if (isPrivateIp(ip)) {
          location = 'Local network';
        }

        return {
          _id: tokenObj._id,
          sessionIndex: index,
          createdAt: tokenObj.createdAt,
          expiresAt: new Date(tokenObj.createdAt.getTime() + (7 * 24 * 60 * 60 * 1000)), // 7 days
          device: deviceLabel,
          userAgent: uaString || 'Unknown',
          ip,
          location,
          isCurrent,
          lastActive: tokenObj.createdAt,
        };
      });

      return sessions;
    } catch (error) {
      throw new Error(`Failed to fetch active sessions: ${error.message}`);
    }
  },

  // Terminate specific session
  terminateSession: async (userId, sessionId, currentToken) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Determine if the session being terminated is the current one
      let wasCurrent = false;
      const remaining = [];
      for (const tokenObj of user.refreshTokens) {
        if (tokenObj._id.toString() === sessionId) {
          if (currentToken && tokenObj.token === currentToken) {
            wasCurrent = true;
          }
          // skip adding to remaining -> effectively remove
          continue;
        }
        remaining.push(tokenObj);
      }
      user.refreshTokens = remaining;

      await user.save();

      // Notify the specific session via websockets
      const Notification = require('../models/notificationModel');
      await Notification.create({
        userId,
        type: 'session_terminated',
        title: 'Session Terminated',
        message: 'Your session has been terminated from another device.',
        priority: 'High',
        data: { sessionId },
        isRead: true, // Don't show in the notification list
        isEmailSent: true // Do not send email
      });

      return { message: 'Session terminated successfully', wasCurrent };
    } catch (error) {
      throw new Error(`Failed to terminate session: ${error.message}`);
    }
  },

  // Terminate all sessions except current
  terminateAllSessions: async (userId, currentToken) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const Notification = require('../models/notificationModel');
      const removedSessions = [];

      // Keep only the current refresh token
      if (currentToken) {
        user.refreshTokens = user.refreshTokens.filter(tokenObj => {
          if (tokenObj.token === currentToken) {
            return true;
          }
          removedSessions.push(tokenObj._id.toString());
          return false;
        });
      } else {
        // If no current token provided, clear all sessions
        user.refreshTokens.forEach(t => removedSessions.push(t._id.toString()));
        user.refreshTokens = [];
      }

      await user.save();
      
      // Notify all removed sessions
      for (const sessionId of removedSessions) {
        await Notification.create({
          userId,
          type: 'session_terminated',
          title: 'Session Terminated',
          message: 'Your session has been terminated from another device.',
          priority: 'High',
          data: { sessionId },
          isRead: true,
          isEmailSent: true
        });
      }
      
      return {
        message: 'All other sessions terminated successfully',
        remainingSessions: user.refreshTokens.length
      };
    } catch (error) {
      throw new Error(`Failed to terminate sessions: ${error.message}`);
    }
  },

  // Toggle MFA enabled/disabled
  toggleMFA: async (userId, enabled) => {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { 'preferences.mfaEnabled': enabled } },
        { new: true }
      ).select('preferences');

      return updatedUser.preferences;
    } catch (error) {
      throw new Error(`Failed to toggle MFA: ${error.message}`);
    }
  },

  // Export user data
  exportUserData: async (userId) => {
    try {
      const user = await User.findById(userId).select('-password -refreshTokens');
      if (!user) {
        throw new Error('User not found');
      }

      // Include basic user info and preferences
      const exportData = {
        userInfo: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        preferences: user.preferences,
        // Add more data sections as needed
        // transactions: [], // Would come from transaction service
        // categories: [], // Would come from category service
        // etc.
      };

      return exportData;
    } catch (error) {
      throw new Error(`Failed to export user data: ${error.message}`);
    }
  }
};

module.exports = { settingsService };
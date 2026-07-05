const User = require('../models/userModel');
const JWTUtils = require('../utils/jwt');
const ResponseUtils = require('../utils/response');
const ValidationUtils = require('../utils/validation');
const registrationOtpService = require('../services/registrationOtpService');
const Transaction = require('../models/transactionModel');
const Budget = require('../models/budgetModel');
const Goal = require('../models/goalModel');
const Reminder = require('../models/reminderModel');
const Vault = require('../models/vaultModel');
const Session = require('../models/sessionModel');
const Notification = require('../models/notificationModel');
const mongoose = require('mongoose');
const { getClientIp } = require('../utils/ip');

class AuthController {
  // Send OTP for registration
  static async sendRegistrationOTP(req, res) {
    try {
      const { email, username, password } = req.body;

      // Validate input
      const validation = ValidationUtils.validateRegisterInput(req.body);
      if (!validation.isValid) {
        return ResponseUtils.validationError(res, validation.errors);
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username }]
      });

      if (existingUser) {
        const message = existingUser.email === email.toLowerCase()
          ? 'Email already exists'
          : 'Username already exists';
        return ResponseUtils.error(res, message, 400);
      }

      // Send OTP
      const result = await registrationOtpService.sendRegistrationOTP(
        email.toLowerCase(),
        username,
        password
      );

      return ResponseUtils.success(res, {
        expiresIn: result.expiresIn
      }, result.message);

    } catch (error) {
      console.error('Send registration OTP error:', error);
      return ResponseUtils.error(res, error.message || 'Failed to send OTP');
    }
  }

  // Verify OTP for registration
  static async verifyRegistrationOTP(req, res) {
    try {
      const { email, otp } = req.body;

      // Validate required fields
      if (!email || !otp) {
        return ResponseUtils.error(res, 'Email and OTP are required', 400);
      }

      const result = await registrationOtpService.verifyRegistrationOTP(
        email.toLowerCase(),
        otp
      );

      // Set the registration token as an HTTP-only cookie for security
      if (result.success && result.registrationToken) {
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 15 * 60 * 1000, // 15 minutes
          path: '/'
        };

        res.cookie('registrationToken', result.registrationToken, cookieOptions);

        // Don't send the token in the response body for security
        const responseData = { ...result };
        delete responseData.registrationToken;

        return ResponseUtils.success(res, responseData, 'OTP verified successfully');
      }

      return ResponseUtils.success(res, result, result.message);

    } catch (error) {
      console.error('Verify registration OTP error:', error);
      return ResponseUtils.error(res, error.message || 'Failed to verify OTP');
    }
  }

  // Register new user (after OTP verification)
  static async register(req, res) {
    try {
      // Extract registration token from header/body/cookie
      const authHeader = req.headers.authorization;
      const tokenFromHeader = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;
      const registrationToken =
        tokenFromHeader || req.body.registrationToken || req.cookies.registrationToken;

      if (!registrationToken) {
        return ResponseUtils.error(res, 'Registration token is required. Please verify OTP first.', 401);
      }

      // Complete registration with the token
      const result = await registrationOtpService.completeRegistration(registrationToken);

      if (!result.success) {
        return ResponseUtils.error(res, result.message, 401);
      }

      const user = result.user;

      // Generate token pair
      const { accessToken, refreshToken, sessionId } = JWTUtils.generateTokenPair(user._id);

      // Save refresh token to user with device info
      // Keep maximum 5 sessions to prevent document bloat
      if (user.refreshTokens.length >= 5) {
        user.refreshTokens = user.refreshTokens.slice(-4);
      }
      user.refreshTokens.push({
        _id: sessionId,
        token: refreshToken,
        device: req.get('user-agent'),
        ip: getClientIp(req),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Track registration as first login
      user.lastLoginAt = new Date();
      user.lastLoginProvider = 'email';

      await user.save();

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Clear registration token cookie
      res.clearCookie('registrationToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/'
      });

      // Return response
      return ResponseUtils.success(res, {
        user: user.toJSON(),
        accessToken
      }, 'User registered successfully', 201);

    } catch (error) {
      console.error('Registration error:', error);

      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return ResponseUtils.error(res, `${field} already exists`, 400);
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return ResponseUtils.validationError(res, errors);
      }

      return ResponseUtils.error(res, error.message || 'Server error during registration');
    }
  }

  // Login user
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validate input
      const validation = ValidationUtils.validateLoginInput(req.body);
      if (!validation.isValid) {
        return ResponseUtils.validationError(res, validation.errors);
      }

      // Find user by email - explicitly select password since it's marked select: false
      const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
      if (!user) {
        return ResponseUtils.unauthorized(res, 'Invalid credentials');
      }

      // Check if account is active
      if (!user.isActive) {
        return ResponseUtils.forbidden(res, 'Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return ResponseUtils.unauthorized(res, 'Invalid credentials');
      }

      // MFA check — if enabled, send OTP and return pending state
      if (user.preferences?.mfaEnabled) {
        const otpService = require('../services/otpService');
        await otpService.sendMFAOtp(user._id.toString(), user.email);
        return ResponseUtils.success(res, {
          mfaRequired: true,
          userId: user._id
        }, 'MFA OTP sent to your email');
      }

      // Generate token pair
      const { accessToken, refreshToken, sessionId } = JWTUtils.generateTokenPair(user._id);

      // Implement token rotation: keep only last 5 tokens to prevent unbounded growth
      const newToken = {
        _id: sessionId,
        token: refreshToken,
        device: req.get('user-agent'),
        ip: getClientIp(req),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $push: { refreshTokens: { $each: [newToken], $slice: -5 } },
          $set: {
            lastLoginAt: new Date(),
            lastLoginProvider: 'email'
          }
        },
        { new: true }
      );

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Return response
      return ResponseUtils.success(res, {
        user: updatedUser.toJSON(),
        accessToken
      }, 'Login successful');

    } catch (error) {
      console.error('Login error:', error);
      return ResponseUtils.error(res, 'Server error during login');
    }
  }

  // Refresh access token
  static async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return ResponseUtils.unauthorized(res, 'Refresh token not found');
      }

      // Verify refresh token
      const decoded = JWTUtils.verifyRefreshToken(refreshToken);

      if (decoded.type !== 'refresh') {
        return ResponseUtils.unauthorized(res, 'Invalid token type');
      }

      // Find user
      const user = await User.findById(decoded.userId);
      if (!user) {
        return ResponseUtils.unauthorized(res, 'User not found');
      }

      // Check if account is active
      if (!user.isActive) {
        return ResponseUtils.forbidden(res, 'Account is deactivated');
      }

      // Check if refresh token exists in user's tokens
      const tokenExists = user.refreshTokens.some(t => t.token === refreshToken);
      if (!tokenExists) {
        return ResponseUtils.unauthorized(res, 'Invalid refresh token');
      }

      // Clean up expired tokens
      await User.findByIdAndUpdate(user._id, {
        $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } }
      });

      // Generate new access token
      const newAccessToken = JWTUtils.generateAccessToken(user._id);

      return ResponseUtils.success(res, {
        user: user.toJSON(),
        accessToken: newAccessToken
      }, 'Token refreshed successfully');

    } catch (error) {
      console.error('Token refresh error:', error);
      return ResponseUtils.forbidden(res, 'Invalid refresh token');
    }
  }

  // Verify token 
  static async verifyToken(req, res) {
    try {
      // If we reach here, the token is valid (middleware already verified it)
      return ResponseUtils.success(res, {
        user: req.user,
        accessToken: req.headers.authorization?.split(' ')[1] // Return current token
      }, 'Token is valid');
    } catch (error) {
      console.error('Token verification error:', error);
      return ResponseUtils.forbidden(res, 'Token verification failed');
    }
  }

  // Logout user
  static async logout(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        // Remove refresh token from user's tokens
        await User.findByIdAndUpdate(req.user._id, {
          $pull: { refreshTokens: { token: refreshToken } }
        });
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
      });

      return ResponseUtils.success(res, null, 'Logout successful');

    } catch (error) {
      console.error('Logout error:', error);
      return ResponseUtils.error(res, 'Server error during logout');
    }
  }

  // Get user profile (public endpoint for authenticated users)
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return ResponseUtils.notFound(res, 'User not found');
      }

      if (!user.isActive) {
        return ResponseUtils.forbidden(res, 'Account is deactivated');
      }

      return ResponseUtils.success(res, {
        user: user.toJSON()
      }, 'Profile retrieved successfully');

    } catch (error) {
      console.error('Get profile error:', error);
      return ResponseUtils.error(res, 'Server error retrieving profile');
    }
  }

  //Update profile
  static async updateProfile(req, res) {
    try {
      const { username, email } = req.body;
      const userId = req.user._id;

      // Find the current user
      const user = await User.findById(userId);
      if (!user) {
        return ResponseUtils.notFound(res, 'User not found');
      }

      // Check if account is active
      if (!user.isActive) {
        return ResponseUtils.forbidden(res, 'Account is deactivated');
      }

      // Prepare update object
      const updateData = {};

      // Handle username update
      if (username && username !== user.username) {
        // Check if username is already taken
        const existingUser = await User.findOne({
          username,
          _id: { $ne: userId }
        });

        if (existingUser) {
          return ResponseUtils.error(res, 'Username already exists', 400);
        }

        updateData.username = username;
      }

      // Handle email update
      if (email && email.toLowerCase() !== user.email) {
        // Check if email is already taken
        const existingUser = await User.findOne({
          email: email.toLowerCase(),
          _id: { $ne: userId }
        });

        if (existingUser) {
          return ResponseUtils.error(res, 'Email already exists', 400);
        }

        updateData.email = email.toLowerCase();
      }

      // Check if there are any updates to make
      if (Object.keys(updateData).length === 0) {
        return ResponseUtils.error(res, 'No valid updates provided', 400);
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        {
          new: true,
          runValidators: true
        }
      );

      return ResponseUtils.success(res, {
        user: updatedUser.toJSON()
      }, 'Profile updated successfully');

    } catch (error) {
      console.error('Update profile error:', error);

      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return ResponseUtils.error(res, `${field} already exists`, 400);
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return ResponseUtils.validationError(res, errors);
      }

      return ResponseUtils.error(res, 'Server error during profile update');
    }
  }


  // Update password
  static async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const userId = req.user._id;

      // Validate required fields
      if (!currentPassword || !newPassword || !confirmPassword) {
        return ResponseUtils.error(res, 'Current password, new password, and confirm password are required', 400);
      }

      // Check if new password matches confirmation
      if (newPassword !== confirmPassword) {
        return ResponseUtils.error(res, 'New password and confirm password do not match', 400);
      }

      // Validate new password strength (customize as needed)
      if (newPassword.length < 8) {
        return ResponseUtils.error(res, 'New password must be at least 8 characters long', 400);
      }

      // Find the current user with password field
      const user = await User.findById(userId).select('+password');
      if (!user) {
        return ResponseUtils.notFound(res, 'User not found');
      }

      // Check if account is active
      if (!user.isActive) {
        return ResponseUtils.forbidden(res, 'Account is deactivated');
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return ResponseUtils.unauthorized(res, 'Current password is incorrect');
      }

      // Check if new password is different from current password
      const isSamePassword = await user.comparePassword(newPassword);
      if (isSamePassword) {
        return ResponseUtils.error(res, 'New password must be different from current password', 400);
      }

      // Update user password and clear all refresh tokens (logout from all devices)
      // Password will be automatically hashed by the User model's pre-save middleware
      user.password = newPassword;
      user.refreshTokens = []; // Clear all refresh tokens to logout from all devices

      await user.save();

      // Clear refresh token cookie from current session
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
      });

      // Log password change for security (optional)
      console.log(`Password updated for userId: ${user._id} at ${new Date().toISOString()} - Logged out from all devices`);

      return ResponseUtils.success(res, {
        message: 'Password updated successfully. You have been logged out from all devices for security.'
      }, 'Password updated successfully');

    } catch (error) {
      console.error('Update password error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return ResponseUtils.validationError(res, errors);
      }

      return ResponseUtils.error(res, 'Server error during password update');
    }
  }

  // Delete profile
  static async deleteProfile(req, res) {
    try {
      const { password, confirmDeletion } = req.body;
      const userId = req.user._id;

      const user = await User.findById(userId).select('+password');
      if (!user) {
        return ResponseUtils.notFound(res, 'User not found');
      }

      const isGoogleUser = user.lastLoginProvider === 'google';

      // Validate required fields
      if (!isGoogleUser && !password) {
        return ResponseUtils.error(res, 'Password is required to delete profile', 400);
      }

      if (!confirmDeletion || confirmDeletion !== 'DELETE') {
        return ResponseUtils.error(res, 'Please type "DELETE" to confirm profile deletion', 400);
      }

      // Verify password
      if (!isGoogleUser) {
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
          return ResponseUtils.unauthorized(res, 'Incorrect password');
        }
      }

      // Cascading delete

      await Promise.all([
        Transaction.deleteMany({ userId: userId }),
        Budget.deleteMany({ userId: userId }),
        Goal.deleteMany({ userId: userId }),
        Reminder.deleteMany({ userId: userId }),
        Vault.deleteMany({ userId: userId }),
        Session.deleteMany({ userId: userId }),
        Notification.deleteMany({ userId: userId }),
        (async () => {
          try {
            await mongoose.connection.db.collection('chat_history').deleteMany({ userId: userId.toString() });
          } catch (e) {
            console.warn('[deleteProfile] error deleting chat_history', e);
          }
        })(),
        // Verify we're targeting the right DB before deleting embeddings
        (async () => {
          const dbName = mongoose.connection.db.databaseName;
          if (!['arthflow', process.env.MONGO_DB_NAME].filter(Boolean).includes(dbName)) {
            console.warn(`[deleteProfile] Unexpected DB name: ${dbName} — skipping embedding delete`);
          } else {
            await mongoose.connection.db.collection('embeddings').deleteMany({ userId: userId.toString() });
            return mongoose.connection.db.collection('faq_embeddings').deleteMany({ userId: userId.toString() });
          }
        })(),
        User.findByIdAndDelete(userId)
      ]);

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
      });

      // Log account deletion for audit purposes
      console.log(`Account deleted for userId: ${userId} at ${new Date().toISOString()}`);

      return ResponseUtils.success(res, null, 'Profile deleted successfully');

    } catch (error) {
      console.error('Delete profile error:', error);
      return ResponseUtils.error(res, 'Server error during profile deletion');
    }
  }


  // Verify MFA OTP and complete login
  static async verifyMFA(req, res) {
    try {
      const { userId, otp } = req.body;

      if (!userId || !otp) {
        return ResponseUtils.error(res, 'userId and OTP are required', 400);
      }

      const user = await User.findById(userId);
      if (!user) return ResponseUtils.notFound(res, 'User not found');
      if (!user.isActive) return ResponseUtils.forbidden(res, 'Account is deactivated');

      const otpService = require('../services/otpService');
      await otpService.verifyMFAOtp(userId, otp);

      // OTP verified — issue tokens
      const { accessToken, refreshToken, sessionId } = JWTUtils.generateTokenPair(user._id);
      
      const newToken = {
        _id: sessionId,
        token: refreshToken,
        device: req.get('user-agent'),
        ip: getClientIp(req),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { 
          $push: { refreshTokens: { $each: [newToken], $slice: -5 } },
          $set: { lastLoginAt: new Date(), lastLoginProvider: 'email' } 
        },
        { new: true }
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return ResponseUtils.success(res, {
        user: updatedUser.toJSON(),
        accessToken
      }, 'MFA verified. Login successful.');

    } catch (error) {
      console.error('MFA verify error:', error);
      return ResponseUtils.error(res, error.message || 'MFA verification failed');
    }
  }

  // Logout from all devices
  static async logoutAll(req, res) {
    try {
      // Remove all refresh tokens
      await User.findByIdAndUpdate(req.user._id, {
        $set: { refreshTokens: [] }
      });

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
      });

      return ResponseUtils.success(res, null, 'Logged out from all devices');

    } catch (error) {
      console.error('Logout all error:', error);
      return ResponseUtils.error(res, 'Server error during logout');
    }
  }
}

module.exports = AuthController;
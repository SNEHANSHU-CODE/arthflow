const { redisService } = require('../config/redis');
const emailService = require('./emailService');
const { config } = require('../config/redis');
const JWTUtils = require('../utils/jwt');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');

class RegistrationOtpService {
  generateOTP() {
    const min = Math.pow(10, config.otp.length - 1);
    const max = Math.pow(10, config.otp.length) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  getOTPKey(email) {
    return `registration_otp:${email}`;
  }

  getAttemptsKey(email) {
    return `registration_otp_attempts:${email}`;
  }

  getRegistrationDataKey(email) {
    return `registration_data:${email}`;
  }

  getRegistrationTokenKey(email) {
    return `registration_token:${email}`;
  }

  async sendRegistrationOTP(email, username, password) {
    try {
      // Check if OTP already exists and is still valid
      const existingOTP = await redisService.get(this.getOTPKey(email));
      if (existingOTP) {
        throw new Error('OTP already sent. Please wait before requesting a new one.');
      }

      // Generate new OTP
      const otp = this.generateOTP();
      const expiryInSeconds = config.otp.expiryMinutes * 60;

      // Store OTP in Redis with expiry
      await redisService.set(this.getOTPKey(email), otp.toString(), expiryInSeconds);

      // Store registration data temporarily (encrypted password)
      const registrationData = JSON.stringify({
        email: email.toLowerCase(),
        username,
        password // Will be hashed when creating user
      });
      await redisService.set(
        this.getRegistrationDataKey(email),
        registrationData,
        expiryInSeconds
      );

      // Reset attempts counter
      await redisService.del(this.getAttemptsKey(email));

      // Send OTP via email - FIXED: Use the existing sendOTPEmail method
      await emailService.sendOTPEmail(email, otp);

      return {
        success: true,
        message: 'OTP sent successfully to your email',
        expiresIn: config.otp.expiryMinutes,
      };
    } catch (error) {
      console.error('Error sending registration OTP:', error);
      throw error;
    }
  }

  async verifyRegistrationOTP(email, inputOTP) {
    try {
      // Check if OTP exists
      const storedOTP = await redisService.get(this.getOTPKey(email));
      if (!storedOTP) {
        throw new Error('OTP not found or has expired. Please request a new one.');
      }

      // Check if registration data exists
      const registrationDataStr = await redisService.get(this.getRegistrationDataKey(email));
      if (!registrationDataStr) {
        throw new Error('Registration data not found or has expired. Please start registration again.');
      }

      // Check attempts
      const attemptsKey = this.getAttemptsKey(email);
      const attempts = await redisService.get(attemptsKey) || '0';
      const currentAttempts = parseInt(attempts);

      if (currentAttempts >= config.otp.maxAttempts) {
        // Delete OTP and registration data after max attempts
        await redisService.del(this.getOTPKey(email));
        await redisService.del(this.getRegistrationDataKey(email));
        await redisService.del(attemptsKey);
        throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
      }

      // Verify OTP
      if (storedOTP === inputOTP.toString()) {
        // OTP is correct - clean up OTP data but keep registration data
        await redisService.del(this.getOTPKey(email));
        await redisService.del(attemptsKey);

        // Generate registration token (15 minutes expiry)
        const registrationToken = JWTUtils.generateRegistrationToken(email);
        const registrationTokenExpiry = 15 * 60; // 15 minutes in seconds

        // Store registration token in Redis
        await redisService.set(
          this.getRegistrationTokenKey(email),
          registrationToken,
          registrationTokenExpiry
        );

        return {
          success: true,
          message: 'Email verified successfully',
          registrationToken: registrationToken,
          expiresIn: 15, // 15 minutes
        };
      } else {
        // Increment attempts
        await redisService.incr(attemptsKey);
        await redisService.expire(attemptsKey, config.otp.expiryMinutes * 60);

        const remainingAttempts = config.otp.maxAttempts - (currentAttempts + 1);
        throw new Error(`Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`);
      }
    } catch (error) {
      console.error('Error verifying registration OTP:', error);
      throw error;
    }
  }

  async completeRegistration(token) {
    try {
      // Validate input
      if (!token) {
        throw new Error('Registration token is required');
      }

      // Verify the registration token
      let decoded;
      try {
        decoded = JWTUtils.verifyRegistrationToken(token);
      } catch (error) {
        throw new Error('Invalid or expired registration token');
      }

      const email = decoded.email.toLowerCase().trim();

      // Check if token exists in Redis
      const storedToken = await redisService.get(this.getRegistrationTokenKey(email));
      if (!storedToken || storedToken !== token) {
        throw new Error('Invalid or expired registration token. Please verify OTP again.');
      }

      // Get registration data from Redis
      const registrationDataStr = await redisService.get(this.getRegistrationDataKey(email));
      if (!registrationDataStr) {
        throw new Error('Registration data not found or has expired. Please start registration again.');
      }

      const registrationData = JSON.parse(registrationDataStr);

      // Check if user already exists (double-check)
      const existingUser = await User.findOne({
        $or: [
          { email: registrationData.email },
          { username: registrationData.username }
        ]
      });

      if (existingUser) {
        // Clean up Redis data
        await redisService.del(this.getRegistrationDataKey(email));
        await redisService.del(this.getRegistrationTokenKey(email));

        const message = existingUser.email === registrationData.email
          ? 'Email already exists'
          : 'Username already exists';
        throw new Error(message);
      }

      // Create new user
      const user = new User({
        username: registrationData.username,
        email: registrationData.email,
        password: registrationData.password // Will be hashed by mongoose pre-save hook
      });

      await user.save();

      // Clean up Redis data
      await redisService.del(this.getRegistrationDataKey(email));
      await redisService.del(this.getRegistrationTokenKey(email));

      // Log successful registration
      console.log(`New user registered: ${user._id} at ${new Date().toISOString()}`);

      return {
        success: true,
        user: user,
        message: 'Registration completed successfully',
      };
    } catch (error) {
      console.error('Error completing registration:', error);
      throw error;
    }
  }
}

module.exports = new RegistrationOtpService();
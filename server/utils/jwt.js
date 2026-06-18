const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_RESET_SECRET = process.env.JWT_RESET_SECRET || 'your-reset-secret-key';
const JWT_REGISTRATION_SECRET = process.env.JWT_REGISTRATION_SECRET || 'your-registration-secret-key';

class JWTUtils {
  static generateAccessToken(userId, sessionId = null) {
    return jwt.sign(
      { userId, type: 'access', sessionId },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  static generateRefreshToken(userId, sessionId = null) {
    return jwt.sign(
      { userId, type: 'refresh', sessionId },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
  }

  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  static verifyResetToken(token){
    try{
      return jwt.verify(token, JWT_RESET_SECRET);
    } catch (error) {
      throw new Error('Invalid reset token');
    }
  }

  static generateTokenPair(userId, sessionId = null) {
    const mongoose = require('mongoose');
    const sid = sessionId || new mongoose.Types.ObjectId().toString();
    return {
      accessToken: this.generateAccessToken(userId, sid),
      refreshToken: this.generateRefreshToken(userId, sid),
      sessionId: sid
    };
  }

  static generatePasswordResetToken(email) {
    return jwt.sign(
      {
        email: email,
        type: 'password_reset'
      },
      JWT_RESET_SECRET,
      {
        expiresIn: '15m' // 15 minutes for password reset
      }
    );
  }

  static generateRegistrationToken(email) {
    return jwt.sign(
      {
        email: email.toLowerCase(),
        type: 'registration'
      },
      JWT_REGISTRATION_SECRET,
      {
        expiresIn: '15m' // 15 minutes for registration completion
      }
    );
  }

  static verifyRegistrationToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_REGISTRATION_SECRET);
      if (decoded.type !== 'registration') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired registration token');
    }
  }
}

module.exports = JWTUtils;
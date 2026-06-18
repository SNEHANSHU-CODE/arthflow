const User = require('../models/userModel');
const JWTUtils = require('../utils/jwt');
const ResponseUtils = require('../utils/response');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return ResponseUtils.unauthorized(res, 'Access token required');
    }

    const decoded = JWTUtils.verifyAccessToken(token);
    
    if (decoded.type !== 'access') {
      return ResponseUtils.unauthorized(res, 'Invalid token type');
    }

    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return ResponseUtils.unauthorized(res, 'User not found');
    }

    if (!user.isActive) {
      return ResponseUtils.forbidden(res, 'Account is deactivated');
    }

    // Validate that the session is still active
    if (decoded.sessionId) {
      const isSessionActive = user.refreshTokens.some(rt => rt._id.toString() === decoded.sessionId);
      if (!isSessionActive) {
        return ResponseUtils.unauthorized(res, 'Session terminated');
      }
    }
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return ResponseUtils.unauthorized(res, 'Invalid or expired token');
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = JWTUtils.verifyAccessToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        let isSessionActive = true;
        if (decoded.sessionId) {
          isSessionActive = user.refreshTokens.some(rt => rt._id.toString() === decoded.sessionId);
        }
        
        if (isSessionActive) {
          req.user = user;
          req.userId = user._id;
        }
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return ResponseUtils.forbidden(res, 'Admin access required');
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin
};
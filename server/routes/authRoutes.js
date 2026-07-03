const express = require('express');
const AuthController = require('../controllers/authControllers');
const GoogleOAuthController = require('../auth/controllers/google.controller');
const { authenticateToken } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');

const authRouter = express.Router();

// Strict limiter for endpoints highly susceptible to brute force
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Standard limiter for other public auth endpoints
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// --- Google OAuth Routes ---
authRouter.get('/google/start', GoogleOAuthController.startOAuth);

// Public routes
authRouter.post('/register/send-otp', standardLimiter, AuthController.sendRegistrationOTP);
authRouter.post('/register/verify-otp', strictLimiter, AuthController.verifyRegistrationOTP);
authRouter.post('/register', standardLimiter, AuthController.register);
authRouter.post('/login', strictLimiter, AuthController.login);
authRouter.post('/mfa/verify', strictLimiter, AuthController.verifyMFA);
authRouter.post('/refresh', standardLimiter, AuthController.refreshToken);

// Protected routes
authRouter.get('/profile', authenticateToken, AuthController.getProfile);
authRouter.post('/logout', authenticateToken, AuthController.logout);
authRouter.post('/logout-all', authenticateToken, AuthController.logoutAll);
authRouter.put('/profile', authenticateToken, AuthController.updateProfile);
authRouter.put('/updatePassword', authenticateToken, AuthController.updatePassword);
authRouter.delete('/deleteaccount', authenticateToken, AuthController.deleteProfile);
authRouter.get('/verify', authenticateToken, AuthController.verifyToken);

module.exports = authRouter;
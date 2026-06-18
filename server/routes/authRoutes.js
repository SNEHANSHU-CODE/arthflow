const express = require('express');
const AuthController = require('../controllers/authControllers');
const GoogleOAuthController = require('../auth/controllers/google.controller');
const { authenticateToken } = require('../middleware/auth');

const authRouter = express.Router();

// --- Google OAuth Routes ---
authRouter.get('/google/start', GoogleOAuthController.startOAuth);

// Public routes
authRouter.post('/register/send-otp', AuthController.sendRegistrationOTP);
authRouter.post('/register/verify-otp', AuthController.verifyRegistrationOTP);
authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.post('/mfa/verify', AuthController.verifyMFA);
authRouter.post('/refresh', AuthController.refreshToken);

// Protected routes
authRouter.get('/profile', authenticateToken, AuthController.getProfile);
authRouter.post('/logout', authenticateToken, AuthController.logout);
authRouter.post('/logout-all', authenticateToken, AuthController.logoutAll);
authRouter.put('/profile', authenticateToken, AuthController.updateProfile);
authRouter.put('/updatePassword', authenticateToken, AuthController.updatePassword);
authRouter.delete('/deleteaccount', authenticateToken, AuthController.deleteProfile);
authRouter.get('/verify', authenticateToken, AuthController.verifyToken);

module.exports = authRouter;
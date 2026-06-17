const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { redisService } = require('./config/redis');
const emailService = require('./services/emailService');
const reminderService = require('./services/reminderService');
const queryLogger = require('./middleware/queryLogger');

const { errorHandler } = require('./utils/errorHandler');

// Importing all Routes
const authRoutes = require('./routes/authRoutes');
const resetPasswordRoutes = require('./routes/resetPasswordRoute');
const transactionRoutes = require('./routes/transactionRoutes');
const goalRouter = require('./routes/goalRoutes');
const reminderRouter = require('./routes/reminderRoutes');
const settingsRouter = require('./routes/settingsRoutes');
const googleRouter = require('./routes/googleRoutes');
const vaultRouter = require('./routes/vaultRoutes');
const budgetRouter = require('./routes/budgetRoutes');
const notificationRouter = require('./routes/notificationRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Required on Render: proxy terminates HTTPS, so Express must trust
// X-Forwarded-Proto to correctly set secure cookies and get real client IP
app.set('trust proxy', 1);

const corsOptions = {
  origin: [
    process.env.CLIENT_URL,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'x-timezone', 'x-request-timestamp', 'x-locale'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions))
app.use(express.json({ limit: '25mb' })); // with 25mb limit for file uploads in vault
app.use(cookieParser());
// Performance monitoring middleware - logs slow queries
app.use(queryLogger);

// Import Google Controller for direct routes
const GoogleOAuthController = require('./auth/controllers/google.controller');

// Direct route for Google OAuth callback (not under /api)
// Google redirects to http://localhost:5000/auth/google
app.get('/auth/google', GoogleOAuthController.handleCallback);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/reset', resetPasswordRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/goals', goalRouter);
app.use('/api/reminders', reminderRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/google', googleRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/notifications', notificationRouter);


//Keep my server alive
app.get('/api/ping', (req, res) => {
  res.send('pong');
});

// Centralized error handler (must be registered after all routes)
app.use(errorHandler);

// Initialize token cleanup job
const { initializeTokenCleanupJob } = require('./jobs/tokenCleanup');

// Initialize Redis and start server
async function initializeRedis() {
  try {
    // Connect to Redis
    await redisService.connect();
    console.log('Redis connected successfully');

    // Verify email service
    const emailConnected = await emailService.verifyConnection();
    if (!emailConnected) {
      console.warn('Email service verification failed, but server will continue');
    }
    
    // Start token cleanup job
    try {
      initializeTokenCleanupJob();
      console.log('Token cleanup job initialized');
    } catch (error) {
      console.warn('⚠️ Token cleanup job initialization failed:', error.message);
    }

  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    process.exit(1);
  }
}

// Setup graceful shutdown for Redis
redisService.setupGracefulShutdown();

// Initialize Redis when server starts
initializeRedis();

//Send reminder in every 5 min
function startReminderChecker() {
  console.log('Reminder email service started...');
  setInterval(async () => {
  try {
    await reminderService.checkAndSendReminders();
  } catch (err) {
    console.error('[ReminderCron] check failed:', err.message);
  }
}, 5 * 60 * 1000);
}

startReminderChecker();

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
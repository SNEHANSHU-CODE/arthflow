/**
 * Monthly Financial Report Cron Job — runs on the ANALYTICS server
 *
 * Fires at 00:00 on the 1st of every month.
 * Sends the previous month's financial report PDF to all active users.
 *
 * Required env vars (analytics server .env):
 *   MONGO_URI        — shared MongoDB (same as main server)
 *   RESEND_API_KEY   — copy from main server .env
 *   EMAIL_DOMAIN     — e.g. arthflow.vercel.app
 *   APP_URL          — e.g. https://arthflow.vercel.app
 *
 * Usage (analytics server entry point):
 *   const cron = require('./monthlyReportCron');
 *   cron.start();
 *
 *   // Manual test (skips date check):
 *   cron.triggerNow();
 *   cron.triggerNow({ year: 2026, month: 2 }); // specific month
 */

const cron = require('node-cron');
const monthlyReportService = require('./monthlyReportService');

class MonthlyReportCron {
  constructor() {
    this.task = null;
    this.isRunning = false;
  }

  /**
   * Core execution task.
   * Prevents overlapping runs with isRunning guard.
   */
  async _executeJob() {
    if (this.isRunning) {
      console.warn('⚠️  Monthly report job already running — skipping duplicate trigger');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Monthly report job started at ${new Date().toISOString()}`);

    try {
      await monthlyReportService.sendReportsToAllUsers();
      console.log('✅ Monthly report job completed successfully');
    } catch (err) {
      console.error('❌ Monthly report job failed:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  /** Start the cron task */
  start() {
    if (this.task) {
      console.warn('⚠️  Monthly report cron already started');
      return;
    }

    console.log('📅 Monthly report cron initialized. Scheduled for 00:00 on the 1st of every month.');
    // Cron syntax: minute hour day-of-month month day-of-week
    this.task = cron.schedule('0 0 1 * *', () => this._executeJob());
  }

  stop() {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    console.log('🛑 Monthly report cron stopped');
  }

  /**
   * Manually trigger for testing / backfill — bypasses the date check.
   * Pass an explicit { year, month } to target a specific period (1-indexed month).
   */
  async triggerNow(overrideMonth = null) {
    if (this.isRunning) {
      console.warn('⚠️  Job already running');
      return;
    }
    this.isRunning = true;
    console.log('🔧 Manual trigger: monthly report job');
    try {
      await monthlyReportService.sendReportsToAllUsers(overrideMonth);
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new MonthlyReportCron();
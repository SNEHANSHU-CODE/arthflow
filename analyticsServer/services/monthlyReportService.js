/**
 * Monthly Report Service — runs on the ANALYTICS server
 *
 * Dependencies (all local to the analytics server):
 *   ../models/User      — shared Mongoose model, same MongoDB as main server
 *   ./analyticsService  — already present on analytics server
 *   ./pdfReportService  — already present on analytics server
 *   ./emailService      — copy of main server's emailService (needs RESEND_API_KEY env var)
 *
 * Prerequisite: connectDB() must be called before this service is used.
 * The analytics server's existing startup (db.js) already handles this.
 */

const fs               = require('fs');
const path             = require('path');
const os               = require('os');
const User             = require('../models/User');
const analyticsService = require('./analyticsService');
const pdfReportService = require('./pdfReportService');
const emailService     = require('./emailService');

class MonthlyReportService {
  /**
   * Build the previous month's date range.
   * If overrideMonth is provided as { year, month } (1-indexed), use that instead.
   */
  _getPreviousMonthRange(overrideMonth = null) {
    const now = new Date();

    let year, month; // month is 1-indexed

    if (overrideMonth) {
      ({ year, month } = overrideMonth);
    } else {
      // Previous month
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year  = prev.getFullYear();
      month = prev.getMonth() + 1; // 1-indexed
    }

    return {
      year,
      month,
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate:   `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
      monthLabel: new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    };
  }

  /** Fetch all analytics for a user in one go */
  async _fetchAnalytics(userId, startDate, endDate) {
    const [
      dashboard,
      spendingTrends,
      categoryAnalysis,
      goalsProgress,
      incomeTrends,
      savingsTrends,
      transactionInsights,
      budgetPerformance,
      currentMonthAnalytics
    ] = await Promise.allSettled([
      analyticsService.getDashboardData(userId, startDate, endDate),
      analyticsService.getSpendingTrends(userId, startDate, endDate),
      analyticsService.getCategoryAnalysis(userId, startDate, endDate),
      analyticsService.getGoalsProgress?.(userId)           ?? Promise.resolve({}),
      analyticsService.getIncomeTrends?.(userId, startDate, endDate) ?? Promise.resolve({}),
      analyticsService.getSavingsTrends?.(userId, startDate, endDate) ?? Promise.resolve({}),
      analyticsService.getTransactionInsights?.(userId, startDate, endDate) ?? Promise.resolve({}),
      analyticsService.getBudgetPerformance(userId, startDate, endDate),
      analyticsService.getCurrentMonthAnalytics(userId),
    ]);

    // Use fulfilled value or empty fallback — never crash the whole job for one missing slice
    const val = (result) => result.status === 'fulfilled' ? result.value : {};

    return {
      dashboard:            val(dashboard),
      spendingTrends:       val(spendingTrends),
      categoryAnalysis:     val(categoryAnalysis),
      goalsProgress:        val(goalsProgress),
      incomeTrends:         val(incomeTrends),
      savingsTrends:        val(savingsTrends),
      transactionInsights:  val(transactionInsights),
      budgetPerformance:    val(budgetPerformance),
      currentMonthAnalytics: val(currentMonthAnalytics),
    };
  }

  /** Generate PDF to a temp file, return its path */
  async _generatePDF(analyticsData, dateRange, userInfo, monthLabel) {
    const safeName  = userInfo.email.replace(/[^a-z0-9]/gi, '_');
    const tmpPath   = path.join(os.tmpdir(), `report_${safeName}_${Date.now()}.pdf`);

    await pdfReportService.generateFinancialReport(
      analyticsData,
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
      userInfo,
      tmpPath
    );

    return tmpPath;
  }

  /** Send report for a single user — isolated so one failure doesn't block others */
  async _processUser(user, dateRange) {
    const userId   = user._id.toString();
    const userInfo = { name: user.username, email: user.email };

    console.log(`  📧 Processing: ${user.email}`);

    let pdfPath = null;
    try {
      const analyticsData = await this._fetchAnalytics(userId, dateRange.startDate, dateRange.endDate);

      pdfPath = await this._generatePDF(analyticsData, dateRange, userInfo, dateRange.monthLabel);

      const summary = analyticsData.dashboard?.monthly?.summary || {};
      await emailService.sendMonthlyReportEmail(user.email, {
        name:          user.username,
        monthLabel:    dateRange.monthLabel,
        totalIncome:   summary.totalIncome   || 0,
        totalExpenses: summary.totalExpenses || 0,
        netSavings:    summary.netSavings    || 0,
        savingsRate:   summary.savingsRate   || 0,
        pdfPath,
      });

      console.log(`  ✅ Report sent to ${user.email}`);
    } catch (err) {
      console.error(`  ❌ Failed for ${user.email}:`, err.message);
      throw err;
    } finally {
      // Always clean up the temp PDF
      if (pdfPath && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }
  }

  /**
   * Main entry point — called by the cron.
   * Fetches all active users and sends reports sequentially
   * (avoids hammering the DB / email service concurrently).
   */
  async sendReportsToAllUsers(overrideMonth = null) {
    const dateRange = this._getPreviousMonthRange(overrideMonth);
    console.log(`\n📊 Sending ${dateRange.monthLabel} reports`);
    console.log(`   Period: ${dateRange.startDate} → ${dateRange.endDate}`);

    const users = await User.find({ isActive: true }).select('_id username email').lean();
    console.log(`   Users found: ${users.length}`);

    let sent = 0, failed = 0;

    for (const user of users) {
      try {
        await this._processUser(user, dateRange);
        sent++;
      } catch {
        failed++;
      }
    }

    console.log(`\n📬 Done — sent: ${sent}, failed: ${failed}\n`);
    return { sent, failed, total: users.length };
  }
}

module.exports = new MonthlyReportService();
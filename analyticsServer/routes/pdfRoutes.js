const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticateGraphQL } = require('../middleware/auth');
const AnalyticsService = require('../services/analyticsService');
const PdfReportService = require('../services/pdfReportService');
const User = require('../models/User');

/**
 * POST /api/pdf/generate-report
 * Generate and download financial report PDF
 * 
 * Body: {
 *   startDate: "2024-01-01",
 *   endDate: "2024-12-31"
 * }
 */
router.post('/generate-report', async (req, res) => {
  let tempFilePath = null;
  try {
    // Authenticate user from Authorization header
    const authData = authenticateGraphQL(req);
    const userId = authData.user.id;
    const userEmail = authData.user.email;

    // Fetch user details
    const user = await User.findById(userId).select('username email');
    const userName = user?.username || user?.email || userEmail || 'User';

    const { startDate, endDate, currencySymbol } = req.body;

    // Validate inputs
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    // Fetch all analytics data
    console.log(`📊 Generating report for user: ${userName}, Period: ${startDate} to ${endDate}`);

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
    ] = await Promise.all([
      AnalyticsService.getDashboardData(userId, startDate, endDate),
      AnalyticsService.getSpendingTrends(userId, startDate, endDate),
      AnalyticsService.getCategoryAnalysis(userId, startDate, endDate),
      AnalyticsService.getGoalsProgress(userId),
      AnalyticsService.getIncomeTrends(userId, startDate, endDate),
      AnalyticsService.getSavingsTrends(userId, startDate, endDate),
      AnalyticsService.getTransactionInsights(userId, startDate, endDate),
      AnalyticsService.getBudgetPerformance(userId, startDate, endDate),
      AnalyticsService.getCurrentMonthAnalytics(userId)
    ]);

    const analyticsData = {
      dashboard,
      spendingTrends,
      categoryAnalysis,
      goalsProgress,
      incomeTrends,
      savingsTrends,
      transactionInsights,
      budgetPerformance,
      currentMonthAnalytics
    };

    const dateRange = { startDate, endDate };
    const fileName = `Financial_Report_${startDate}_to_${endDate}_${Date.now()}.pdf`;
    tempFilePath = path.join(os.tmpdir(), fileName);

    // Generate PDF
    const pdfResult = await PdfReportService.generateFinancialReport(
      analyticsData,
      dateRange,
      { name: userName, email: user?.email || userEmail },
      tempFilePath,
      currencySymbol || '₹'
    );

    if (!pdfResult.success) {
      return res.status(500).json({
        success: false,
        message: pdfResult.message
      });
    }

    // Read and send file
    const filePath = pdfResult.filePath;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      
      // Clean up: delete file after sending (regardless of success/failure)
      setTimeout(() => {
        fs.unlink(filePath, (deleteErr) => {
          if (deleteErr && deleteErr.code !== 'ENOENT') {
            console.error('Error deleting temp file:', deleteErr);
          }
        });
      }, 1000);
    });

  } catch (error) {
    console.error('Error generating report:', error);
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    res.status(500).json({
      success: false,
      message: `Failed to generate report: ${error.message}`
    });
  }
});

/**
 * GET /api/pdf/health
 * Check PDF service health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdf-report-service',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

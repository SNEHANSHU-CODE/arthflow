const PdfPrinter = require('pdfmake/src/printer');
const fs = require('fs');
const path = require('path');

/**
 * PDF Report Generator Service
 * Generates detailed financial reports using PDFMake
 */
class PdfReportService {
  constructor() {
    let fonts = {};
    const fontDir = path.join(__dirname, '../fonts');
    
    // Always use Helvetica fonts (built-in)
    const helveticaFonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };

    this.printer = new PdfPrinter(helveticaFonts);
    this.useCustomFonts = false; // Not using custom fonts
    console.log('📄 Using Helvetica fonts (built-in)');
  }

  /**
   * Generate complete financial report PDF
   * Validates data before generation and handles errors gracefully
   */
  async generateFinancialReport(analyticsData, dateRange, userInfo, fileName = null) {
    try {
      // Validate required data
      if (!analyticsData || typeof analyticsData !== 'object') {
        throw new Error('Invalid analytics data provided');
      }

      if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
        throw new Error('Date range is required');
      }

      // Validate empty data case (user with no transactions)
      const hasData = analyticsData.dashboard?.monthly?.summary?.totalIncome > 0 ||
                      analyticsData.dashboard?.monthly?.summary?.totalExpenses > 0;
      
      if (!hasData) {
        console.warn('⚠️ Generating PDF for user with no transaction data');
      }

      console.log(`📄 Generating PDF report (${fileName || 'default'})`);

      const docDefinition = this.buildReportDocument(analyticsData, dateRange, userInfo);
      const generatedFileName = fileName || `Financial_Report_${Date.now()}.pdf`;
      
      return new Promise((resolve, reject) => {
        // Create write stream with error handling
        let writeStream;
        try {
          writeStream = fs.createWriteStream(generatedFileName);
        } catch (err) {
          return reject(new Error(`Failed to create write stream: ${err.message}`));
        }
        
        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        
        // Handle pipe errors
        pdfDoc.on('error', (err) => {
          writeStream.destroy();
          reject(new Error(`PDF creation error: ${err.message}`));
        });

        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        writeStream.on('finish', () => {
          console.log(`✅ PDF generated successfully: ${generatedFileName}`);
          resolve({
            success: true,
            filePath: generatedFileName,
            fileName: generatedFileName,
            message: 'PDF generated successfully'
          });
        });

        writeStream.on('error', (error) => {
          console.error(`❌ Write stream error: ${error.message}`);
          reject(new Error(`PDF write error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error('❌ Error generating PDF:', error.message);
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  /**
   * Build the PDF document structure
   */
  buildReportDocument(analyticsData, dateRange, userInfo) {
    console.log('📄 Building PDF document with Helvetica fonts');
    const {
      dashboard = {},
      spendingTrends = {},
      categoryAnalysis = {},
      goalsProgress = {},
      incomeTrends = {},
      savingsTrends = {},
      transactionInsights = {},
      budgetPerformance = {},
      currentMonthAnalytics = {}
    } = analyticsData;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      fonts: {
        Roboto: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        }
      },
      styles: this.getStyles(),
      defaultStyle: { font: 'Roboto' },
      header: (currentPage, pageCount) => this.getHeader(currentPage, pageCount, userInfo),
      footer: (currentPage, pageCount) => this.getFooter(currentPage, pageCount),
      content: [
        // Title Page
        { text: 'Financial Report', style: 'reportTitle' },
        { text: `${dateRange.startDate} to ${dateRange.endDate}`, style: 'subtitle' },
        { text: `Generated on ${new Date().toLocaleDateString()}`, style: 'dateGenerated' },
        { text: '', margin: [0, 20] },

        // User Information
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: 'Account Holder:', style: 'label', border: [false, false, false, false] },
                { text: userInfo?.name || 'N/A', style: 'value', border: [false, false, false, false] }
              ],
              [
                { text: 'Email:', style: 'label', border: [false, false, false, false] },
                { text: userInfo?.email || 'N/A', style: 'value', border: [false, false, false, false] }
              ],
              [
                { text: 'Report Period:', style: 'label', border: [false, false, false, false] },
                { text: `${dateRange.startDate} to ${dateRange.endDate}`, style: 'value', border: [false, false, false, false] }
              ]
            ]
          },
          margin: [0, 0, 0, 20]
        },

        // Executive Summary
        { text: 'Executive Summary', style: 'heading' },
        this.buildExecutiveSummary(dashboard, currentMonthAnalytics),
        { text: '', margin: [0, 20] },

        // Dashboard Overview
        { text: 'Dashboard Overview', style: 'heading' },
        this.buildDashboardSection(dashboard),
        { text: '', margin: [0, 20] },

        // Page Break
        { text: '', pageBreak: 'before' },

        // Spending Analysis
        { text: 'Spending Analysis', style: 'heading' },
        this.buildSpendingSection(spendingTrends, categoryAnalysis),
        { text: '', margin: [0, 20] },

        // Income Analysis
        { text: 'Income Analysis', style: 'heading' },
        this.buildIncomeSection(incomeTrends),
        { text: '', margin: [0, 20] },

        // Page Break
        { text: '', pageBreak: 'before' },

        // Savings Analysis
        { text: 'Savings Analysis', style: 'heading' },
        this.buildSavingsSection(savingsTrends),
        { text: '', margin: [0, 20] },

        // Goals Progress
        { text: 'Goals Progress', style: 'heading' },
        this.buildGoalsSection(goalsProgress),
        { text: '', margin: [0, 20] },

        // Page Break
        { text: '', pageBreak: 'before' },

        // Budget Performance
        { text: 'Budget Performance', style: 'heading' },
        this.buildBudgetSection(budgetPerformance),
        { text: '', margin: [0, 20] },

        // Transaction Insights
        { text: 'Transaction Insights', style: 'heading' },
        this.buildTransactionInsightsSection(transactionInsights),
        { text: '', margin: [0, 20] },

        // Current Month Summary
        { text: '', pageBreak: 'before' },
        { text: 'Current Month Summary', style: 'heading' },
        this.buildCurrentMonthSection(currentMonthAnalytics),
        { text: '', margin: [0, 20] },

        // Recommendations
        { text: 'Recommendations', style: 'heading' },
        this.buildRecommendationsSection(analyticsData),
        { text: '', margin: [0, 20] },

        // Financial Tips
        { text: 'Financial Tips', style: 'heading' },
        this.buildTipsSection(),
      ]
    };

    return docDefinition;
  }

  /**
   * Get PDF styles
   */
  getStyles() {
    return {
      reportTitle: {
        fontSize: 32,
        bold: true,
        margin: [0, 0, 0, 10],
        color: '#1a5490'
      },
      subtitle: {
        fontSize: 18,
        color: '#555',
        margin: [0, 0, 0, 5]
      },
      dateGenerated: {
        fontSize: 12,
        color: '#999',
        italics: true
      },
      heading: {
        fontSize: 18,
        bold: true,
        margin: [0, 15, 0, 10],
        color: '#1a5490',
        border: [false, false, false, true],
        borderColor: '#ddd',
        borderWidth: 2
      },
      subHeading: {
        fontSize: 14,
        bold: true,
        margin: [0, 10, 0, 5],
        color: '#2d5aa8'
      },
      normal: {
        fontSize: 11,
        margin: [0, 0, 0, 3],
        color: '#333'
      },
      small: {
        fontSize: 10,
        color: '#666'
      },
      label: {
        fontSize: 11,
        bold: true,
        color: '#444'
      },
      positive: {
        color: '#27ae60',
        bold: true
      },
      negative: {
        color: '#e74c3c',
        bold: true
      },
      neutral: {
        color: '#f39c12',
        bold: true
      },
      tableHeader: {
        bold: true,
        fillColor: '#ecf0f1',
        color: '#1a5490',
        alignment: 'center'
      }
    };
  }

  /**
   * Get PDF header
   */
  getHeader(currentPage, pageCount, userInfo) {
    return {
      columns: [
        {
          text: userInfo?.name || userInfo?.email || 'Financial Report',
          style: 'label',
          margin: [40, 20, 0, 0]
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: 'right',
          margin: [0, 20, 40, 0],
          style: 'small'
        }
      ]
    };
  }

  /**
   * Get PDF footer
   */
  getFooter(currentPage, pageCount) {
    return {
      columns: [
        {
          text: '© ArthFlow - Confidential',
          alignment: 'left',
          margin: [40, 0, 0, 20],
          style: 'small'
        },
        {
          text: new Date().toLocaleDateString(),
          alignment: 'right',
          margin: [0, 0, 40, 20],
          style: 'small'
        }
      ]
    };
  }

  /**
   * Build Executive Summary Section
   */
  buildExecutiveSummary(dashboard, currentMonth) {
    const summary = dashboard?.monthly?.summary || {};
    const currentMonthSummary = currentMonth?.summary || {};

    return {
      columns: [
        {
          width: '50%',
          stack: [
            { text: 'Period Overview', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [
                  [{ text: 'Metric', style: 'tableHeader' }, { text: 'Amount', style: 'tableHeader' }],
                  ['Total Income', { text: `${(summary.totalIncome || 0).toFixed(2)}`, style: 'positive' }],
                  ['Total Expenses', { text: `${(summary.totalExpenses || 0).toFixed(2)}`, style: 'negative' }],
                  ['Net Savings', { text: `${(summary.netSavings || 0).toFixed(2)}`, style: 'positive' }],
                  ['Savings Rate', { text: `${(summary.savingsRate || 0).toFixed(2)}%`, style: 'neutral' }]
                ]
              }
            }
          ]
        },
        {
          width: '50%',
          stack: [
            { text: 'Current Month', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [
                  [{ text: 'Metric', style: 'tableHeader' }, { text: 'Amount', style: 'tableHeader' }],
                  ['Income', { text: `${(currentMonthSummary.totalIncome || 0).toFixed(2)}`, style: 'positive' }],
                  ['Expenses', { text: `${(currentMonthSummary.totalExpenses || 0).toFixed(2)}`, style: 'negative' }],
                  ['Savings', { text: `${(currentMonthSummary.netSavings || 0).toFixed(2)}`, style: 'positive' }],
                  ['Savings %', { text: `${(currentMonthSummary.savingsRate || 0).toFixed(2)}%`, style: 'neutral' }]
                ]
              }
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Dashboard Section
   */
  buildDashboardSection(dashboard) {
    const recent = dashboard?.recent || [];
    
    const recentTransactions = recent.slice(0, 5).map(txn => [
      txn.description || txn.category,
      txn.category,
      txn.date,
      { text: `${(txn.amount || 0).toFixed(2)}`, alignment: 'right' },
      { text: (txn.type || 'unknown').toUpperCase(), style: (txn.type || '' ) === 'income' ? 'positive' : 'negative' }
    ]);

    return {
      stack: [
        { text: 'Recent Transactions', style: 'subHeading', margin: [0, 0, 0, 8] },
        {
          layout: 'lightHorizontalLines',
          table: {
            headerRows: 1,
            widths: ['25%', '20%', '15%', '15%', '25%'],
            body: [
              [
                { text: 'Description', style: 'tableHeader' },
                { text: 'Category', style: 'tableHeader' },
                { text: 'Date', style: 'tableHeader' },
                { text: 'Amount', style: 'tableHeader' },
                { text: 'Type', style: 'tableHeader' }
              ],
              ...recentTransactions
            ]
          }
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Spending Analysis Section
   */
  buildSpendingSection(spendingTrends, categoryAnalysis) {
    const trends = spendingTrends?.trends || [];
    const categories = categoryAnalysis?.categories || [];

    const trendsTable = trends.slice(0, 6).map(t => [
      t.monthYear,
      { text: `${(t.totalIncome || 0).toFixed(2)}`, alignment: 'right', style: 'positive' },
      { text: `${(t.totalExpenses || 0).toFixed(2)}`, alignment: 'right', style: 'negative' },
      { text: `${(t.netSavings || 0).toFixed(2)}`, alignment: 'right', style: 'positive' }
    ]);

    const categoryTable = categories.slice(0, 8).map(c => [
      c.category,
      { text: `${(c.amount || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(c.percentage || 0).toFixed(2)}%`, alignment: 'right' }
    ]);

    return {
      columns: [
        {
          width: '50%',
          stack: [
            { text: 'Monthly Trends', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['25%', '25%', '25%', '25%'],
                body: [
                  [
                    { text: 'Month', style: 'tableHeader' },
                    { text: 'Income', style: 'tableHeader' },
                    { text: 'Expenses', style: 'tableHeader' },
                    { text: 'Savings', style: 'tableHeader' }
                  ],
                  ...trendsTable
                ]
              }
            }
          ]
        },
        {
          width: '50%',
          stack: [
            { text: 'Category Breakdown', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['40%', '30%', '30%'],
                body: [
                  [
                    { text: 'Category', style: 'tableHeader' },
                    { text: 'Amount', style: 'tableHeader' },
                    { text: 'Percentage', style: 'tableHeader' }
                  ],
                  ...categoryTable
                ]
              }
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Income Section
   */
  buildIncomeSection(incomeTrends) {
    const trends = incomeTrends?.trends || [];
    const avgIncome = incomeTrends?.averageMonthlyIncome || 0;

    const incomeTable = trends.slice(0, 6).map(t => [
      t.monthYear,
      { text: `${(t.totalIncome || 0).toFixed(2)}`, alignment: 'right', style: 'positive' }
    ]);

    return {
      stack: [
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'Monthly Income Trends', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['50%', '50%'],
                    body: [
                      [
                        { text: 'Month', style: 'tableHeader' },
                        { text: 'Income', style: 'tableHeader' }
                      ],
                      ...incomeTable
                    ]
                  }
                }
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'Summary Statistics', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['*', '*'],
                    body: [
                      [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
                      ['Average Monthly Income', { text: `${(avgIncome || 0).toFixed(2)}`, style: 'positive' }],
                      ['Total Months', trends.length.toString()],
                      ['Highest Month', trends.length > 0 ? trends.reduce((max, t) => t.totalIncome > max.totalIncome ? t : max).monthYear : 'N/A']
                    ]
                  }
                }
              ]
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Savings Section
   */
  buildSavingsSection(savingsTrends) {
    const trends = savingsTrends?.trends || [];
    const avgSavings = savingsTrends?.averageMonthlySavings || 0;
    const totalSavings = savingsTrends?.totalSavings || 0;
    const bestMonth = savingsTrends?.bestMonth || {};

    const savingsTable = trends.slice(0, 6).map(t => [
      t.monthYear,
      { text: `${(t.savings || 0).toFixed(2)}`, alignment: 'right', style: 'positive' },
      { text: `${(t.savingsRate || 0).toFixed(2)}%`, alignment: 'right' }
    ]);

    return {
      stack: [
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'Monthly Savings', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['33%', '33%', '34%'],
                    body: [
                      [
                        { text: 'Month', style: 'tableHeader' },
                        { text: 'Savings', style: 'tableHeader' },
                        { text: 'Rate %', style: 'tableHeader' }
                      ],
                      ...savingsTable
                    ]
                  }
                }
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'Savings Metrics', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['*', '*'],
                    body: [
                      [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
                      ['Total Savings', { text: `${(totalSavings || 0).toFixed(2)}`, style: 'positive' }],
                      ['Average Monthly', { text: `${(avgSavings || 0).toFixed(2)}`, style: 'positive' }],
                      ['Best Month', bestMonth.month || 'N/A'],
                      ['Best Month Amount', bestMonth.amount ? `${bestMonth.amount.toFixed(2)}` : 'N/A']
                    ]
                  }
                }
              ]
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Goals Section
   */
  buildGoalsSection(goalsProgress) {
    const goals = goalsProgress?.goals || [];
    const summary = goalsProgress?.summary || {};

    const goalsTable = goals.slice(0, 10).map(g => [
      g.name || 'Unnamed Goal',
      g.category || 'N/A',
      { text: `${(g.progress || 0).toFixed(2)}%`, alignment: 'right' },
      { text: `${(g.savedAmount || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(g.targetAmount || 0).toFixed(2)}`, alignment: 'right' },
      { 
        text: g.status || 'Unknown', 
        alignment: 'center',
        style: (g.status === 'Completed') ? 'positive' : (g.isOverdue) ? 'negative' : 'neutral'
      }
    ]);

    return {
      stack: [
        {
          columns: [
            {
              width: '40%',
              stack: [
                { text: 'Summary', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['*', '*'],
                    body: [
                      [{ text: 'Metric', style: 'tableHeader' }, { text: 'Count', style: 'tableHeader' }],
                      ['Total Goals', summary.totalGoals || 0],
                      ['On Track', summary.onTrackGoals || 0],
                      ['Overdue', summary.overdueGoals || 0],
                      ['Average Progress', `${(summary.averageProgress || 0).toFixed(2)}%`]
                    ]
                  }
                }
              ]
            },
            {
              width: '60%',
              stack: [
                { text: 'Goals List', style: 'subHeading', margin: [0, 0, 0, 8] },
                {
                  layout: 'lightHorizontalLines',
                  table: {
                    headerRows: 1,
                    widths: ['25%', '15%', '12%', '12%', '12%', '24%'],
                    body: [
                      [
                        { text: 'Goal', style: 'tableHeader' },
                        { text: 'Category', style: 'tableHeader' },
                        { text: 'Progress', style: 'tableHeader' },
                        { text: 'Saved', style: 'tableHeader' },
                        { text: 'Target', style: 'tableHeader' },
                        { text: 'Status', style: 'tableHeader' }
                      ],
                      ...goalsTable
                    ]
                  }
                }
              ]
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Budget Section
   */
  buildBudgetSection(budgetPerformance) {
    const categories = budgetPerformance?.categories || [];

    const budgetTable = categories.map(c => [
      c.category,
      { text: `${(c.budgeted || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(c.spent || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(c.remaining || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(c.percentageUsed || 0).toFixed(2)}%`, alignment: 'right' },
      { 
        text: c.status, 
        alignment: 'center',
        style: c.status === 'Within Budget' ? 'positive' : c.status === 'Warning' ? 'neutral' : 'negative'
      }
    ]);

    const recommendations = budgetPerformance?.recommendations || [];

    return {
      stack: [
        {
          layout: 'lightHorizontalLines',
          table: {
            headerRows: 1,
            widths: ['18%', '14%', '14%', '14%', '14%', '26%'],
            body: [
              [
                { text: 'Category', style: 'tableHeader' },
                { text: 'Budgeted', style: 'tableHeader' },
                { text: 'Spent', style: 'tableHeader' },
                { text: 'Remaining', style: 'tableHeader' },
                { text: 'Used %', style: 'tableHeader' },
                { text: 'Status', style: 'tableHeader' }
              ],
              ...budgetTable
            ]
          }
        },
        recommendations.length > 0 ? { text: '', margin: [0, 10] } : '',
        recommendations.length > 0 ? {
          stack: [
            { text: 'Alerts & Recommendations', style: 'subHeading', margin: [0, 10, 0, 8] },
            {
              ol: recommendations.map(rec => ({
                text: rec,
                margin: [0, 4, 0, 4]
              }))
            }
          ]
        } : ''
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Transaction Insights Section
   */
  buildTransactionInsightsSection(transactionInsights) {
    const {
      totalTransactions = 0,
      dailyAverage = 0,
      maxTransaction = {},
      minTransaction = {},
      averagePerDay = 0,
      topCategory = 'N/A'
    } = transactionInsights;

    return {
      columns: [
        {
          width: '50%',
          stack: [
            { text: 'Transaction Statistics', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [
                  [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
                  ['Total Transactions', totalTransactions.toString()],
                  ['Daily Average', (dailyAverage || 0).toFixed(2)],
                  ['Average Amount/Day', `${(averagePerDay || 0).toFixed(2)}`],
                  ['Top Category', topCategory]
                ]
              }
            }
          ]
        },
        {
          width: '50%',
          stack: [
            { text: 'Extremes', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [
                  [{ text: 'Type', style: 'tableHeader' }, { text: 'Details', style: 'tableHeader' }],
                  [
                    'Highest',
                    `${maxTransaction.description || 'N/A'}\n${(maxTransaction.amount || 0).toFixed(2)}\n${maxTransaction.date || 'N/A'}`
                  ],
                  [
                    'Lowest',
                    `${minTransaction.description || 'N/A'}\n${(minTransaction.amount || 0).toFixed(2)}\n${minTransaction.date || 'N/A'}`
                  ]
                ]
              }
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Current Month Section
   */
  buildCurrentMonthSection(currentMonth) {
    const summary = currentMonth?.summary || {};
    const breakdown = currentMonth?.categoryBreakdown || [];

    const breakdownTable = breakdown.slice(0, 8).map(b => [
      b.category,
      { text: `${(b.amount || 0).toFixed(2)}`, alignment: 'right' },
      { text: `${(b.percentage || 0).toFixed(2)}%`, alignment: 'right' }
    ]);

    return {
      columns: [
        {
          width: '50%',
          stack: [
            { text: 'Month Overview', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['*', '*'],
                body: [
                  [{ text: 'Metric', style: 'tableHeader' }, { text: 'Amount', style: 'tableHeader' }],
                  ['Total Income', { text: `${(summary.totalIncome || 0).toFixed(2)}`, style: 'positive' }],
                  ['Total Expenses', { text: `${(summary.totalExpenses || 0).toFixed(2)}`, style: 'negative' }],
                  ['Net Savings', { text: `${(summary.netSavings || 0).toFixed(2)}`, style: 'positive' }],
                  ['Savings Rate', { text: `${(summary.savingsRate || 0).toFixed(2)}%`, style: 'neutral' }]
                ]
              }
            }
          ]
        },
        {
          width: '50%',
          stack: [
            { text: 'Expense Categories', style: 'subHeading', margin: [0, 0, 0, 8] },
            {
              layout: 'lightHorizontalLines',
              table: {
                headerRows: 1,
                widths: ['40%', '30%', '30%'],
                body: [
                  [
                    { text: 'Category', style: 'tableHeader' },
                    { text: 'Amount', style: 'tableHeader' },
                    { text: 'Percentage', style: 'tableHeader' }
                  ],
                  ...breakdownTable
                ]
              }
            }
          ]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Recommendations Section
   */
  buildRecommendationsSection(analyticsData) {
    const recommendations = [];

    // Analyze savings rate
    const savingsRate = analyticsData.dashboard?.monthly?.summary?.savingsRate || 0;
    if (savingsRate < 10) {
      recommendations.push('Increase savings rate: Your current savings rate is below 10%. Consider reducing discretionary spending.');
    } else if (savingsRate > 30) {
      recommendations.push('Excellent savings rate: You\'re maintaining a strong savings rate. Continue your current financial discipline.');
    }

    // Analyze spending by category
    const categories = analyticsData.categoryAnalysis?.categories || [];
    if (categories.length > 0) {
      const topCategory = categories[0];
      if (topCategory.percentage > 30) {
        recommendations.push(`Monitor ${topCategory.category} spending: This category accounts for ${topCategory.percentage.toFixed(2)}% of expenses.`);
      }
    }

    // Analyze goals
    const goals = analyticsData.goalsProgress?.goals || [];
    const overdueGoals = goals.filter(g => g.isOverdue).length;
    if (overdueGoals > 0) {
      recommendations.push(`Review overdue goals: You have ${overdueGoals} goal(s) that have exceeded their deadline.`);
    }

    // Analyze budget
    const budgetIssues = analyticsData.budgetPerformance?.categories?.filter(c => c.percentageUsed > 100) || [];
    if (budgetIssues.length > 0) {
      recommendations.push(`Budget overspend detected: ${budgetIssues.length} budget(s) exceeded. Review and adjust accordingly.`);
    }

    // Default recommendations if none generated
    if (recommendations.length === 0) {
      recommendations.push('Track your expenses regularly and review this report monthly.');
      recommendations.push('Set clear financial goals and monitor progress regularly.');
      recommendations.push('Maintain an emergency fund with 3-6 months of expenses.');
      recommendations.push('Review and adjust budgets quarterly based on actual spending patterns.');
    }

    return {
      stack: [
        {
          ol: recommendations.map((rec, idx) => ({
            text: rec,
            margin: [0, 8, 0, 8],
            style: 'normal'
          }))
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Build Financial Tips Section
   */
  buildTipsSection() {
    const tips = [
      'Track your expenses regularly to understand your spending patterns.',
      'Set specific financial goals and create a timeline for achieving them.',
      'Build an emergency fund covering 3-6 months of expenses.',
      'Diversify your income sources to reduce financial risk.',
      'Review your budget monthly and adjust as needed.',
      'Avoid impulse purchases by waiting 24 hours before buying non-essential items.',
      'Pay off high-interest debt first using the debt avalanche method.',
      'Invest in your education and skills for long-term financial growth.',
      'Use credit cards wisely and pay balances in full each month.',
      'Plan for retirement early and take advantage of compound interest.'
    ];

    return {
      stack: [
        {
          ul: tips.map(tip => ({
            text: tip,
            margin: [0, 5, 0, 5],
            style: 'normal'
          }))
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }
}

module.exports = new PdfReportService();
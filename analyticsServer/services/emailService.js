const fs = require('fs');

class EmailService {
  constructor() {
    this.webhookUrl   = process.env.MAKE_EMAIL_WEBHOOK_URL;
    this.from         = 'arthflow0@gmail.com';
    this.appName      = 'Arthflow';
    this.appUrl       = process.env.APP_URL || 'https://arthflow.vercel.app';
  }

  sanitizeText(input) {
    if (typeof input !== 'string') return '';
    return input
      .replace(/<\/?[^>]+(>|$)/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _baseTemplate(title, previewText, bodyContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4FF;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F4FF;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Brand header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="background-color:#2563EB;border-radius:12px;padding:10px 20px;">
                  <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">&#9783; ${this.appName}</span>
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);height:6px;font-size:0;">&nbsp;</td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:40px 40px 32px;">${bodyContent}</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#94A3B8;">© ${new Date().getFullYear()} ${this.appName}. All rights reserved.</p>
              <p style="margin:0;font-size:12px;color:#CBD5E1;">This is an automated email — please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  _generateMonthlyReportTemplate(data) {
    const safeName   = this.sanitizeText(data.name);
    const safeMonth  = this.sanitizeText(data.monthLabel);
    const fmt        = (n) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isPositive = (data.netSavings || 0) >= 0;

    const rows = [
      { label: 'Total Income',   value: fmt(data.totalIncome),   color: '#15803D' },
      { label: 'Total Expenses', value: fmt(data.totalExpenses),  color: '#B91C1C' },
      { label: 'Net Savings',    value: fmt(data.netSavings),     color: isPositive ? '#15803D' : '#B91C1C' },
      { label: 'Savings Rate',   value: `${Number(data.savingsRate || 0).toFixed(1)}%`, color: '#1E40AF' },
    ].map(r => `
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#475569;border-bottom:1px solid #F1F5F9;">${r.label}</td>
        <td style="padding:12px 16px;font-size:14px;font-weight:700;color:${r.color};text-align:right;border-bottom:1px solid #F1F5F9;">${r.value}</td>
      </tr>`).join('');

    const body = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr><td>
          <div style="width:52px;height:52px;background-color:#EFF6FF;border-radius:14px;text-align:center;line-height:52px;font-size:26px;">&#128202;</div>
        </td></tr>
      </table>

      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#2563EB;text-transform:uppercase;letter-spacing:0.8px;">Monthly Statement</p>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-0.4px;">Hi ${safeName}, your ${safeMonth} report is ready &#128075;</h1>
      <p style="margin:0 0 28px;font-size:15px;color:#64748B;line-height:1.7;">
        Here's a summary of your finances for <strong>${safeMonth}</strong>. Your full report is attached as a PDF.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DBEAFE;border-radius:12px;overflow:hidden;margin-bottom:28px;">
        <tr style="background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);">
          <td colspan="2" style="padding:12px 16px;font-size:12px;font-weight:700;color:#BFDBFE;text-transform:uppercase;letter-spacing:0.8px;">Financial Summary &#8212; ${safeMonth}</td>
        </tr>
        ${rows}
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td style="background-color:#2563EB;border-radius:10px;">
            <a href="${this.appUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View Full Dashboard &#8594;</a>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td style="background-color:#F0FDF4;border-left:4px solid #22C55E;border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#166534;">&#128206; Your complete financial report PDF is attached to this email.</p>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr><td style="border-top:1px solid #F1F5F9;font-size:0;">&nbsp;</td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#94A3B8;">This is your automated monthly statement from ${this.appName}.</p>
    `;

    return this._baseTemplate(
      `Your ${safeMonth} Financial Report`,
      `Your ${safeMonth} financial statement is ready`,
      body
    );
  }

  async sendMonthlyReportEmail(email, data) {
    try {
      const pdfBuffer      = fs.readFileSync(data.pdfPath);
      const attachmentName = `Financial_Report_${data.monthLabel.replace(/\s+/g, '_')}.pdf`;
      const html = this._generateMonthlyReportTemplate(data);
      const subject = `Your ${data.monthLabel} Financial Report - ${this.appName}`;

      if (!this.webhookUrl) {
        throw new Error('MAKE_EMAIL_WEBHOOK_URL is not set');
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: email,
          subject: subject,
          type: 'monthly_report',
          html: html,
          attachmentFilename: attachmentName,
          attachmentContent: pdfBuffer.toString('base64'),
          attachmentContentType: 'application/pdf',
          attachments: [
            {
              filename: attachmentName,
              content: pdfBuffer.toString('base64'),
              contentType: 'application/pdf'
            }
          ]
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook responded with status ${response.status}: ${text}`);
      }

      console.log(`✔️ Monthly report sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending monthly report to ${email}:`, error.message);
      throw error;
    }
  }

  async verifyConnection() {
    if (!process.env.MAKE_EMAIL_WEBHOOK_URL) {
      console.error('MAKE_EMAIL_WEBHOOK_URL is not set');
      return false;
    }
    console.log('Email service (Make Webhook) is configured');
    return true;
  }
}

module.exports = new EmailService();
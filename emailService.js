const nodemailer = require('nodemailer');
const config = require('../config');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      }
    });
  }

  async sendEmail(to, subject, html) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${config.appName}" <${config.emailFrom}>`,
        to,
        subject,
        html
      });

      console.log(`📧 Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return false;
    }
  }

  async sendWelcomeEmail(email, name, accountNumber) {
    const subject = `Welcome to ${config.appName}!`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .account-info { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${config.appName}! 🎉</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            
            <p>Welcome to ${config.appName}! We're thrilled to have you on board.</p>
            
            <div class="account-info">
              <h3>Your Account Details:</h3>
              <p><strong>Account Number:</strong> ${accountNumber}</p>
              <p><strong>Starting Balance:</strong> ₹1,000.00 (Welcome Bonus)</p>
              <p><strong>Account Type:</strong> Savings Account</p>
            </div>
            
            <p>Your account has been created successfully. Here's what you can do next:</p>
            <ul>
              <li>Complete your KYC verification for higher limits</li>
              <li>Set up Two-Factor Authentication for extra security</li>
              <li>Explore our loan products</li>
              <li>Start making transactions</li>
            </ul>
            
            <p>For security reasons, please keep your account details confidential and never share your password or OTP with anyone.</p>
            
            <a href="${config.appUrl}/dashboard" class="button">Go to Dashboard</a>
            
            <div class="footer">
              <p>Thank you for choosing ${config.appName}.</p>
              <p>Need help? Contact our support team at support@konibank.com</p>
              <p>© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendTransactionAlert(email, name, transaction) {
    const subject = `Transaction Alert: ₹${transaction.amount} ${transaction.type}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${transaction.type === 'debit' ? '#f56565' : '#48bb78'}; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .transaction-info { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: ${transaction.type === 'debit' ? '#f56565' : '#48bb78'}; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Transaction Alert</h2>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            
            <div class="transaction-info">
              <p class="amount">${transaction.type === 'debit' ? '−' : '+'} ₹${transaction.amount}</p>
              <p><strong>Type:</strong> ${transaction.description}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Transaction ID:</strong> ${transaction.id}</p>
              <p><strong>Available Balance:</strong> ₹${transaction.balance}</p>
            </div>
            
            <p>If you did not initiate this transaction, please contact our customer support immediately.</p>
            
            <div class="footer">
              <p>Thank you for banking with ${config.appName}.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendPasswordResetEmail(email, name, resetLink) {
    const subject = 'Password Reset Request';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f56565; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #f56565; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Password Reset</h2>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            
            <p>We received a request to reset your password for your ${config.appName} account.</p>
            
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            
            <a href="${resetLink}" class="button">Reset Password</a>
            
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <div class="footer">
              <p>For security reasons, never share this link with anyone.</p>
              <p>© ${new Date().getFullYear()} ${config.appName}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendKYCAprovedEmail(email, name) {
    const subject = 'KYC Verification Approved';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #48bb78; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 KYC Verification Approved!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            
            <p>We are pleased to inform you that your KYC verification has been successfully approved!</p>
            
            <p>With verified KYC, you now have access to:</p>
            <ul>
              <li>Higher transaction limits</li>
              <li>Full banking features</li>
              <li>Loan applications</li>
              <li>Advanced security options</li>
            </ul>
            
            <p>Thank you for completing the verification process. We're committed to providing you with a secure and seamless banking experience.</p>
            
            <div class="footer">
              <p>Thank you for choosing ${config.appName}.</p>
              <p>Need help? Contact support@konibank.com</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendLoanApprovalEmail(email, name, loanDetails) {
    const subject = `Loan Application Approved: ${loanDetails.loan_number}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4299e1; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .loan-info { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #4299e1; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Loan Application Approved! ✅</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            
            <p>Congratulations! Your loan application has been approved.</p>
            
            <div class="loan-info">
              <h3>Loan Details:</h3>
              <p><strong>Loan Number:</strong> ${loanDetails.loan_number}</p>
              <p><strong>Amount:</strong> ₹${loanDetails.amount}</p>
              <p><strong>Interest Rate:</strong> ${loanDetails.interest_rate}% p.a.</p>
              <p><strong>Tenure:</strong> ${loanDetails.tenure_months} months</p>
              <p><strong>EMI Amount:</strong> ₹${loanDetails.emi_amount}</p>
              <p><strong>Disbursement Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <p>The loan amount will be credited to your account shortly. You can view your loan details and repayment schedule in your dashboard.</p>
            
            <div class="footer">
              <p>Thank you for choosing ${config.appName} for your financial needs.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }
}

module.exports = new EmailService();
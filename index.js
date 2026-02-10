const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',
  
  // Security
  jwtSecret: process.env.JWT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  csrfSecret: process.env.CSRF_SECRET,
  
  // Database
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../../database/koni.db'),
  
  // Email
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  emailFrom: process.env.EMAIL_FROM || 'noreply@konibank.com',
  
  // Banking Limits
  limits: {
    dailyTransfer: parseFloat(process.env.DAILY_TRANSFER_LIMIT) || 50000,
    withdrawal: parseFloat(process.env.WITHDRAWAL_LIMIT) || 20000,
    maxAccountsPerUser: 3
  },
  
  // Interest Rates
  rates: {
    savingsInterest: parseFloat(process.env.SAVINGS_INTEREST_RATE) || 3.5,
    loanInterest: parseFloat(process.env.LOAN_INTEREST_RATE) || 8.5,
    emiPenalty: parseFloat(process.env.EMI_PENALTY_RATE) || 2.0
  },
  
  // TOTP
  totp: {
    window: parseInt(process.env.TOTP_WINDOW, 10) || 1,
    digits: parseInt(process.env.TOTP_DIGITS, 10) || 6,
    period: parseInt(process.env.TOTP_PERIOD, 10) || 30
  },
  
  // App
  appName: process.env.APP_NAME || 'Koni Bank',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  
  // Backup
  backupPath: process.env.BACKUP_PATH || path.join(__dirname, '../../backups'),
  backupCron: process.env.BACKUP_CRON || '0 2 * * *'
};

// Validation
const required = ['JWT_SECRET', 'SESSION_SECRET'];
required.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

module.exports = config;
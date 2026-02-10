module.exports = {
  // User Roles
  ROLES: {
    CUSTOMER: 'customer',
    ADMIN: 'admin',
    MANAGER: 'manager'
  },

  // Account Types
  ACCOUNT_TYPES: {
    SAVINGS: 'savings',
    CURRENT: 'current',
    FIXED_DEPOSIT: 'fixed_deposit',
    LOAN: 'loan'
  },

  // Transaction Types
  TRANSACTION_TYPES: {
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer',
    LOAN_DISBURSEMENT: 'loan_disbursement',
    LOAN_REPAYMENT: 'loan_repayment',
    INTEREST_CREDIT: 'interest_credit',
    PENALTY: 'penalty',
    FEE: 'fee'
  },

  // Transaction Status
  TRANSACTION_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },

  // Loan Status
  LOAN_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    DISBURSED: 'disbursed',
    ACTIVE: 'active',
    CLOSED: 'closed',
    DEFAULTED: 'defaulted'
  },

  // Notification Types
  NOTIFICATION_TYPES: {
    TRANSACTION: 'transaction',
    SECURITY: 'security',
    LOAN: 'loan',
    SYSTEM: 'system',
    PROMOTIONAL: 'promotional'
  },

  // KYC Status
  KYC_STATUS: {
    PENDING: 'pending',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
  },

  // Security Settings
  SECURITY: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_TIME: 15 * 60 * 1000, // 15 minutes
    PASSWORD_MIN_LENGTH: 8,
    SESSION_TIMEOUT: 30 * 60 * 1000 // 30 minutes
  },

  // API Response Codes
  RESPONSE_CODES: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVER_ERROR: 500
  },

  // Date Formats
  DATE_FORMATS: {
    DISPLAY: 'DD MMM YYYY, hh:mm A',
    DATABASE: 'YYYY-MM-DD HH:mm:ss',
    STATEMENT: 'YYYY_MM'
  }
};
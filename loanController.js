const { Loan, Account } = require('../models');
const ledgerService = require('../services/ledgerService');
const notificationService = require('../services/notificationService');
const config = require('../config');
const { LOAN_STATUS, TRANSACTION_TYPES } = require('../config/constants');
const audit = require('../utils/audit');

class LoanController {
  async applyForLoan(req, res) {
    try {
      const userId = req.user.userId;
      const {
        loan_type,
        amount,
        tenure_months,
        purpose,
        account_id
      } = req.body;

      // Validate amount
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Loan amount must be greater than 0'
        });
      }

      // Validate tenure
      if (tenure_months < 1 || tenure_months > 60) {
        return res.status(400).json({
          success: false,
          message: 'Loan tenure must be between 1 and 60 months'
        });
      }

      // Verify account belongs to user
      const account = await Account.findById(account_id);
      if (!account || account.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Invalid account'
        });
      }

      // Calculate EMI
      const interestRate = config.rates.loanInterest;
      const emiAmount = Loan.calculateEMI(amount, interestRate, tenure_months);

      // Create loan application
      const loan = await Loan.create({
        user_id: userId,
        account_id,
        loan_type,
        amount,
        interest_rate: interestRate,
        tenure_months,
        purpose,
        emi_amount: emiAmount
      });

      // Send notification to admin
      await notificationService.sendSystemNotification(
        'admin',
        'New Loan Application',
        `New ${loan_type} loan application for ₹${amount} from user ${userId}`,
        { loan_id: loan.id, user_id: userId, amount }
      );

      // Send notification to user
      await notificationService.sendLoanNotification(
        userId,
        'Loan Application Submitted',
        `Your ${loan_type} loan application for ₹${amount} has been submitted for review.`,
        { loan_number: loan.loan_number, amount }
      );

      await audit.log(userId, 'LOAN_APPLIED', 'loans', loan.id, {
        loan_type,
        amount,
        tenure_months,
        purpose
      });

      res.status(201).json({
        success: true,
        message: 'Loan application submitted successfully',
        data: {
          loan_number: loan.loan_number,
          loan_type,
          amount,
          tenure_months,
          interest_rate: interestRate,
          emi_amount: emiAmount,
          status: LOAN_STATUS.PENDING
        }
      });

    } catch (error) {
      console.error('Loan application error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to apply for loan',
        error: error.message
      });
    }
  }

  async getMyLoans(req, res) {
    try {
      const userId = req.user.userId;
      const loans = await Loan.findByUserId(userId);

      // Calculate summary
      const summary = {
        total_loans: loans.length,
        active_loans: loans.filter(l => l.status === LOAN_STATUS.ACTIVE).length,
        total_borrowed: loans.reduce((sum, loan) => sum + parseFloat(loan.amount), 0),
        total_paid: loans.reduce((sum, loan) => sum + (parseFloat(loan.amount) - parseFloat(loan.remaining_amount)), 0),
        total_due: loans.reduce((sum, loan) => sum + parseFloat(loan.remaining_amount), 0)
      };

      res.json({
        success: true,
        data: {
          loans,
          summary
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch loans',
        error: error.message
      });
    }
  }

  async getLoanDetails(req, res) {
    try {
      const { loanId } = req.params;
      const userId = req.user.userId;

      const loan = await Loan.findById(loanId);
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: 'Loan not found'
        });
      }

      // Check access
      if (loan.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Get EMIs if needed
      const emis = await require('../models/index').db.query(
        'SELECT * FROM loan_emis WHERE loan_id = ? ORDER BY emi_number',
        [loanId]
      );

      res.json({
        success: true,
        data: {
          ...loan,
          emis
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch loan details',
        error: error.message
      });
    }
  }

  async repayLoan(req, res) {
    try {
      const userId = req.user.userId;
      const { loan_id, amount, account_id } = req.body;

      // Get loan
      const loan = await Loan.findById(loan_id);
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: 'Loan not found'
        });
      }

      if (loan.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      if (loan.status !== LOAN_STATUS.ACTIVE) {
        return res.status(400).json({
          success: false,
          message: 'Loan is not active'
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      if (amount > loan.remaining_amount) {
        return res.status(400).json({
          success: false,
          message: 'Amount exceeds remaining loan amount'
        });
      }

      // Verify account belongs to user
      const account = await Account.findById(account_id);
      if (!account || account.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Invalid account'
        });
      }

      // Check balance
      if (account.available_balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient funds'
        });
      }

      // Hold amount
      await Account.holdAmount(account_id, amount);

      // Create transaction
      const transaction = await require('../models/transaction.model').create({
        from_account_id: account_id,
        to_account_id: loan.account_id,
        amount,
        transaction_type: TRANSACTION_TYPES.LOAN_REPAYMENT,
        description: `Loan repayment for ${loan.loan_number}`,
        status: 'pending'
      });

      try {
        // Process repayment
        await ledgerService.processLoanRepayment(
          transaction.transaction_id,
          loan_id
        );

        // Update loan
        await Loan.updateRepayment(loan_id, amount);

        // Check if loan is fully paid
        const updatedLoan = await Loan.findById(loan_id);
        if (updatedLoan.remaining_amount <= 0) {
          await Loan.updateStatus(loan_id, LOAN_STATUS.CLOSED, 'Loan fully repaid');
          
          await notificationService.sendLoanNotification(
            userId,
            'Loan Closed',
            `Congratulations! Your loan ${loan.loan_number} has been fully repaid.`,
            { loan_number: loan.loan_number }
          );
        }

        // Send notification
        await notificationService.sendLoanNotification(
          userId,
          'Loan Repayment Successful',
          `Your loan repayment of ₹${amount} for ${loan.loan_number} was successful. Remaining amount: ₹${updatedLoan.remaining_amount}`,
          {
            loan_number: loan.loan_number,
            amount_paid: amount,
            remaining_amount: updatedLoan.remaining_amount
          }
        );

        await audit.log(userId, 'LOAN_REPAYMENT', 'loans', loan_id, {
          amount,
          loan_number: loan.loan_number,
          remaining_amount: updatedLoan.remaining_amount
        });

        res.json({
          success: true,
          message: 'Loan repayment successful',
          data: {
            transaction_id: transaction.transaction_id,
            amount,
            loan_number: loan.loan_number,
            remaining_amount: updatedLoan.remaining_amount
          }
        });

      } catch (error) {
        // Rollback hold
        await Account.releaseHold(account_id, amount);
        
        await require('../models/transaction.model').updateStatus(
          transaction.transaction_id,
          'failed',
          error.message
        );

        throw error;
      }

    } catch (error) {
      console.error('Loan repayment error:', error);
      res.status(500).json({
        success: false,
        message: 'Loan repayment failed',
        error: error.message
      });
    }
  }

  async calculateEMI(req, res) {
    try {
      const { amount, tenure_months, interest_rate } = req.body;

      if (!amount || !tenure_months) {
        return res.status(400).json({
          success: false,
          message: 'Amount and tenure are required'
        });
      }

      const rate = interest_rate || config.rates.loanInterest;
      const emi = Loan.calculateEMI(
        parseFloat(amount),
        parseFloat(rate),
        parseInt(tenure_months)
      );

      const totalPayment = emi * tenure_months;
      const totalInterest = totalPayment - amount;

      res.json({
        success: true,
        data: {
          amount,
          tenure_months,
          interest_rate: rate,
          emi_amount: emi,
          total_payment: totalPayment,
          total_interest: totalInterest
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'EMI calculation failed',
        error: error.message
      });
    }
  }

  async getLoanSchedule(req, res) {
    try {
      const { loanId } = req.params;
      const userId = req.user.userId;

      const loan = await Loan.findById(loanId);
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: 'Loan not found'
        });
      }

      if (loan.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Generate amortization schedule
      const schedule = [];
      let remainingPrincipal = parseFloat(loan.amount);
      const monthlyRate = loan.interest_rate / 12 / 100;
      const emi = parseFloat(loan.emi_amount);

      for (let i = 1; i <= loan.tenure_months; i++) {
        const interest = remainingPrincipal * monthlyRate;
        const principal = emi - interest;
        remainingPrincipal -= principal;

        schedule.push({
          month: i,
          emi: emi,
          principal: principal,
          interest: interest,
          remaining_principal: remainingPrincipal > 0 ? remainingPrincipal : 0,
          due_date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString()
        });
      }

      res.json({
        success: true,
        data: {
          loan: {
            loan_number: loan.loan_number,
            amount: loan.amount,
            interest_rate: loan.interest_rate,
            tenure_months: loan.tenure_months,
            emi_amount: loan.emi_amount
          },
          schedule
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate loan schedule',
        error: error.message
      });
    }
  }
}

module.exports = new LoanController();
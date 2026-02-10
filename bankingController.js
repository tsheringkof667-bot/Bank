const { Account, Transaction } = require('../models');
const ledgerService = require('../services/ledgerService');
const notificationService = require('../services/notificationService');
const config = require('../config');
const { TRANSACTION_TYPES, TRANSACTION_STATUS } = require('../config/constants');
const audit = require('../utils/audit');

class BankingController {
  async getAccounts(req, res) {
    try {
      const userId = req.user.userId;
      const accounts = await Account.findByUserId(userId);
      const totalBalance = await Account.getTotalBalance(userId);

      res.json({
        success: true,
        data: {
          accounts,
          summary: totalBalance
        }
      });

    } catch (error) {
      console.error('Get accounts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch accounts',
        error: error.message
      });
    }
  }

  async createAccount(req, res) {
    try {
      const userId = req.user.userId;
      const { account_type, currency = 'INR' } = req.body;

      // Check account limit
      const existingAccounts = await Account.findByUserId(userId);
      if (existingAccounts.length >= config.limits.maxAccountsPerUser) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${config.limits.maxAccountsPerUser} accounts allowed per user`
        });
      }

      // Generate account number
      const accountNumber = await Account.generateAccountNumber();

      // Create account
      const accountId = await Account.create({
        user_id: userId,
        account_type,
        account_number: accountNumber,
        currency
      });

      await audit.log(userId, 'ACCOUNT_CREATED', 'accounts', accountId, {
        account_type,
        account_number: accountNumber
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          account_id: accountId,
          account_number: accountNumber,
          account_type,
          currency
        }
      });

    } catch (error) {
      console.error('Create account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create account',
        error: error.message
      });
    }
  }

  async getAccountDetails(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user.userId;

      const account = await Account.findById(accountId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      if (account.user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: account
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch account details',
        error: error.message
      });
    }
  }

  async transferFunds(req, res) {
    try {
      const userId = req.user.userId;
      const { from_account_id, to_account_number, amount, description } = req.body;

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      // Get source account
      const fromAccount = await Account.findById(from_account_id);
      if (!fromAccount || fromAccount.user_id !== userId) {
        return res.status(404).json({
          success: false,
          message: 'Source account not found or access denied'
        });
      }

      // Check daily limit
      const dailyTotal = await Transaction.getDailyTotal(
        from_account_id,
        new Date().toISOString()
      );
      
      if (dailyTotal + amount > config.limits.dailyTransfer) {
        return res.status(400).json({
          success: false,
          message: `Daily transfer limit exceeded. Remaining: ${config.limits.dailyTransfer - dailyTotal}`
        });
      }

      // Check available balance
      if (fromAccount.available_balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient funds'
        });
      }

      // Get destination account
      const toAccount = await Account.findByAccountNumber(to_account_number);
      if (!toAccount) {
        return res.status(404).json({
          success: false,
          message: 'Destination account not found'
        });
      }

      if (toAccount.id === fromAccount.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot transfer to same account'
        });
      }

      // Hold amount in source account
      await Account.holdAmount(from_account_id, amount);

      // Create pending transaction
      const transaction = await Transaction.create({
        from_account_id,
        to_account_id: toAccount.id,
        amount,
        transaction_type: TRANSACTION_TYPES.TRANSFER,
        description: description || `Transfer to ${toAccount.account_number}`,
        status: TRANSACTION_STATUS.PENDING
      });

      try {
        // Process transfer using double-entry ledger
        await ledgerService.processTransfer(transaction.transaction_id);

        // Update transaction status
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.COMPLETED
        );

        // Send notifications
        await notificationService.sendTransactionNotification(
          userId,
          'Transfer Successful',
          `Your transfer of ₹${amount} to ${toAccount.account_number} was successful.`,
          { transaction_id: transaction.transaction_id, amount }
        );

        await notificationService.sendTransactionNotification(
          toAccount.user_id,
          'Money Received',
          `You received ₹${amount} from ${fromAccount.account_number}.`,
          { transaction_id: transaction.transaction_id, amount }
        );

        await audit.log(userId, 'TRANSFER_COMPLETED', 'transactions', transaction.id, {
          amount,
          from_account: fromAccount.account_number,
          to_account: toAccount.account_number
        });

        res.json({
          success: true,
          message: 'Transfer successful',
          data: {
            transaction_id: transaction.transaction_id,
            amount,
            from_account: fromAccount.account_number,
            to_account: toAccount.account_number,
            new_balance: fromAccount.available_balance - amount
          }
        });

      } catch (error) {
        // Rollback hold
        await Account.releaseHold(from_account_id, amount);
        
        // Update transaction status
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.FAILED,
          error.message
        );

        throw error;
      }

    } catch (error) {
      console.error('Transfer error:', error);
      res.status(500).json({
        success: false,
        message: 'Transfer failed',
        error: error.message
      });
    }
  }

  async deposit(req, res) {
    try {
      const userId = req.user.userId;
      const { account_id, amount, description } = req.body;

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      const account = await Account.findById(account_id);
      if (!account || account.user_id !== userId) {
        return res.status(404).json({
          success: false,
          message: 'Account not found or access denied'
        });
      }

      // Create transaction
      const transaction = await Transaction.create({
        to_account_id: account_id,
        amount,
        transaction_type: TRANSACTION_TYPES.DEPOSIT,
        description: description || 'Deposit',
        status: TRANSACTION_STATUS.PENDING
      });

      try {
        // Process deposit
        await ledgerService.processDeposit(transaction.transaction_id);

        // Update transaction status
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.COMPLETED
        );

        const newBalance = account.current_balance + amount;

        // Send notification
        await notificationService.sendTransactionNotification(
          userId,
          'Deposit Successful',
          `Your deposit of ₹${amount} was successful. New balance: ₹${newBalance}`,
          { transaction_id: transaction.transaction_id, amount, new_balance: newBalance }
        );

        await audit.log(userId, 'DEPOSIT_COMPLETED', 'transactions', transaction.id, {
          amount,
          account_number: account.account_number
        });

        res.json({
          success: true,
          message: 'Deposit successful',
          data: {
            transaction_id: transaction.transaction_id,
            amount,
            account_number: account.account_number,
            new_balance: newBalance
          }
        });

      } catch (error) {
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.FAILED,
          error.message
        );

        throw error;
      }

    } catch (error) {
      console.error('Deposit error:', error);
      res.status(500).json({
        success: false,
        message: 'Deposit failed',
        error: error.message
      });
    }
  }

  async withdraw(req, res) {
    try {
      const userId = req.user.userId;
      const { account_id, amount, description } = req.body;

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      if (amount > config.limits.withdrawal) {
        return res.status(400).json({
          success: false,
          message: `Withdrawal limit is ₹${config.limits.withdrawal} per transaction`
        });
      }

      const account = await Account.findById(account_id);
      if (!account || account.user_id !== userId) {
        return res.status(404).json({
          success: false,
          message: 'Account not found or access denied'
        });
      }

      if (account.available_balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient funds'
        });
      }

      // Hold amount
      await Account.holdAmount(account_id, amount);

      // Create transaction
      const transaction = await Transaction.create({
        from_account_id: account_id,
        amount,
        transaction_type: TRANSACTION_TYPES.WITHDRAWAL,
        description: description || 'Withdrawal',
        status: TRANSACTION_STATUS.PENDING
      });

      try {
        // Process withdrawal
        await ledgerService.processWithdrawal(transaction.transaction_id);

        // Update transaction status
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.COMPLETED
        );

        const newBalance = account.available_balance - amount;

        // Send notification
        await notificationService.sendTransactionNotification(
          userId,
          'Withdrawal Successful',
          `Your withdrawal of ₹${amount} was successful. New balance: ₹${newBalance}`,
          { transaction_id: transaction.transaction_id, amount, new_balance: newBalance }
        );

        await audit.log(userId, 'WITHDRAWAL_COMPLETED', 'transactions', transaction.id, {
          amount,
          account_number: account.account_number
        });

        res.json({
          success: true,
          message: 'Withdrawal successful',
          data: {
            transaction_id: transaction.transaction_id,
            amount,
            account_number: account.account_number,
            new_balance: newBalance
          }
        });

      } catch (error) {
        // Rollback hold
        await Account.releaseHold(account_id, amount);
        
        await Transaction.updateStatus(
          transaction.transaction_id,
          TRANSACTION_STATUS.FAILED,
          error.message
        );

        throw error;
      }

    } catch (error) {
      console.error('Withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Withdrawal failed',
        error: error.message
      });
    }
  }

  async getTransactions(req, res) {
    try {
      const userId = req.user.userId;
      const { account_id, limit = 50, offset = 0 } = req.query;

      let transactions;
      if (account_id) {
        // Verify account belongs to user
        const account = await Account.findById(account_id);
        if (!account || account.user_id !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied'
          });
        }
        transactions = await Transaction.findByAccountId(account_id, parseInt(limit), parseInt(offset));
      } else {
        transactions = await Transaction.findByUserId(userId, parseInt(limit), parseInt(offset));
      }

      res.json({
        success: true,
        data: transactions
      });

    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
  }

  async getTransactionDetails(req, res) {
    try {
      const { transactionId } = req.params;
      const transaction = await Transaction.findByTransactionId(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Verify access
      const userId = req.user.userId;
      const fromAccount = transaction.from_account_id ? await Account.findById(transaction.from_account_id) : null;
      const toAccount = transaction.to_account_id ? await Account.findById(transaction.to_account_id) : null;

      const hasAccess = (fromAccount && fromAccount.user_id === userId) ||
                       (toAccount && toAccount.user_id === userId) ||
                       req.user.role === 'admin';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: transaction
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction details',
        error: error.message
      });
    }
  }

  async getBalance(req, res) {
    try {
      const userId = req.user.userId;
      const { account_id } = req.query;

      if (account_id) {
        const account = await Account.findById(account_id);
        if (!account || account.user_id !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied'
          });
        }

        res.json({
          success: true,
          data: {
            account_number: account.account_number,
            current_balance: account.current_balance,
            available_balance: account.available_balance,
            currency: account.currency
          }
        });
      } else {
        const totalBalance = await Account.getTotalBalance(userId);
        res.json({
          success: true,
          data: totalBalance
        });
      }

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch balance',
        error: error.message
      });
    }
  }

  async generateStatement(req, res) {
    try {
      const userId = req.user.userId;
      const { account_id, start_date, end_date } = req.body;

      // Validate dates
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }

      // Verify account belongs to user
      const account = await Account.findById(account_id);
      if (!account || account.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Generate statement
      const statement = await Transaction.generateStatement(
        account_id,
        start_date,
        end_date
      );

      // Calculate summary
      const summary = {
        total_deposits: 0,
        total_withdrawals: 0,
        opening_balance: 0,
        closing_balance: account.current_balance
      };

      statement.forEach(txn => {
        if (txn.to_account_id === account_id) {
          summary.total_deposits += txn.amount;
        } else if (txn.from_account_id === account_id) {
          summary.total_withdrawals += txn.amount;
        }
      });

      summary.opening_balance = summary.closing_balance - summary.total_deposits + summary.total_withdrawals;

      await audit.log(userId, 'STATEMENT_GENERATED', 'accounts', account_id, {
        start_date,
        end_date,
        transaction_count: statement.length
      });

      res.json({
        success: true,
        data: {
          account: {
            account_number: account.account_number,
            account_type: account.account_type,
            currency: account.currency
          },
          period: {
            start_date,
            end_date
          },
          summary,
          transactions: statement
        }
      });

    } catch (error) {
      console.error('Generate statement error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate statement',
        error: error.message
      });
    }
  }
}

module.exports = new BankingController();
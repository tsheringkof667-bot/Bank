const db = require('../config/database');
const { Account, Transaction } = require('../models');
const { TRANSACTION_TYPES, TRANSACTION_STATUS } = require('../config/constants');

class LedgerService {
  async processTransfer(transaction_id) {
    let conn;
    
    try {
      conn = await db.beginTransaction();
      
      // Get transaction details
      const transaction = await Transaction.findByTransactionId(transaction_id);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== TRANSACTION_STATUS.PENDING) {
        throw new Error('Transaction already processed');
      }

      // Update balances with double-entry accounting
      // Debit from source account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance - ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, new Date().toISOString(), transaction.from_account_id]
      );

      // Credit to destination account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance + ?,
             available_balance = available_balance + ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, transaction.amount, new Date().toISOString(), transaction.to_account_id]
      );

      await conn.commit();
      return true;

    } catch (error) {
      if (conn) await conn.rollback();
      throw error;
    }
  }

  async processDeposit(transaction_id) {
    let conn;
    
    try {
      conn = await db.beginTransaction();
      
      const transaction = await Transaction.findByTransactionId(transaction_id);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Credit to account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance + ?,
             available_balance = available_balance + ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, transaction.amount, new Date().toISOString(), transaction.to_account_id]
      );

      await conn.commit();
      return true;

    } catch (error) {
      if (conn) await conn.rollback();
      throw error;
    }
  }

  async processWithdrawal(transaction_id) {
    let conn;
    
    try {
      conn = await db.beginTransaction();
      
      const transaction = await Transaction.findByTransactionId(transaction_id);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Debit from account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance - ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, new Date().toISOString(), transaction.from_account_id]
      );

      // Release hold
      await conn.run(
        `UPDATE accounts 
         SET available_balance = available_balance + ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, new Date().toISOString(), transaction.from_account_id]
      );

      await conn.commit();
      return true;

    } catch (error) {
      if (conn) await conn.rollback();
      throw error;
    }
  }

  async processLoanDisbursement(transaction_id, loan_id) {
    let conn;
    
    try {
      conn = await db.beginTransaction();
      
      const transaction = await Transaction.findByTransactionId(transaction_id);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Credit loan amount to account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance + ?,
             available_balance = available_balance + ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, transaction.amount, new Date().toISOString(), transaction.to_account_id]
      );

      // Update loan status
      await conn.run(
        `UPDATE loans 
         SET status = ?,
             disbursed_at = ?,
             updated_at = ?
         WHERE id = ?`,
        ['active', new Date().toISOString(), new Date().toISOString(), loan_id]
      );

      // Create EMIs
      const loan = await require('../models/loan.model').findById(loan_id);
      const emiAmount = parseFloat(loan.emi_amount);
      const principal = parseFloat(loan.amount);
      const monthlyRate = parseFloat(loan.interest_rate) / 12 / 100;
      let remainingPrincipal = principal;

      for (let i = 1; i <= loan.tenure_months; i++) {
        const interest = remainingPrincipal * monthlyRate;
        const principalPaid = emiAmount - interest;
        remainingPrincipal -= principalPaid;

        await conn.run(
          `INSERT INTO loan_emis (
            loan_id, emi_number, due_date, amount,
            principal, interest, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            loan_id,
            i,
            new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString(),
            emiAmount,
            principalPaid,
            interest,
            'pending',
            new Date().toISOString()
          ]
        );
      }

      await conn.commit();
      return true;

    } catch (error) {
      if (conn) await conn.rollback();
      throw error;
    }
  }

  async processLoanRepayment(transaction_id, loan_id) {
    let conn;
    
    try {
      conn = await db.beginTransaction();
      
      const transaction = await Transaction.findByTransactionId(transaction_id);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Debit from account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance - ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, new Date().toISOString(), transaction.from_account_id]
      );

      // Credit to loan account
      await conn.run(
        `UPDATE accounts 
         SET current_balance = current_balance + ?,
             available_balance = available_balance + ?,
             updated_at = ?
         WHERE id = ?`,
        [transaction.amount, transaction.amount, new Date().toISOString(), transaction.to_account_id]
      );

      // Update EMI status
      await conn.run(
        `UPDATE loan_emis 
         SET status = 'paid',
             paid_amount = amount,
             paid_date = ?
         WHERE loan_id = ? 
           AND status = 'pending'
         ORDER BY emi_number
         LIMIT 1`,
        [new Date().toISOString(), loan_id]
      );

      await conn.commit();
      return true;

    } catch (error) {
      if (conn) await conn.rollback();
      throw error;
    }
  }
}

module.exports = new LedgerService();
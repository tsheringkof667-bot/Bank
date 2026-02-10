const db = require('../config/database');
const { TRANSACTION_TYPES, TRANSACTION_STATUS } = require('../config/constants');

class Transaction {
  static async create(transactionData) {
    const {
      from_account_id,
      to_account_id,
      amount,
      transaction_type,
      description = '',
      status = TRANSACTION_STATUS.PENDING,
      reference_id = null,
      metadata = null
    } = transactionData;

    const now = new Date().toISOString();
    const transaction_id = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await db.run(
      `INSERT INTO transactions (
        transaction_id, from_account_id, to_account_id, amount,
        transaction_type, description, status, reference_id,
        metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction_id, from_account_id, to_account_id, amount,
        transaction_type, description, status, reference_id,
        metadata ? JSON.stringify(metadata) : null, now
      ]
    );

    return { id: result.id, transaction_id };
  }

  static async findByTransactionId(transaction_id) {
    return await db.get(
      `SELECT t.*, 
              fa.account_number as from_account,
              ta.account_number as to_account,
              uf.first_name as from_first_name,
              uf.last_name as from_last_name,
              ut.first_name as to_first_name,
              ut.last_name as to_last_name
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.id
       LEFT JOIN accounts ta ON t.to_account_id = ta.id
       LEFT JOIN users uf ON fa.user_id = uf.id
       LEFT JOIN users ut ON ta.user_id = ut.id
       WHERE t.transaction_id = ?`,
      [transaction_id]
    );
  }

  static async findByAccountId(account_id, limit = 50, offset = 0) {
    return await db.query(
      `SELECT t.*, 
              fa.account_number as from_account,
              ta.account_number as to_account,
              uf.first_name as from_first_name,
              uf.last_name as from_last_name,
              ut.first_name as to_first_name,
              ut.last_name as to_last_name
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.id
       LEFT JOIN accounts ta ON t.to_account_id = ta.id
       LEFT JOIN users uf ON fa.user_id = uf.id
       LEFT JOIN users ut ON ta.user_id = ut.id
       WHERE t.from_account_id = ? OR t.to_account_id = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [account_id, account_id, limit, offset]
    );
  }

  static async findByUserId(user_id, limit = 50, offset = 0) {
    return await db.query(
      `SELECT t.*, 
              fa.account_number as from_account,
              ta.account_number as to_account,
              uf.first_name as from_first_name,
              uf.last_name as from_last_name,
              ut.first_name as to_first_name,
              ut.last_name as to_last_name
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.id
       LEFT JOIN accounts ta ON t.to_account_id = ta.id
       LEFT JOIN users uf ON fa.user_id = uf.id
       LEFT JOIN users ut ON ta.user_id = ut.id
       WHERE fa.user_id = ? OR ta.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [user_id, user_id, limit, offset]
    );
  }

  static async updateStatus(transaction_id, status, error_message = null) {
    await db.run(
      `UPDATE transactions 
       SET status = ?, error_message = ?, updated_at = ?
       WHERE transaction_id = ?`,
      [status, error_message, new Date().toISOString(), transaction_id]
    );
  }

  static async getDailyTotal(account_id, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db.get(
      `SELECT SUM(amount) as total_amount
       FROM transactions 
       WHERE from_account_id = ? 
         AND status = ?
         AND transaction_type = ?
         AND created_at BETWEEN ? AND ?`,
      [
        account_id,
        TRANSACTION_STATUS.COMPLETED,
        TRANSACTION_STATUS.TRANSFER,
        startOfDay.toISOString(),
        endOfDay.toISOString()
      ]
    );

    return result.total_amount || 0;
  }

  static async generateStatement(account_id, start_date, end_date) {
    return await db.query(
      `SELECT t.*, 
              fa.account_number as from_account,
              ta.account_number as to_account
       FROM transactions t
       LEFT JOIN accounts fa ON t.from_account_id = fa.id
       LEFT JOIN accounts ta ON t.to_account_id = ta.id
       WHERE (t.from_account_id = ? OR t.to_account_id = ?)
         AND t.status = ?
         AND DATE(t.created_at) BETWEEN DATE(?) AND DATE(?)
       ORDER BY t.created_at ASC`,
      [account_id, account_id, TRANSACTION_STATUS.COMPLETED, start_date, end_date]
    );
  }
}

module.exports = Transaction;
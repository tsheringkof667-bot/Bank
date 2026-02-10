const db = require('../config/database');
const { ACCOUNT_TYPES } = require('../config/constants');

class Account {
  static async create(accountData) {
    const {
      user_id,
      account_type = ACCOUNT_TYPES.SAVINGS,
      account_number,
      currency = 'INR',
      initial_balance = 0
    } = accountData;

    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO accounts (
        user_id, account_type, account_number, currency,
        current_balance, available_balance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, account_type, account_number, currency,
        initial_balance, initial_balance, now, now
      ]
    );

    return result.id;
  }

  static async findByAccountNumber(account_number) {
    return await db.get(
      'SELECT * FROM accounts WHERE account_number = ?',
      [account_number]
    );
  }

  static async findById(id) {
    return await db.get('SELECT * FROM accounts WHERE id = ?', [id]);
  }

  static async findByUserId(user_id) {
    return await db.query(
      `SELECT a.*, u.first_name, u.last_name 
       FROM accounts a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.user_id = ? 
       ORDER BY a.created_at DESC`,
      [user_id]
    );
  }

  static async updateBalance(account_id, amount) {
    await db.run(
      `UPDATE accounts 
       SET current_balance = current_balance + ?, 
           available_balance = available_balance + ?,
           updated_at = ?
       WHERE id = ?`,
      [amount, amount, new Date().toISOString(), account_id]
    );
  }

  static async holdAmount(account_id, amount) {
    await db.run(
      `UPDATE accounts 
       SET available_balance = available_balance - ?,
           updated_at = ?
       WHERE id = ?`,
      [amount, new Date().toISOString(), account_id]
    );
  }

  static async releaseHold(account_id, amount) {
    await db.run(
      `UPDATE accounts 
       SET available_balance = available_balance + ?,
           updated_at = ?
       WHERE id = ?`,
      [amount, new Date().toISOString(), account_id]
    );
  }

  static async getTotalBalance(user_id) {
    const result = await db.get(
      `SELECT SUM(current_balance) as total_balance,
              SUM(available_balance) as total_available
       FROM accounts 
       WHERE user_id = ? AND account_type != ?`,
      [user_id, ACCOUNT_TYPES.LOAN]
    );
    
    return {
      total_balance: result.total_balance || 0,
      total_available: result.total_available || 0
    };
  }

  static async generateAccountNumber() {
    const prefix = 'KONI';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${timestamp}${random}`;
  }
}

module.exports = Account;
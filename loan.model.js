const db = require('../config/database');
const { LOAN_STATUS } = require('../config/constants');

class Loan {
  static async create(loanData) {
    const {
      user_id,
      account_id,
      loan_type,
      amount,
      interest_rate,
      tenure_months,
      purpose,
      emi_amount
    } = loanData;

    const now = new Date().toISOString();
    const loan_number = `LOAN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await db.run(
      `INSERT INTO loans (
        loan_number, user_id, account_id, loan_type, amount,
        interest_rate, tenure_months, remaining_tenure,
        emi_amount, remaining_amount, purpose, status,
        disbursed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loan_number, user_id, account_id, loan_type, amount,
        interest_rate, tenure_months, tenure_months,
        emi_amount, amount, purpose, LOAN_STATUS.PENDING,
        null, now, now
      ]
    );

    return { id: result.id, loan_number };
  }

  static async findById(id) {
    return await db.get(
      `SELECT l.*, 
              u.first_name, u.last_name, u.email,
              a.account_number
       FROM loans l
       JOIN users u ON l.user_id = u.id
       JOIN accounts a ON l.account_id = a.id
       WHERE l.id = ?`,
      [id]
    );
  }

  static async findByLoanNumber(loan_number) {
    return await db.get(
      `SELECT l.*, 
              u.first_name, u.last_name, u.email,
              a.account_number
       FROM loans l
       JOIN users u ON l.user_id = u.id
       JOIN accounts a ON l.account_id = a.id
       WHERE l.loan_number = ?`,
      [loan_number]
    );
  }

  static async findByUserId(user_id) {
    return await db.query(
      `SELECT l.*, a.account_number
       FROM loans l
       JOIN accounts a ON l.account_id = a.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
      [user_id]
    );
  }

  static async findAll(status = null, limit = 100, offset = 0) {
    let query = `
      SELECT l.*, 
             u.first_name, u.last_name, u.email,
             a.account_number
      FROM loans l
      JOIN users u ON l.user_id = u.id
      JOIN accounts a ON l.account_id = a.id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE l.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await db.query(query, params);
  }

  static async updateStatus(loan_id, status, remarks = null) {
    const updates = { status, updated_at: new Date().toISOString() };
    
    if (status === LOAN_STATUS.DISBURSED) {
      updates.disbursed_at = new Date().toISOString();
    }
    
    if (remarks) {
      updates.remarks = remarks;
    }
    
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(loan_id);
    
    await db.run(
      `UPDATE loans SET ${setClause} WHERE id = ?`,
      values
    );
  }

  static async updateRepayment(loan_id, amount_paid) {
    await db.run(
      `UPDATE loans 
       SET remaining_amount = remaining_amount - ?,
           last_payment_date = ?,
           updated_at = ?
       WHERE id = ?`,
      [amount_paid, new Date().toISOString(), new Date().toISOString(), loan_id]
    );
  }

  static async calculateEMI(principal, annual_rate, months) {
    const monthlyRate = annual_rate / 12 / 100;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
                (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(emi * 100) / 100;
  }

  static async getOverdueLoans() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return await db.query(
      `SELECT l.*, u.email, u.first_name, u.last_name
       FROM loans l
       JOIN users u ON l.user_id = u.id
       WHERE l.status = ?
         AND l.last_payment_date < ?
         AND l.remaining_amount > 0`,
      [LOAN_STATUS.ACTIVE, thirtyDaysAgo.toISOString()]
    );
  }
}

module.exports = Loan;
const db = require('../config/database');
const bcrypt = require('bcrypt');
const { ROLES, KYC_STATUS } = require('../config/constants');

class User {
  static async create(userData) {
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      date_of_birth,
      address,
      role = ROLES.CUSTOMER
    } = userData;

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO users (
        email, password, first_name, last_name, phone,
        date_of_birth, address, role, kyc_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email, hashedPassword, first_name, last_name, phone,
        date_of_birth, address, role, KYC_STATUS.PENDING, now, now
      ]
    );

    return result.id;
  }

  static async findByEmail(email) {
    return await db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findById(id) {
    return await db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async update(id, updates) {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(id);
    updates.updated_at = new Date().toISOString();

    await db.run(
      `UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`,
      [...values, updates.updated_at, id]
    );
  }

  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password = ?, updated_at = ? WHERE id = ?',
      [hashedPassword, new Date().toISOString(), id]
    );
  }

  static async updateKYCStatus(id, status, document_url = null) {
    await db.run(
      'UPDATE users SET kyc_status = ?, kyc_document = ?, kyc_verified_at = ? WHERE id = ?',
      [status, document_url, new Date().toISOString(), id]
    );
  }

  static async updateLastLogin(id) {
    await db.run(
      'UPDATE users SET last_login = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );
  }

  static async setTOTPSecret(id, secret) {
    await db.run(
      'UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?',
      [secret, new Date().toISOString(), id]
    );
  }

  static async comparePassword(user, password) {
    return await bcrypt.compare(password, user.password);
  }

  static async isEmailTaken(email, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    const params = [email];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const result = await db.get(query, params);
    return result.count > 0;
  }
}

module.exports = User;
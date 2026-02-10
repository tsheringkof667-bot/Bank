const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./index');

class Database {
  constructor() {
    this.db = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.databasePath, (err) => {
        if (err) {
          console.error('❌ Database connection failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to SQLite database');
          this.setupWAL();
          resolve(this.db);
        }
      });
    });
  }

  setupWAL() {
    this.db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) console.error('Failed to set WAL mode:', err);
      else console.log('📝 WAL mode enabled');
    });
    
    this.db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Failed to enable foreign keys:', err);
      else console.log('🔗 Foreign keys enabled');
    });
    
    this.db.run('PRAGMA busy_timeout = 5000;');
    this.db.run('PRAGMA synchronous = NORMAL;');
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else {
          console.log('🔒 Database connection closed');
          resolve();
        }
      });
    });
  }

  beginTransaction() {
    return this.run('BEGIN TRANSACTION');
  }

  commit() {
    return this.run('COMMIT');
  }

  rollback() {
    return this.run('ROLLBACK');
  }
}

const dbInstance = new Database();
module.exports = dbInstance;
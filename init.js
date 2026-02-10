const db = require('../../config/database');

async function createTables() {
  try {
    await db.connect();

    // Users table
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT,
        date_of_birth DATE,
        address TEXT,
        role TEXT DEFAULT 'customer',
        kyc_status TEXT DEFAULT 'pending',
        kyc_document TEXT,
        kyc_verified_at DATETIME,
        totp_secret TEXT,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        last_login DATETIME,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `);

    // Accounts table
    await db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_type TEXT NOT NULL,
        account_number TEXT UNIQUE NOT NULL,
        currency TEXT DEFAULT 'INR',
        current_balance DECIMAL(15,2) DEFAULT 0,
        available_balance DECIMAL(15,2) DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Transactions table
    await db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE NOT NULL,
        from_account_id INTEGER,
        to_account_id INTEGER,
        amount DECIMAL(15,2) NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        reference_id TEXT,
        metadata TEXT,
        error_message TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME,
        FOREIGN KEY (from_account_id) REFERENCES accounts (id),
        FOREIGN KEY (to_account_id) REFERENCES accounts (id)
      )
    `);

    // Loans table
    await db.run(`
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        loan_type TEXT NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        interest_rate DECIMAL(5,2) NOT NULL,
        tenure_months INTEGER NOT NULL,
        remaining_tenure INTEGER NOT NULL,
        emi_amount DECIMAL(15,2) NOT NULL,
        remaining_amount DECIMAL(15,2) NOT NULL,
        purpose TEXT,
        status TEXT NOT NULL,
        remarks TEXT,
        disbursed_at DATETIME,
        last_payment_date DATETIME,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);

    // Loan EMIs table
    await db.run(`
      CREATE TABLE IF NOT EXISTS loan_emis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        emi_number INTEGER NOT NULL,
        due_date DATE NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        principal DECIMAL(15,2) NOT NULL,
        interest DECIMAL(15,2) NOT NULL,
        status TEXT DEFAULT 'pending',
        paid_amount DECIMAL(15,2) DEFAULT 0,
        paid_date DATETIME,
        penalty_amount DECIMAL(15,2) DEFAULT 0,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE CASCADE
      )
    `);

    // Notifications table
    await db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT 0,
        metadata TEXT,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Audit logs table
    await db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create indexes
    await db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_transactions_accounts ON transactions(from_account_id, to_account_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at)');

    console.log('✅ All tables created successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

createTables();
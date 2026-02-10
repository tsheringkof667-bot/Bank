const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { User } = require('../models');
const config = require('../config');
const { ROLES, SECURITY } = require('../config/constants');
const totpService = require('../services/totpService');
const emailService = require('../services/emailService');
const audit = require('../utils/audit');

class AuthController {
  async register(req, res) {
    try {
      const { email, password, first_name, last_name, phone, date_of_birth, address } = req.body;

      // Check if email exists
      if (await User.isEmailTaken(email)) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Create user
      const userId = await User.create({
        email,
        password,
        first_name,
        last_name,
        phone,
        date_of_birth,
        address
      });

      // Create savings account
      const accountNumber = await require('../models/account.model').generateAccountNumber();
      await require('../models/account.model').create({
        user_id: userId,
        account_number: accountNumber,
        account_type: 'savings',
        initial_balance: 1000 // Welcome bonus
      });

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `KoniBank:${email}`,
        length: 20
      });

      await User.setTOTPSecret(userId, secret.base32);

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);

      // Generate JWT token
      const token = jwt.sign(
        { userId, email, role: ROLES.CUSTOMER },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      // Log audit
      await audit.log(userId, 'USER_REGISTER', 'users', userId, {
        email,
        first_name,
        last_name
      });

      // Send welcome email
      await emailService.sendWelcomeEmail(email, first_name, accountNumber);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          token,
          user: { id: userId, email, first_name, last_name },
          account: { accountNumber, balance: 1000 },
          totp: {
            secret: secret.base32,
            qrCode,
            manualCode: secret.otpauth_url
          }
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password, totpCode } = req.body;

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({
          success: false,
          message: 'Account is locked. Try again later.'
        });
      }

      // Verify password
      const isValidPassword = await User.comparePassword(user, password);
      if (!isValidPassword) {
        // Increment login attempts
        const attempts = (user.login_attempts || 0) + 1;
        await User.update(user.id, { login_attempts: attempts });

        if (attempts >= SECURITY.MAX_LOGIN_ATTEMPTS) {
          const lockTime = new Date(Date.now() + SECURITY.LOCKOUT_TIME);
          await User.update(user.id, { locked_until: lockTime.toISOString() });

          await audit.log(null, 'ACCOUNT_LOCKED', 'users', user.id, {
            email,
            attempts,
            ip: req.ip
          });

          return res.status(423).json({
            success: false,
            message: 'Too many failed attempts. Account locked for 15 minutes.'
          });
        }

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Verify TOTP if enabled
      if (user.totp_secret) {
        if (!totpCode) {
          return res.status(400).json({
            success: false,
            message: 'TOTP code required',
            requiresTOTP: true
          });
        }

        const isValidTOTP = totpService.verifyTOTP(user.totp_secret, totpCode);
        if (!isValidTOTP) {
          return res.status(401).json({
            success: false,
            message: 'Invalid TOTP code'
          });
        }
      }

      // Reset login attempts on successful login
      await User.update(user.id, {
        login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString()
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      // Log audit
      await audit.log(user.id, 'USER_LOGIN', 'users', user.id, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            kyc_status: user.kyc_status
          }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }

  async verifyTOTP(req, res) {
    try {
      const { email, totpCode } = req.body;
      const user = await User.findByEmail(email);

      if (!user || !user.totp_secret) {
        return res.status(404).json({
          success: false,
          message: 'User not found or TOTP not enabled'
        });
      }

      const isValid = totpService.verifyTOTP(user.totp_secret, totpCode);

      if (isValid) {
        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        res.json({
          success: true,
          message: 'TOTP verified',
          data: { token }
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'Invalid TOTP code'
        });
      }

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'TOTP verification failed',
        error: error.message
      });
    }
  }

  async enableTOTP(req, res) {
    try {
      const userId = req.user.userId;
      const { totpCode } = req.body;

      const user = await User.findById(userId);
      
      if (user.totp_secret) {
        // Verify existing TOTP
        const isValid = totpService.verifyTOTP(user.totp_secret, totpCode);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            message: 'Invalid TOTP code'
          });
        }

        // TOTP already enabled
        res.json({
          success: true,
          message: 'TOTP already enabled',
          enabled: true
        });
      } else {
        // Generate new TOTP secret
        const secret = speakeasy.generateSecret({
          name: `KoniBank:${user.email}`,
          length: 20
        });

        await User.setTOTPSecret(userId, secret.base32);

        // Generate QR code
        const qrCode = await QRCode.toDataURL(secret.otpauth_url);

        await audit.log(userId, 'TOTP_ENABLED', 'users', userId);

        res.json({
          success: true,
          message: 'TOTP setup initiated',
          data: {
            secret: secret.base32,
            qrCode,
            manualCode: secret.otpauth_url
          }
        });
      }

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'TOTP setup failed',
        error: error.message
      });
    }
  }

  async disableTOTP(req, res) {
    try {
      const userId = req.user.userId;
      const { password, totpCode } = req.body;

      const user = await User.findById(userId);

      // Verify password
      const isValidPassword = await User.comparePassword(user, password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }

      // Verify TOTP
      if (user.totp_secret) {
        const isValidTOTP = totpService.verifyTOTP(user.totp_secret, totpCode);
        if (!isValidTOTP) {
          return res.status(401).json({
            success: false,
            message: 'Invalid TOTP code'
          });
        }
      }

      // Disable TOTP
      await User.setTOTPSecret(userId, null);

      await audit.log(userId, 'TOTP_DISABLED', 'users', userId);

      res.json({
        success: true,
        message: 'TOTP disabled successfully'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to disable TOTP',
        error: error.message
      });
    }
  }

  async logout(req, res) {
    try {
      const userId = req.user.userId;
      
      await audit.log(userId, 'USER_LOGOUT', 'users', userId, {
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: error.message
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        data: { token }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
        error: error.message
      });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const user = await User.findByEmail(email);

      if (!user) {
        // Don't reveal if user exists for security
        return res.json({
          success: true,
          message: 'If the email exists, a reset link will be sent'
        });
      }

      // Generate reset token (valid for 1 hour)
      const resetToken = jwt.sign(
        { userId: user.id, type: 'password_reset' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // Send reset email
      const resetLink = `${config.frontendUrl}/reset-password?token=${resetToken}`;
      await emailService.sendPasswordResetEmail(email, user.first_name, resetLink);

      await audit.log(user.id, 'PASSWORD_RESET_REQUESTED', 'users', user.id);

      res.json({
        success: true,
        message: 'Password reset email sent'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Password reset request failed',
        error: error.message
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded.type !== 'password_reset') {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Update password
      await User.updatePassword(decoded.userId, newPassword);

      await audit.log(decoded.userId, 'PASSWORD_RESET_COMPLETED', 'users', decoded.userId);

      res.json({
        success: true,
        message: 'Password reset successful'
      });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Password reset failed',
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();
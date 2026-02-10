const { ROLES, RESPONSE_CODES } = require('../config/constants');

module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(RESPONSE_CODES.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
    return res.status(RESPONSE_CODES.FORBIDDEN).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};
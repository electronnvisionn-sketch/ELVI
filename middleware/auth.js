/**
 * ELECTRON VISION - Authentication Middleware
 * Re-exports from security.js with additional auth-specific functions
 */

require('dotenv').config();

// Re-export all functions from security.js for compatibility
const security = require('./security');

const {
  generateTokens,
  generateOTP,
  hashString,
  compareString,
  verifyAccessToken,
  verifyRefreshToken,
  checkRateLimit,
  recordFailedLogin,
  isAccountLocked,
  getClientIP,
  authenticate,
  requireAdmin,
  optionalAuth,
  JWT_SECRET,
  REFRESH_SECRET,
  unlockAccount
} = security;

// Generate email verification OTP (auth-specific)
async function generateEmailOTP(email) {
  const db = require('../database');
  const otp = generateOTP();
  const hashedOTP = await hashString(otp);
  const expires = Date.now() + 15 * 60 * 1000;
  
  db.prepare(`
    INSERT OR REPLACE INTO email_otp (email, otp, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(email, hashedOTP, new Date(expires).toISOString());
  
  return otp;
}

// Verify email OTP (auth-specific)
async function verifyEmailOTP(email, otp) {
  const db = require('../database');
  const record = db.prepare('SELECT * FROM email_otp WHERE email = ? AND expires_at > datetime("now") ORDER BY created_at DESC LIMIT 1').get(email);
  
  if (!record) {
    return false;
  }
  
  const isValid = await compareString(otp, record.otp);
  
  if (isValid) {
    db.prepare('DELETE FROM email_otp WHERE email = ?').run(email);
    return true;
  }
  
  return false;
}

// Export all functions
module.exports = {
  // Re-exported from security.js
  generateTokens,
  generateToken: generateTokens, // Alias for backward compatibility
  generateOTP,
  verifyAccessToken,
  verifyRefreshToken,
  checkRateLimit,
  recordFailedLogin,
  isAccountLocked,
  getClientIP,
  authenticate,
  requireAdmin,
  optionalAuth,
  JWT_SECRET,
  REFRESH_SECRET,
  
  // Auth-specific functions
  generateEmailOTP,
  verifyEmailOTP,
  hashString,
  compareString,
  unlockAccount
};

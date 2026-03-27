/**
 * ELECTRON VISION - Advanced Security Middleware
 * Ultra-Secure Security System with Comprehensive Protection
 */

require('dotenv').config();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../database');

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

const SECURITY_CONFIG = {
  // JWT Configuration
  JWT_EXPIRY: '4h',
  REFRESH_TOKEN_EXPIRY: '30d',
  
  // Password Security
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_HASH_ROUNDS: 14,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_SPECIAL: true,
  
  // Account Lockout
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  LOCKOUT_DURATION: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION) || 1800, // seconds
  ATTEMPT_WINDOW: parseInt(process.env.LOGIN_ATTEMPT_WINDOW) || 900, // seconds
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  GENERAL_RATE_LIMIT: 1000,
  AUTH_RATE_LIMIT: 10,
  API_RATE_LIMIT: 100,
  
  // Admin Panel Security
  ADMIN_PATH_HASH: crypto.createHash('sha256').update(process.env.ADMIN_SECRET || 'admin-panel-secret').digest('hex').substring(0, 16),
  ADMIN_IP_WHITELIST: (process.env.ADMIN_IP_WHITELIST || '').split(',').filter(ip => ip.trim()),
  
  // Session Security
  SESSION_COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
  REFRESH_COOKIE_MAX_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  // OTP Configuration
  OTP_LENGTH: 6,
  OTP_EXPIRY: 15 * 60 * 1000, // 15 minutes
  OTP_MAX_ATTEMPTS: 3,
};

// ============================================================================
// JWT SECRETS - MUST BE SET IN PRODUCTION
// ============================================================================

let JWT_SECRET = process.env.JWT_SECRET;
let REFRESH_SECRET = process.env.REFRESH_SECRET;
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Fallback secrets (WARNING: Should NOT be used in production)
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  WARNING: Using auto-generated JWT_SECRET. Set JWT_SECRET in .env for production!');
}
if (!REFRESH_SECRET) {
  REFRESH_SECRET = crypto.randomBytes(64).toString('hex');
}
if (!ENCRYPTION_KEY) {
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: Using auto-generated ENCRYPTION_KEY. Set ENCRYPTION_KEY in .env for production!');
}

// ============================================================================
// CRYPTOGRAPHY FUNCTIONS
// ============================================================================

// Generate secure random string
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Hash string with bcrypt
async function hashString(str, rounds = SECURITY_CONFIG.PASSWORD_HASH_ROUNDS) {
  return bcrypt.hash(str, rounds);
}

// Compare string with hash
async function compareString(str, hash) {
  return bcrypt.compare(str, hash);
}

// Encrypt sensitive data
function encryptData(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    data: encrypted,
    tag: authTag.toString('hex')
  };
}

// Decrypt sensitive data
function decryptData(encryptedData) {
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

// Hash IP address for logging
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

// ============================================================================
// PASSWORD VALIDATION
// ============================================================================

function validatePassword(password) {
  const errors = [];
  
  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} characters`);
  }
  if (SECURITY_CONFIG.PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (SECURITY_CONFIG.PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (SECURITY_CONFIG.PASSWORD_REQUIRE_NUMBERS && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (SECURITY_CONFIG.PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// JWT TOKEN MANAGEMENT
// ============================================================================

function generateTokens(user, ip = 'unknown') {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_verified: user.is_verified,
    ip: hashIP(ip),
    iat: Date.now()
  };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: SECURITY_CONFIG.JWT_EXPIRY,
    issuer: 'electron-vision',
    subject: user.id.toString()
  });
  
  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh', ip: hashIP(ip) },
    REFRESH_SECRET,
    { expiresIn: SECURITY_CONFIG.REFRESH_TOKEN_EXPIRY }
  );
  
  return { accessToken, refreshToken };
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'electron-vision'
    });
  } catch (err) {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (err) {
    return null;
  }
}

// ============================================================================
// RATE LIMITING SYSTEM
// ============================================================================

const rateLimitStore = new Map();
const ipRequestLog = new Map();

function checkRateLimit(ip, action = 'default') {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const windowMs = SECURITY_CONFIG.RATE_LIMIT_WINDOW;
  
  let record = rateLimitStore.get(key);
  
  if (!record || now - record.start > windowMs) {
    record = { start: now, count: 0, blocked: false };
  }
  
  record.count++;
  
  // Stricter limits for auth actions
  if (action === 'login' && record.count > SECURITY_CONFIG.AUTH_RATE_LIMIT) {
    record.blocked = true;
    record.blockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION * 1000;
  }
  
  rateLimitStore.set(key, record);
  
  if (record.blocked && now < record.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((record.blockedUntil - now) / 1000)
    };
  }
  
  return {
    allowed: true,
    remaining: Math.max(0, SECURITY_CONFIG.GENERAL_RATE_LIMIT - record.count)
  };
}

// ============================================================================
// LOGIN ATTEMPTS & ACCOUNT LOCKOUT
// ============================================================================

const loginAttempts = new Map();
const lockedAccounts = new Map();

function recordFailedLogin(email, ip) {
  const key = `login:${email}`;
  const now = Date.now();
  const windowMs = SECURITY_CONFIG.ATTEMPT_WINDOW * 1000;
  
  let attempts = loginAttempts.get(key) || [];
  attempts = attempts.filter(a => now - a.time < windowMs);
  attempts.push({ time: now, ip, attempt: now });
  
  loginAttempts.set(key, attempts);
  
  // Auto-cleanup old entries
  if (loginAttempts.size > 10000) {
    const cutoff = now - 3600000;
    for (const [k, v] of loginAttempts) {
      if (v.length === 0 || (v[0] && v[0].time < cutoff)) {
        loginAttempts.delete(k);
      }
    }
  }
  
  return attempts.length;
}

function isAccountLocked(email) {
  const locked = lockedAccounts.get(email);
  if (locked && locked.until > Date.now()) {
    return true;
  }
  lockedAccounts.delete(email);
  return false;
}

function lockAccount(email, duration = SECURITY_CONFIG.LOCKOUT_DURATION) {
  lockedAccounts.set(email, {
    until: Date.now() + duration * 1000,
    reason: 'Too many failed login attempts'
  });
}

function unlockAccount(email) {
  lockedAccounts.delete(email);
  loginAttempts.delete(`login:${email}`);
}

function getFailedAttemptCount(email) {
  const attempts = loginAttempts.get(`login:${email}`) || [];
  const now = Date.now();
  const windowMs = SECURITY_CONFIG.ATTEMPT_WINDOW * 1000;
  return attempts.filter(a => now - a.time < windowMs).length;
}

// ============================================================================
// IP ADDRESS UTILITIES
// ============================================================================

function getClientIP(req) {
  // Check for forwarded headers (when behind proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  
  return req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

function isIPWhitelisted(ip) {
  if (SECURITY_CONFIG.ADMIN_IP_WHITELIST.length === 0) {
    return true; // No whitelist = allow all
  }
  return SECURITY_CONFIG.ADMIN_IP_WHITELIST.includes(ip);
}

// ============================================================================
// ADMIN PATH OBFUSCATION
// ============================================================================

function getAdminPath() {
  return `/panel-${SECURITY_CONFIG.ADMIN_PATH_HASH}`;
}

function isAdminPath(path) {
  return path.startsWith('/panel');
}

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Main authentication middleware
function authenticate(req, res, next) {
  let token = req.headers.authorization?.split(' ')[1];

  // Treat "undefined" and "null" strings as no token
  if (token === 'undefined' || token === 'null') {
    token = null;
  }

  // Try cookie if not in header
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  // Try client_token cookie (non-HTTP-only for JS access)
  if (!token && req.cookies?.client_token) {
    token = req.cookies.client_token;
  }

  // Try custom header
  if (!token && req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized access',
      code: 'NO_TOKEN',
      requireLogin: true
    });
  }
  
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
      requireLogin: true
    });
  }
  
  // Verify IP matches (optional security enhancement) - only if explicitly enabled
  const clientIP = getClientIP(req);
  if (process.env.ENABLE_IP_BINDING === 'true' && decoded.ip) {
    const tokenIP = decoded.ip;
    const currentIPHash = hashIP(clientIP);
    
    // Only block if IP changed significantly (not for same IP behind proxy)
    if (tokenIP && tokenIP !== currentIPHash && process.env.STRICT_IP_BINDING === 'true') {
      // Log potential token theft attempt but don't block (too strict for some cases)
      console.warn('IP mismatch detected:', { tokenIP, currentIPHash, userId: decoded.id });
    }
  }
  
  // Attach user info to request
  req.user = {
    id: decoded.id,
    username: decoded.username,
    email: decoded.email,
    role: decoded.role,
    is_verified: decoded.is_verified
  };
  
  next();
}

// Admin authorization middleware
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
  }
  
  const adminRoles = ['admin', 'manager', 'moderator'];
  if (!adminRoles.includes(req.user.role)) {
    logSecurityEvent('unauthorized_admin_access', {
      userId: req.user.id,
      userRole: req.user.role,
      path: req.path,
      ip: getClientIP(req)
    });
    
    return res.status(403).json({
      error: 'Admin access required',
      code: 'NOT_ADMIN'
    });
  }
  
  // Check IP whitelist for admin
  const clientIP = getClientIP(req);
  if (!isIPWhitelisted(clientIP)) {
    logSecurityEvent('admin_ip_blocked', {
      userId: req.user.id,
      ip: clientIP,
      path: req.path
    });
    
    return res.status(403).json({
      error: 'Access denied from this IP',
      code: 'IP_NOT_WHITELISTED'
    });
  }
  
  next();
}

// Optional authentication middleware
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] ||
                req.cookies?.token ||
                req.headers['x-session-token'];
  
  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      const user = db.prepare(
        'SELECT id, username, email, role, is_verified FROM users WHERE id = ?'
      ).get(decoded.id);
      
      if (user) {
        req.user = user;
      }
    }
  }
  
  next();
}

// ============================================================================
// SECURITY EVENT LOGGING
// ============================================================================

function logSecurityEvent(eventType, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event: eventType,
    ...data
  };
  
  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SECURITY]', JSON.stringify(logEntry));
  }
  
  // Store in database for audit
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.userId || null,
      eventType,
      JSON.stringify(data),
      data.ip || 'unknown',
      timestamp
    );
  } catch (e) {
    console.error('Failed to log security event:', e.message);
  }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUsername(username) {
  // Username must be 3-20 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  SECURITY_CONFIG,
  
  // Crypto functions
  generateSecureToken,
  generateOTP,
  hashString,
  compareString,
  encryptData,
  decryptData,
  hashIP,
  
  // Password validation
  validatePassword,
  
  // JWT
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  
  // Rate limiting
  checkRateLimit,
  
  // Login attempts
  recordFailedLogin,
  isAccountLocked,
  lockAccount,
  unlockAccount,
  getFailedAttemptCount,
  
  // IP utilities
  getClientIP,
  isIPWhitelisted,
  
  // Admin
  getAdminPath,
  isAdminPath,
  requireAdmin,
  
  // Auth middleware
  authenticate,
  optionalAuth,
  
  // Security logging
  logSecurityEvent,
  
  // Validation
  validateEmail,
  validateUsername,
  sanitizeInput,
  
  // Secrets (for internal use)
  JWT_SECRET,
  REFRESH_SECRET,
  ENCRYPTION_KEY
};

/**
 * ELECTRON VISION - Database Security Module
 * Advanced Database Protection and Encryption
 */

require('dotenv').config();

const crypto = require('crypto');
const db = require('../database');

// ============================================================================
// DATABASE SECURITY CONFIGURATION
// ============================================================================

const DB_SECURITY_CONFIG = {
  // Encryption key from environment
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  
  // Column-level encryption settings
  ENCRYPTED_COLUMNS: [
    'password',
    'verification_token',
    'otp',
    '2fa_secret',
    'api_key',
    'secret_key'
  ],
  
  // Sensitive data that should never be logged
  SENSITIVE_FIELDS: [
    'password',
    'verification_token',
    'otp',
    '2fa_secret',
    'api_key',
    'secret_key',
    'token',
    'refresh_token',
    'access_token'
  ],
  
  // Fields to exclude from API responses
  EXCLUDE_FROM_RESPONSE: [
    'password',
    'verification_token',
    '2fa_secret',
    'api_key',
    'secret_key'
  ]
};

// ============================================================================
// DATA ENCRYPTION/DECRYPTION
// ============================================================================

function encryptColumn(data) {
  if (!data) return null;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(DB_SECURITY_CONFIG.ENCRYPTION_KEY.substring(0, 32), 'utf8'),
    iv
  );
  
  let encrypted = cipher.update(String(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: authTag.toString('hex')
  };
}

function decryptColumn(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'object') {
    return encryptedData;
  }
  
  try {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.tag, 'hex');
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(DB_SECURITY_CONFIG.ENCRYPTION_KEY.substring(0, 32), 'utf8'),
      iv
    );
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (e) {
    console.error('Decryption error:', e.message);
    return null;
  }
}

// ============================================================================
// SENSITIVE DATA HANDLING
// ============================================================================

function maskSensitiveData(data) {
  if (!data) return data;
  
  const masked = { ...data };
  
  DB_SECURITY_CONFIG.SENSITIVE_FIELDS.forEach(field => {
    if (masked[field]) {
      if (field === 'password') {
        masked[field] = '********';
      } else if (typeof masked[field] === 'string' && masked[field].length > 8) {
        masked[field] = masked[field].substring(0, 4) + '****' + masked[field].substring(masked[field].length - 4);
      } else {
        masked[field] = '****';
      }
    }
  });
  
  return masked;
}

function sanitizeQueryResult(result) {
  if (!result) return result;
  
  if (Array.isArray(result)) {
    return result.map(item => sanitizeQueryResult(item));
  }
  
  if (typeof result === 'object') {
    return maskSensitiveData(result);
  }
  
  return result;
}

// ============================================================================
// SECURE QUERY EXECUTION
// ============================================================================

function safeQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.all(...params);
    return sanitizeQueryResult(result);
  } catch (e) {
    console.error('Database query error:', e.message);
    throw new Error('Database operation failed');
  }
}

function safeRun(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return result;
  } catch (e) {
    console.error('Database operation error:', e.message);
    throw new Error('Database operation failed');
  }
}

function safeGet(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.get(...params);
    return sanitizeQueryResult(result);
  } catch (e) {
    console.error('Database query error:', e.message);
    throw new Error('Database operation failed');
  }
}

// ============================================================================
// SQL INJECTION PREVENTION
// ============================================================================

function validateSQLInput(input) {
  if (typeof input !== 'string') return input;
  
  // Check for SQL injection patterns
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\b)/i,
    /(--)/,
    /(\/\*|\*\/)/,
    /(\bOR\b.*=.*\bOR\b)/i,
    /(\bAND\b.*=.*\bAND\b)/i,
    /(\bNOT\b\s+\bIN\b)/i,
    /(\bLIKE\b.*[%;])/i,
    /([;'])/,
    /(0x[0-9a-fA-F]+)/
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(input)) {
      console.warn('Potential SQL injection attempt detected:', input);
      throw new Error('Invalid input detected');
    }
  }
  
  return input;
}

// ============================================================================
// DATABASE AUDIT LOGGING
// ============================================================================

function logDBAction(action, table, recordId, userId, details) {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(
      userId,
      `db:${action}:${table}`,
      JSON.stringify({ recordId, ...details }),
      details.ip || 'unknown'
    );
  } catch (e) {
    console.error('Failed to log database action:', e.message);
  }
}

// ============================================================================
// SECURE USER PASSWORD OPERATIONS
// ============================================================================

const bcrypt = require('bcrypt');

async function hashPassword(password) {
  // Use high cost factor for security
  return bcrypt.hash(password, 14);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function validatePasswordStrength(password) {
  const errors = [];
  
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain special characters');
  }
  
  // Check for common passwords
  const commonPasswords = [
    'password', '123456', 'qwerty', 'admin', 'letmein',
    'welcome', 'monkey', 'dragon', 'master', 'login'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// ADMIN IP TRACKING
// ============================================================================

function trackAdminIP(userId, ip) {
  try {
    // Store or update admin IP
    const existing = db.prepare('SELECT * FROM admin_sessions WHERE user_id = ?').get(userId);
    
    if (existing) {
      db.prepare(`
        UPDATE admin_sessions 
        SET last_ip = ?, last_login = datetime('now'), is_active = 1 
        WHERE user_id = ?
      `).run(ip, userId);
    } else {
      db.prepare(`
        INSERT INTO admin_sessions (user_id, ip_address, last_ip, is_active)
        VALUES (?, ?, ?, 1)
      `).run(userId, ip, ip);
    }
  } catch (e) {
    console.error('Failed to track admin IP:', e.message);
  }
}

function verifyAdminIP(userId, ip) {
  try {
    const session = db.prepare(`
      SELECT * FROM admin_sessions 
      WHERE user_id = ? AND is_active = 1
    `).get(userId);
    
    if (!session) return true; // No previous session
    
    // If IP has changed significantly, log warning
    if (session.last_ip && session.last_ip !== ip) {
      logDBAction('ip_change', 'admin_sessions', userId, userId, {
        oldIP: session.last_ip,
        newIP: ip,
        warning: 'Admin IP changed'
      });
    }
    
    return true;
  } catch (e) {
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  DB_SECURITY_CONFIG,
  
  // Encryption
  encryptColumn,
  decryptColumn,
  
  // Data sanitization
  maskSensitiveData,
  sanitizeQueryResult,
  
  // Secure queries
  safeQuery,
  safeRun,
  safeGet,
  
  // SQL injection prevention
  validateSQLInput,
  
  // Audit logging
  logDBAction,
  
  // Password operations
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  
  // Admin IP tracking
  trackAdminIP,
  verifyAdminIP
};

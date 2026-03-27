/**
 * ELECTRON VISION - Comprehensive Logging System
 * Advanced Security Logging and Monitoring
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Log directory
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file paths
const LOG_FILES = {
  ACCESS: path.join(LOG_DIR, 'access.log'),
  ERROR: path.join(LOG_DIR, 'error.log'),
  SECURITY: path.join(LOG_DIR, 'security.log'),
  AUDIT: path.join(LOG_DIR, 'audit.log'),
  PERFORMANCE: path.join(LOG_DIR, 'performance.log')
};

// Ensure all log files exist
Object.values(LOG_FILES).forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
  }
});

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };
  
  return JSON.stringify(logEntry);
}

function writeToFile(filePath, content) {
  try {
    fs.appendFileSync(filePath, content + '\n');
  } catch (e) {
    console.error('Failed to write to log file:', e.message);
  }
}

function log(level, message, meta = {}) {
  // Console output
  const consoleMsg = `[${level}] ${message}`;
  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(consoleMsg, meta);
  } else if (level === 'WARN') {
    console.warn(consoleMsg, meta);
  } else {
    console.log(consoleMsg, meta);
  }
  
  // File output (only in production or if explicitly enabled)
  if (process.env.ENABLE_FILE_LOGGING !== 'false') {
    const formatted = formatLog(level, message, meta);
    
    if (level === 'ERROR' || level === 'CRITICAL') {
      writeToFile(LOG_FILES.ERROR, formatted);
    }
    
    if (level === 'SECURITY' || level === 'AUDIT') {
      writeToFile(LOG_FILES.SECURITY, formatted);
    }
    
    // Always write access logs
    writeToFile(LOG_FILES.ACCESS, formatted);
  }
}

// ============================================================================
// LOG FUNCTIONS FOR DIFFERENT CATEGORIES
// ============================================================================

function debug(message, meta) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    log('DEBUG', message, meta);
  }
}

function info(message, meta) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    log('INFO', message, meta);
  }
}

function warn(message, meta) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    log('WARN', message, meta);
  }
}

function error(message, meta) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    log('ERROR', message, meta);
  }
}

function critical(message, meta) {
  if (currentLevel <= LOG_LEVELS.CRITICAL) {
    log('CRITICAL', message, meta);
  }
}

// Security event logging
function logSecurity(event, data) {
  const logData = {
    ...data,
    securityEvent: event,
    timestamp: new Date().toISOString()
  };
  
  log('SECURITY', event, logData);
}

// Audit logging for important actions
function logAudit(action, userId, details) {
  const logData = {
    auditAction: action,
    userId,
    ...details,
    timestamp: new Date().toISOString()
  };
  
  log('AUDIT', action, logData);
}

// Performance logging
function logPerformance(endpoint, duration, meta = {}) {
  const logData = {
    endpoint,
    duration: `${duration}ms`,
    ...meta,
    timestamp: new Date().toISOString()
  };
  
  log('INFO', `Performance: ${endpoint}`, logData);
  
  if (process.env.ENABLE_FILE_LOGGING !== 'false') {
    writeToFile(LOG_FILES.PERFORMANCE, formatLog('INFO', `Performance: ${endpoint}`, logData));
  }
}

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Add request ID to request
  req.requestId = requestId;
  
  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer']
    };
    
    // Log based on status code
    if (res.statusCode >= 500) {
      error(`Server Error: ${req.method} ${req.url}`, logData);
    } else if (res.statusCode >= 400) {
      warn(`Client Error: ${req.method} ${req.url}`, logData);
    } else {
      debug(`${req.method} ${req.url}`, logData);
    }
    
    // Log performance for slow requests
    if (duration > 1000) {
      logPerformance(req.url, duration, logData);
    }
  });
  
  next();
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  const errorData = {
    requestId,
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    url: req.url,
    method: req.method,
    body: process.env.NODE_ENV === 'production' ? undefined : req.body,
    timestamp: new Date().toISOString()
  };
  
  // Log the error
  if (err.status === 404) {
    warn(`Not Found: ${req.url}`, errorData);
  } else {
    error(`Error: ${err.message}`, errorData);
  }
  
  // Check if request wants HTML (browser) or JSON (API)
  const accept = req.headers.accept || '';
  const wantsHTML = accept.includes('text/html');
  
  if (wantsHTML) {
    // Send HTML error page for browsers
    res.status(err.status || 500).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  } else {
    // Send JSON for API requests
    const response = {
      error: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message,
      requestId
    };
    
    if (process.env.NODE_ENV !== 'production') {
      response.stack = err.stack;
    }
    
    res.status(err.status || 500).json(response);
  }
}

// ============================================================================
// SECURITY MONITORING
// ============================================================================

// Track suspicious activities
const suspiciousActivities = new Map();

function detectSuspiciousActivity(ip, type) {
  const key = `${ip}:${type}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  
  let activity = suspiciousActivities.get(key);
  
  if (!activity) {
    activity = { count: 0, firstSeen: now, lastSeen: now };
  }
  
  activity.count++;
  activity.lastSeen = now;
  
  // Clean old entries
  if (now - activity.firstSeen > windowMs) {
    activity.count = 1;
    activity.firstSeen = now;
  }
  
  suspiciousActivities.set(key, activity);
  
  // Alert if suspicious
  if (activity.count > 100) {
    logSecurity('SUSPICIOUS_ACTIVITY_DETECTED', {
      ip,
      type,
      count: activity.count,
      window: windowMs
    });
    return true;
  }
  
  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Log functions
  debug,
  info,
  warn,
  error,
  critical,
  
  // Specialized logging
  logSecurity,
  logAudit,
  logPerformance,
  
  // Middleware
  requestLogger,
  errorHandler,
  
  // Utilities
  detectSuspiciousActivity,
  
  // Log levels
  LOG_LEVELS,
  
  // Log file paths (for external access)
  LOG_FILES
};

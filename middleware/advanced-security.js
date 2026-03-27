/**
 * ELECTRON VISION - Advanced Security Middleware
 * Anomaly Detection, Smart Throttling, DDoS Protection
 */

const fs = require('fs');
const db = require('../database');
const { getClientIP, logSecurityEvent } = require('./security');

// Security log file for logging (local path - no sudo required)
const path = require('path');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const FAIL2BAN_LOG = path.join(LOG_DIR, 'security.log');
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(FAIL2BAN_LOG)) fs.writeFileSync(FAIL2BAN_LOG, '');
} catch (e) { /* silent - log file is optional */ }

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Per-endpoint rate limits (requests per window)
  ENDPOINT_LIMITS: {
    '/api/auth/login':       { windowMs: 15 * 60 * 1000, max: 15,  blockDuration: 15 * 60 * 1000 },
    '/api/auth/register':    { windowMs: 60 * 60 * 1000, max: 5,   blockDuration: 30 * 60 * 1000 },
    '/api/contact':          { windowMs: 60 * 60 * 1000, max: 10,  blockDuration: 15 * 60 * 1000 },
    '/api/support/tickets':  { windowMs: 60 * 60 * 1000, max: 20,  blockDuration: 15 * 60 * 1000 },
    '/api/upload':           { windowMs: 60 * 60 * 1000, max: 30,  blockDuration: 15 * 60 * 1000 },
    'default':               { windowMs: 15 * 60 * 1000, max: 2000, blockDuration: 5 * 60 * 1000 },
  },

  // Anomaly detection
  ANOMALY_WINDOW: 5 * 60 * 1000,      // 5 minutes
  ANOMALY_THRESHOLD: 1000,             // requests in window = suspicious
  BURST_THRESHOLD: 100,                // requests in 10 seconds = burst
  BURST_WINDOW: 10 * 1000,

  // Slowloris protection
  SLOW_REQUEST_TIMEOUT: 30 * 1000,     // 30 seconds max per request

  // Suspicious patterns that indicate automated attacks
  SUSPICIOUS_UA: [
    'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab',
    'dirbuster', 'gobuster', 'wfuzz', 'burp',
    'havij', 'acunetix', 'nessus', 'openvas',
    'python-requests/2', 'Go-http-client', 'curl/',
    'wget/', 'libwww-perl', 'Python-urllib',
  ],

  // Paths that should never be accessed
  BLOCKED_PATHS: [
    '/.env', '/wp-admin', '/wp-login', '/xmlrpc.php',
    '/phpmyadmin', '/admin.php', '/config.php',
    '/.git', '/.svn', '/.htaccess', '/server-status',
    '/actuator', '/debug', '/console', '/shell',
    '/cgi-bin', '/boaform', '/setup.cgi',
  ],

  // Throttle delay for suspicious IPs (ms)
  THROTTLE_DELAY: 2000,
  THROTTLE_SCORE: 50,
};

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

const ipStore = new Map();      // ip -> { requests: [], score: 0, blocked: until }
const endpointStore = new Map(); // ip:endpoint -> { count, start, blocked }

// Auto-cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ipStore) {
    if (val.requests) {
      val.requests = val.requests.filter(t => now - t < CONFIG.ANOMALY_WINDOW);
    }
    if (val.blocked && val.blocked < now) {
      ipStore.delete(key);
    }
    if (!val.blocked && val.requests && val.requests.length === 0) {
      ipStore.delete(key);
    }
  }
  for (const [key, val] of endpointStore) {
    if (val.blocked && val.blocked < now) {
      endpointStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ============================================================================
// HELPERS
// ============================================================================

function getEndpointKey(path) {
  // Normalize path to match configured limits
  for (const key of Object.keys(CONFIG.ENDPOINT_LIMITS)) {
    if (key !== 'default' && path.startsWith(key)) return key;
  }
  return 'default';
}

function getIPData(ip) {
  if (!ipStore.has(ip)) {
    ipStore.set(ip, { requests: [], score: 0, blocked: 0 });
  }
  return ipStore.get(ip);
}

function isSuspiciousUA(ua) {
  if (!ua) return true; // No UA = suspicious
  const lower = ua.toLowerCase();
  return CONFIG.SUSPICIOUS_UA.some(s => lower.includes(s.toLowerCase()));
}

function isBlockedPath(path) {
  return CONFIG.BLOCKED_PATHS.some(bp => path.toLowerCase().startsWith(bp));
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

function analyzeRequest(ip, path, ua) {
  const data = getIPData(ip);
  const now = Date.now();

  // Track request timestamp
  data.requests.push(now);

  // Clean old requests
  data.requests = data.requests.filter(t => now - t < CONFIG.ANOMALY_WINDOW);

  // Check for burst (too many in short time)
  const recentRequests = data.requests.filter(t => now - t < CONFIG.BURST_WINDOW);
  if (recentRequests.length > CONFIG.BURST_THRESHOLD) {
    data.score += 5;
    logSuspiciousActivity(ip, 'BURST_DETECTED', {
      count: recentRequests.length,
      path,
      score: data.score,
    });
  }

  // Check anomaly threshold
  if (data.requests.length > CONFIG.ANOMALY_THRESHOLD) {
    data.score += 3;
    logSuspiciousActivity(ip, 'ANOMALY_HIGH_RATE', {
      count: data.requests.length,
      score: data.score,
    });
  }

  // Suspicious user agent
  if (isSuspiciousUA(ua)) {
    data.score += 2;
  }

  // Blocked path access
  if (isBlockedPath(path)) {
    data.score += 10;
    logSuspiciousActivity(ip, 'BLOCKED_PATH_ACCESS', { path, score: data.score });
  }

  // Auto-block if score exceeds threshold
  if (data.score >= CONFIG.THROTTLE_SCORE && !data.blocked) {
    data.blocked = now + 5 * 60 * 1000; // Block for 5 minutes
    logSuspiciousActivity(ip, 'AUTO_BLOCKED', {
      score: data.score,
      duration: '5min',
    });
  }

  // Decay score over time
  if (data.requests.length < 10 && data.score > 0) {
    data.score = Math.max(0, data.score - 1);
  }

  return data;
}

// ============================================================================
// ENDPOINT-SPECIFIC RATE LIMITING
// ============================================================================

function checkEndpointLimit(ip, path) {
  const endpointKey = getEndpointKey(path);
  const limit = CONFIG.ENDPOINT_LIMITS[endpointKey];
  const storeKey = `${ip}:${endpointKey}`;
  const now = Date.now();

  let record = endpointStore.get(storeKey);

  if (!record || now - record.start > limit.windowMs) {
    record = { start: now, count: 0, blocked: 0 };
  }

  // Check if currently blocked
  if (record.blocked && now < record.blocked) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.blocked - now) / 1000),
      reason: 'endpoint_rate_limit',
    };
  }

  record.count++;

  if (record.count > limit.max) {
    record.blocked = now + limit.blockDuration;
    endpointStore.set(storeKey, record);

    logSuspiciousActivity(ip, 'ENDPOINT_RATE_LIMIT', {
      endpoint: endpointKey,
      count: record.count,
      limit: limit.max,
    });

    return {
      allowed: false,
      retryAfter: Math.ceil(limit.blockDuration / 1000),
      reason: 'endpoint_rate_limit',
    };
  }

  endpointStore.set(storeKey, record);
  return { allowed: true, remaining: limit.max - record.count };
}

// ============================================================================
// SUSPICIOUS ACTIVITY LOG
// ============================================================================

function logSuspiciousActivity(ip, type, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    ip,
    type,
    ...data,
  };

  console.warn('[SECURITY-WARN]', JSON.stringify(entry));

  // Write to Fail2Ban log
  try {
    const logLine = `[${entry.timestamp}] [SECURITY] ip:"${ip}" action:"${type}" data:${JSON.stringify(data)}\n`;
    fs.appendFileSync(FAIL2BAN_LOG, logLine);
  } catch (e) { /* silent */ }

  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(null, `security_${type}`, JSON.stringify(entry), ip);
  } catch (e) { /* silent */ }
}

// ============================================================================
// MAIN MIDDLEWARE
// ============================================================================

function advancedSecurity(req, res, next) {
  const ip = getClientIP(req);
  const path = req.path;
  const ua = req.headers['user-agent'] || '';

  // 1. Block immediately if path is in blocked list
  if (isBlockedPath(path)) {
    logSuspiciousActivity(ip, 'BLOCKED_PATH', { path });
    return res.status(404).end();
  }

  // Skip anomaly/rate checks for static files and auth/me
  const isStatic = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp3|mp4|webm|webp|map)$/i.test(path);
  const isAuthMe = path === '/api/auth/me';

  if (isStatic || isAuthMe) {
    return next();
  }

  // 2. Analyze request for anomalies
  const ipData = analyzeRequest(ip, path, ua);

  // 3. Check if IP is auto-blocked
  if (ipData.blocked && Date.now() < ipData.blocked) {
    const retryAfter = Math.ceil((ipData.blocked - Date.now()) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'تم حظر عنوان IP مؤقتاً بسبب نشاط مشبوه',
      retryAfter,
    });
  }

  // 4. Check endpoint-specific rate limit
  const endpointCheck = checkEndpointLimit(ip, path);
  if (!endpointCheck.allowed) {
    res.set('Retry-After', endpointCheck.retryAfter);
    return res.status(429).json({
      error: 'تم تجاوز الحد المسموح لهذا المسار',
      retryAfter: endpointCheck.retryAfter,
    });
  }

  // 5. Throttle suspicious requests (delay response)
  if (ipData.score >= CONFIG.THROTTLE_SCORE / 2) {
    return setTimeout(() => next(), CONFIG.THROTTLE_DELAY);
  }

  // 6. Add security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-RateLimit-Remaining', String(endpointCheck.remaining || 0));

  next();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  advancedSecurity,
  CONFIG,
  analyzeRequest,
  checkEndpointLimit,
  getIPData,
};

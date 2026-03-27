/**
 * ELECTRON VISION - Application-Level Firewall
 * Replaces iptables/ufw with pure Node.js middleware
 * NO sudo required - works on any free hosting
 */

const { getClientIP, logSecurityEvent } = require('./security');
const db = require('../database');

// ============================================================================
// CONFIGURATION (mirrors iptables rules but at application level)
// ============================================================================

const FIREWALL_CONFIG = {
  // General rate limiting (replaces iptables INPUT rate limits)
  GLOBAL_MAX_REQUESTS_PER_MINUTE: parseInt(process.env.FW_GLOBAL_RPM) || 120,
  GLOBAL_MAX_CONNECTIONS_PER_IP: parseInt(process.env.FW_MAX_CONCURRENT) || 30,

  // SYN flood protection (replaces iptables --syn rules)
  SYN_FLOOD_WINDOW: 10 * 1000,
  SYN_FLOOD_MAX: parseInt(process.env.FW_SYN_MAX) || 20,
  SYN_FLOOD_BLOCK_DURATION: parseInt(process.env.FW_SYN_BLOCK) || 300,

  // HTTP brute force (replaces iptables recent module)
  HTTP_BRUTE_WINDOW: 60 * 1000,
  HTTP_BRUTE_MAX: parseInt(process.env.FW_HTTP_BRUTE) || 100,
  HTTP_BRUTE_BLOCK_DURATION: parseInt(process.env.FW_HTTP_BRUTE_BLOCK) || 600,

  // Auth brute force (replaces iptables SSH brute force rule)
  AUTH_BRUTE_WINDOW: 10 * 60 * 1000,
  AUTH_BRUTE_MAX: parseInt(process.env.FW_AUTH_BRUTE) || 5,
  AUTH_BRUTE_BLOCK_DURATION: parseInt(process.env.FW_AUTH_BRUTE_BLOCK) || 900,

  // Invalid request detection (replaces iptables INVALID/Christmas tree rules)
  MAX_HEADER_SIZE: 64 * 1024,
  MAX_URL_LENGTH: 2048,

  // Anti-spoofing (replaces iptables anti-spoofing rules)
  SPOOFED_HEADERS: ['x-forwarded-for', 'x-real-ip', 'x-originating-ip', 'x-remote-ip'],

  // Port scanning protection (replaces iptables scan detection)
  SCAN_DETECTION_WINDOW: 5 * 60 * 1000,
  SCAN_DETECTION_THRESHOLD: parseInt(process.env.FW_SCAN_THRESHOLD) || 40,
  SCAN_BLOCK_DURATION: parseInt(process.env.FW_SCAN_BLOCK) || 3600,

  // Blocked ports (replaces iptables port rules - only allow HTTP traffic)
  ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],

  // Blocked paths (replaces sensitive port protection)
  BLOCKED_SENSITIVE_PATHS: [
    '/.env', '/.env.local', '/.env.production', '/.env.development',
    '/wp-admin', '/wp-login.php', '/wp-content', '/wp-includes',
    '/xmlrpc.php', '/phpmyadmin', '/admin.php', '/config.php',
    '/.git', '/.git/config', '/.gitignore', '/.svn', '/.hg',
    '/.htaccess', '/.htpasswd', '/server-status', '/server-info',
    '/actuator', '/actuator/health', '/actuator/env',
    '/debug', '/console', '/shell', '/cgi-bin',
    '/boaform', '/setup.cgi', '/GponForm', '/api/v1/pods',
    '/solr', '/manager', '/jmx-console', '/web-console',
  ],

  // Log settings (replaces iptables LOG rule)
  LOG_DROPPED: true,
  LOG_MAX_PER_MINUTE: 10,
};

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

const state = {
  // Per-IP tracking
  ipRequests: new Map(),       // ip -> { timestamps[], connections, score }
  ipSynFlood: new Map(),       // ip -> { timestamps[] }
  ipAuthAttempts: new Map(),   // ip -> { timestamps[], blocked: until }
  ipScanDetect: new Map(),     // ip -> { paths: Set, blocked: until }
  ipBlock: new Map(),          // ip -> { reason, until, permanent }

  // Global tracking
  activeConnections: new Map(), // ip -> count
  logCounter: { count: 0, windowStart: Date.now() },
};

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

function initFirewallDatabase() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS firewall_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_fw_logs_ip ON firewall_logs(ip_address);
    `).run();

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_fw_logs_time ON firewall_logs(created_at);
    `).run();

    console.log('[FIREWALL] Database initialized');
  } catch (error) {
    console.error('[FIREWALL] Database init error:', error.message);
  }
}

// ============================================================================
// LOGGING (replaces iptables LOG target)
// ============================================================================

function logFirewall(action, ip, reason, details = {}) {
  if (!FIREWALL_CONFIG.LOG_DROPPED) return;

  const now = Date.now();
  if (now - state.logCounter.windowStart > 60000) {
    state.logCounter = { count: 0, windowStart: now };
  }
  state.logCounter.count++;

  if (state.logCounter.count > FIREWALL_CONFIG.LOG_MAX_PER_MINUTE) return;

  const entry = { action, ip, reason, ...details };
  console.warn(`[FIREWALL-${action.toUpperCase()}]`, JSON.stringify(entry));

  try {
    db.prepare(`
      INSERT INTO firewall_logs (ip_address, action, reason, details)
      VALUES (?, ?, ?, ?)
    `).run(ip, action, reason, JSON.stringify(details));
  } catch (e) { /* silent */ }
}

// ============================================================================
// IP BLOCKING (replaces iptables DROP rules)
// ============================================================================

function isBlocked(ip) {
  const block = state.ipBlock.get(ip);
  if (!block) return false;
  if (block.permanent) return true;
  if (block.until && Date.now() > block.until) {
    state.ipBlock.delete(ip);
    return false;
  }
  return true;
}

function blockIP(ip, reason, duration = FIREWALL_CONFIG.SYN_FLOOD_BLOCK_DURATION, permanent = false) {
  state.ipBlock.set(ip, {
    reason,
    until: permanent ? null : Date.now() + duration * 1000,
    permanent,
  });
  logFirewall('BLOCK', ip, reason, { duration, permanent });
}

function unblockIP(ip) {
  state.ipBlock.delete(ip);
  state.ipSynFlood.delete(ip);
  state.ipAuthAttempts.delete(ip);
  state.ipScanDetect.delete(ip);
  state.ipRequests.delete(ip);
  logFirewall('UNBLOCK', ip, 'manual_unblock');
}

function getBlockedIPs() {
  const ips = [];
  for (const [ip, block] of state.ipBlock) {
    ips.push({
      ip,
      reason: block.reason,
      permanent: block.permanent,
      until: block.until,
    });
  }
  return ips;
}

// ============================================================================
// ANTI-SPOOFING (replaces iptables anti-spoofing rules)
// ============================================================================

function checkSpoofing(req, ip) {
  // Block requests with spoofed localhost headers from non-localhost IPs
  const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  const isLocalhost = localhostIPs.some(allowed => ip === allowed || ip.endsWith(':' + allowed));

  if (!isLocalhost) {
    for (const header of FIREWALL_CONFIG.SPOOFED_HEADERS) {
      const value = req.headers[header];
      if (value) {
        const headerIPs = value.split(',').map(v => v.trim());
        for (const headerIP of headerIPs) {
          if (localhostIPs.includes(headerIP)) {
            return { spoofed: true, header, value: headerIP };
          }
        }
      }
    }
  }

  return { spoofed: false };
}

// ============================================================================
// INVALID REQUEST DETECTION (replaces iptables INVALID/Christmas tree rules)
// ============================================================================

function checkInvalidRequest(req) {
  // Check URL length
  if (req.originalUrl && req.originalUrl.length > FIREWALL_CONFIG.MAX_URL_LENGTH) {
    return { invalid: true, reason: 'URL_TOO_LONG' };
  }

  // Check for null bytes (replaces iptables %00 rule)
  if (req.originalUrl && req.originalUrl.includes('\0')) {
    return { invalid: true, reason: 'NULL_BYTES' };
  }

  // Check for newline injection
  if (req.originalUrl && /[\r\n]/.test(req.originalUrl)) {
    return { invalid: true, reason: 'NEWLINE_INJECTION' };
  }

  // Check method (replaces iptables -p tcp rules)
  if (!FIREWALL_CONFIG.ALLOWED_METHODS.includes(req.method)) {
    return { invalid: true, reason: 'INVALID_METHOD' };
  }

  // Check header size
  const headerSize = JSON.stringify(req.headers).length;
  if (headerSize > FIREWALL_CONFIG.MAX_HEADER_SIZE) {
    return { invalid: true, reason: 'HEADERS_TOO_LARGE' };
  }

  // Check for encoded attacks in URL
  if (req.originalUrl && /%0[0-9a-f]/i.test(req.originalUrl)) {
    return { invalid: true, reason: 'CONTROL_CHAR_IN_URL' };
  }

  return { invalid: false };
}

// ============================================================================
// SYN FLOOD PROTECTION (replaces iptables -p tcp --syn -m limit)
// ============================================================================

function checkSYNFlood(ip) {
  const now = Date.now();
  const windowStart = now - FIREWALL_CONFIG.SYN_FLOOD_WINDOW;

  let record = state.ipSynFlood.get(ip);
  if (!record) {
    record = { timestamps: [] };
  }

  record.timestamps.push(now);
  record.timestamps = record.timestamps.filter(t => t > windowStart);
  state.ipSynFlood.set(ip, record);

  if (record.timestamps.length > FIREWALL_CONFIG.SYN_FLOOD_MAX) {
    blockIP(ip, 'SYN_FLOOD', FIREWALL_CONFIG.SYN_FLOOD_BLOCK_DURATION);
    return { blocked: true, count: record.timestamps.length };
  }

  return { blocked: false, count: record.timestamps.length };
}

// ============================================================================
// HTTP BRUTE FORCE PROTECTION (replaces iptables -m recent --update --seconds 60 --hitcount 100)
// ============================================================================

function checkHTTPBrute(ip) {
  const now = Date.now();
  const windowStart = now - FIREWALL_CONFIG.HTTP_BRUTE_WINDOW;

  let record = state.ipRequests.get(ip);
  if (!record) {
    record = { timestamps: [], connections: 0, score: 0 };
  }

  record.timestamps.push(now);
  record.timestamps = record.timestamps.filter(t => t > windowStart);
  state.ipRequests.set(ip, record);

  if (record.timestamps.length > FIREWALL_CONFIG.HTTP_BRUTE_MAX) {
    blockIP(ip, 'HTTP_BRUTE_FORCE', FIREWALL_CONFIG.HTTP_BRUTE_BLOCK_DURATION);
    return { blocked: true, count: record.timestamps.length };
  }

  return { blocked: false, count: record.timestamps.length };
}

// ============================================================================
// AUTH BRUTE FORCE (replaces iptables SSH brute force -m recent --seconds 600 --hitcount 5)
// ============================================================================

function checkAuthBrute(ip) {
  const now = Date.now();
  const windowStart = now - FIREWALL_CONFIG.AUTH_BRUTE_WINDOW;

  let record = state.ipAuthAttempts.get(ip);
  if (!record) {
    record = { timestamps: [], blocked: 0 };
  }

  if (record.blocked && now < record.blocked) {
    return {
      blocked: true,
      retryAfter: Math.ceil((record.blocked - now) / 1000),
    };
  }

  return { blocked: false, count: record.timestamps.length };
}

function recordAuthAttempt(ip) {
  const now = Date.now();
  const windowStart = now - FIREWALL_CONFIG.AUTH_BRUTE_WINDOW;

  let record = state.ipAuthAttempts.get(ip);
  if (!record) {
    record = { timestamps: [], blocked: 0 };
  }

  record.timestamps.push(now);
  record.timestamps = record.timestamps.filter(t => t > windowStart);

  if (record.timestamps.length > FIREWALL_CONFIG.AUTH_BRUTE_MAX) {
    record.blocked = now + FIREWALL_CONFIG.AUTH_BRUTE_BLOCK_DURATION * 1000;
    blockIP(ip, 'AUTH_BRUTE_FORCE', FIREWALL_CONFIG.AUTH_BRUTE_BLOCK_DURATION);
    logFirewall('AUTH_BLOCK', ip, `Brute force: ${record.timestamps.length} attempts`);
  }

  state.ipAuthAttempts.set(ip, record);
}

// ============================================================================
// PORT SCANNING PROTECTION (replaces iptables scan detection)
// ============================================================================

function checkPortScan(ip, path) {
  const now = Date.now();
  const windowStart = now - FIREWALL_CONFIG.SCAN_DETECTION_WINDOW;

  let record = state.ipScanDetect.get(ip);
  if (!record) {
    record = { paths: new Set(), firstSeen: now, blocked: 0 };
  }

  if (record.blocked && now < record.blocked) {
    return {
      blocked: true,
      retryAfter: Math.ceil((record.blocked - now) / 1000),
    };
  }

  // Only track 404-producing paths for scan detection
  record.paths.add(path);

  if (record.paths.size > FIREWALL_CONFIG.SCAN_DETECTION_THRESHOLD) {
    record.blocked = now + FIREWALL_CONFIG.SCAN_BLOCK_DURATION * 1000;
    state.ipScanDetect.set(ip, record);
    blockIP(ip, 'PORT_SCAN', FIREWALL_CONFIG.SCAN_BLOCK_DURATION);
    logFirewall('SCAN_BLOCK', ip, `Scan detected: ${record.paths.size} unique paths`);
    return { blocked: true, paths: record.paths.size };
  }

  state.ipScanDetect.set(ip, record);
  return { blocked: false, paths: record.paths.size };
}

// ============================================================================
// CONNECTION TRACKING (replaces iptables -m conntrack --ctstate ESTABLISHED)
// ============================================================================

function trackConnection(ip) {
  const current = state.activeConnections.get(ip) || 0;

  if (current >= FIREWALL_CONFIG.GLOBAL_MAX_CONNECTIONS_PER_IP) {
    return { allowed: false, connections: current };
  }

  state.activeConnections.set(ip, current + 1);
  return { allowed: true, connections: current + 1 };
}

function releaseConnection(ip) {
  const current = state.activeConnections.get(ip) || 0;
  state.activeConnections.set(ip, Math.max(0, current - 1));
}

// ============================================================================
// BLOCKED PATH CHECK (replaces iptables port-sensitive rules)
// ============================================================================

function isBlockedPath(path) {
  const lower = path.toLowerCase();
  return FIREWALL_CONFIG.BLOCKED_SENSITIVE_PATHS.some(bp => lower.startsWith(bp));
}

// ============================================================================
// AUTO-CLEANUP (memory management)
// ============================================================================

setInterval(() => {
  const now = Date.now();
  const stale = now - 10 * 60 * 1000;

  for (const [ip, data] of state.ipRequests) {
    if (data.timestamps) {
      data.timestamps = data.timestamps.filter(t => t > stale);
    }
    if (data.timestamps && data.timestamps.length === 0) {
      state.ipRequests.delete(ip);
    }
  }

  for (const [ip, data] of state.ipSynFlood) {
    if (data.timestamps) {
      data.timestamps = data.timestamps.filter(t => t > stale);
    }
    if (data.timestamps && data.timestamps.length === 0) {
      state.ipSynFlood.delete(ip);
    }
  }

  for (const [ip, block] of state.ipBlock) {
    if (!block.permanent && block.until && now > block.until) {
      state.ipBlock.delete(ip);
    }
  }

  for (const [ip, record] of state.ipScanDetect) {
    if (record.blocked && now > record.blocked) {
      state.ipScanDetect.delete(ip);
    }
  }

  for (const [ip, record] of state.ipAuthAttempts) {
    if (record.blocked && now > record.blocked && record.timestamps) {
      record.timestamps = record.timestamps.filter(t => t > stale);
      if (record.timestamps.length === 0) {
        state.ipAuthAttempts.delete(ip);
      }
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// MAIN FIREWALL MIDDLEWARE
// ============================================================================

function appFirewall(req, res, next) {
  const ip = getClientIP(req);
  const path = req.originalUrl || req.url;

  // --- Allow localhost (replaces iptables -i lo -j ACCEPT) ---
  const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  const isLocalhost = localhostIPs.some(allowed => ip === allowed || ip.endsWith(':' + allowed));
  if (isLocalhost) {
    return next();
  }

  // --- Check if IP is blocked (replaces iptables -j DROP) ---
  if (isBlocked(ip)) {
    const block = state.ipBlock.get(ip);
    logFirewall('DROPPED', ip, block?.reason || 'blocked', { path });
    return res.status(403).json({ error: 'Access denied' });
  }

  // --- Skip static files (performance) ---
  const staticExt = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp3|mp4|webm|webp|map|txt|xml|json)$/i;
  if (staticExt.test(path)) {
    return next();
  }

  // --- Anti-spoofing (replaces iptables anti-spoofing rules) ---
  const spoofCheck = checkSpoofing(req, ip);
  if (spoofCheck.spoofed) {
    logFirewall('SPOOF', ip, `Spoofed header: ${spoofCheck.header}=${spoofCheck.value}`);
    return res.status(400).json({ error: 'Invalid request' });
  }

  // --- Invalid request detection (replaces iptables INVALID/Christmas tree) ---
  const invalidCheck = checkInvalidRequest(req);
  if (invalidCheck.invalid) {
    logFirewall('INVALID', ip, invalidCheck.reason, { path, method: req.method });
    return res.status(400).json({ error: 'Invalid request' });
  }

  // --- Blocked paths (replaces sensitive port blocking) ---
  if (isBlockedPath(path)) {
    logFirewall('BLOCKED_PATH', ip, path);
    return res.status(404).end();
  }

  // --- SYN flood protection (replaces iptables -p tcp --syn -m limit) ---
  const synCheck = checkSYNFlood(ip);
  if (synCheck.blocked) {
    return res.status(429).json({ error: 'Too many connections', retryAfter: FIREWALL_CONFIG.SYN_FLOOD_BLOCK_DURATION });
  }

  // --- HTTP brute force (replaces iptables -m recent --update --seconds 60 --hitcount 100) ---
  const bruteCheck = checkHTTPBrute(ip);
  if (bruteCheck.blocked) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: FIREWALL_CONFIG.HTTP_BRUTE_BLOCK_DURATION });
  }

  // --- Auth brute force check for auth endpoints ---
  if (path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register')) {
    const authCheck = checkAuthBrute(ip);
    if (authCheck.blocked) {
      res.set('Retry-After', authCheck.retryAfter);
      return res.status(429).json({
        error: 'Too many authentication attempts',
        retryAfter: authCheck.retryAfter,
      });
    }
  }

  // --- Connection tracking (replaces iptables -m conntrack) ---
  const connCheck = trackConnection(ip);
  if (!connCheck.allowed) {
    logFirewall('CONN_LIMIT', ip, `${connCheck.connections} connections`);
    return res.status(429).json({ error: 'Connection limit exceeded' });
  }

  // Release connection when response finishes
  res.on('finish', () => {
    releaseConnection(ip);
  });

  // --- Track request for rate limiting ---
  const now = Date.now();
  let record = state.ipRequests.get(ip);
  if (!record) {
    record = { timestamps: [], connections: 0, score: 0 };
  }
  record.timestamps.push(now);
  state.ipRequests.set(ip, record);

  // --- Add firewall headers ---
  res.set('X-Firewall', 'active');
  res.set('X-Request-Count', String(record.timestamps.length));

  next();
}

// ============================================================================
// 404 SCAN DETECTION MIDDLEWARE (use after routes)
// ============================================================================

function scanDetectionMiddleware(req, res, next) {
  const ip = getClientIP(req);

  // Only check 404 responses
  res.on('finish', () => {
    if (res.statusCode === 404) {
      const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
      const isLocalhost = localhostIPs.some(allowed => ip === allowed || ip.endsWith(':' + allowed));
      if (!isLocalhost) {
        const scanCheck = checkPortScan(ip, req.originalUrl || req.url);
        if (scanCheck.blocked) {
          logFirewall('SCAN_DETECTED', ip, `${scanCheck.paths} unique paths hit`);
        }
      }
    }
  });

  next();
}

// ============================================================================
// AUTH ATTEMPT TRACKING MIDDLEWARE
// ============================================================================

function authAttemptMiddleware(req, res, next) {
  const ip = getClientIP(req);

  // Only track auth endpoints
  if (req.path.startsWith('/api/auth/login')) {
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        recordAuthAttempt(ip);
      }
    });
  }

  next();
}

// ============================================================================
// FIREWALL STATS (for admin dashboard)
// ============================================================================

function getFirewallStats() {
  try {
    const totalBlocks = db.prepare('SELECT COUNT(*) as count FROM firewall_logs WHERE action IN ("BLOCK", "DROPPED")').get().count;
    const todayBlocks = db.prepare('SELECT COUNT(*) as count FROM firewall_logs WHERE date(created_at) = date("now") AND action IN ("BLOCK", "DROPPED")').get().count;
    const topActions = db.prepare(`
      SELECT action, COUNT(*) as count 
      FROM firewall_logs 
      WHERE created_at > datetime("now", "-24 hours")
      GROUP BY action 
      ORDER BY count DESC 
      LIMIT 10
    `).all();
    const topIPs = db.prepare(`
      SELECT ip_address, COUNT(*) as count 
      FROM firewall_logs 
      WHERE created_at > datetime("now", "-24 hours") AND action IN ("BLOCK", "DROPPED")
      GROUP BY ip_address 
      ORDER BY count DESC 
      LIMIT 10
    `).all();

    return {
      totalBlocks,
      todayBlocks,
      activeBlockedIPs: state.ipBlock.size,
      activeConnections: state.activeConnections.size,
      trackedIPs: state.ipRequests.size,
      topActions,
      topIPs,
    };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

initFirewallDatabase();

console.log('[FIREWALL] Application-level firewall active (no sudo required)');

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  appFirewall,
  scanDetectionMiddleware,
  authAttemptMiddleware,
  blockIP,
  unblockIP,
  getBlockedIPs,
  getFirewallStats,
  recordAuthAttempt,
  FIREWALL_CONFIG,
};

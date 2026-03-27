/**
 * ELECTRON VISION - Web Application Firewall (WAF)
 * Advanced Threat Detection and Blocking System
 */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const db = require('../database');
const { getClientIP, logSecurityEvent } = require('./security');

const WAF_CONFIG = {
  THREAT_SCORE_THRESHOLD: parseInt(process.env.WAF_THRESHOLD) || 10,
  MAX_THREAT_SCORE: 100,
  BLOCK_DURATION: parseInt(process.env.BLOCK_DURATION) || 3600,
  AUTO_BLOCK_THRESHOLD: parseInt(process.env.AUTO_BLOCK_THRESHOLD) || 50,
  SUSPICIOUS_WINDOW: 60 * 60 * 1000,
  MAX_REQUESTS_PER_MINUTE: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 120,
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT) || 50
};

const THREAT_PATTERNS = {
  SQL_INJECTION: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/|@@|@)/,
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*\d+.*=.*\d+)/i,
    /('|"|%27|%22|\\|;|--)/,
    /(0x[0-9a-fA-F]+)/,
    /(BENCHMARK|SLEEP|WAITFOR|DELAY)/i,
    /(INTO\s+(OUTFILE|DUMPFILE))/i,
    /(LOAD_FILE|INTO\s+OUTFILE)/i,
    /(CONCAT|CHAR\(|CONV\()/i,
    /(HAVING\s+\d+=\d+)/i,
    /(IF\(.*SELECT\b)/i
  ],
  XSS: [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<applet[^>]*>.*?<\/applet>/gi,
    /javascript:/gi,
    /on(click|load|error|mouse\w+|key\w+)\s*=/gi,
    /<img[^>]+on\w+\s*=/gi,
    /<svg[^>]*on\w+\s*=/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /<meta[^>]*http-equiv="refresh"/gi,
    /<link[^>]*rel="import"/gi,
    /<link[^>]*href="javascript:/gi
  ],
  COMMAND_INJECTION: [
    /(\||&|;|`|\$\(|\\x|\\)/,
    /(cat\s+|ls\s+|pwd|whoami|ifconfig|ipconfig|netstat)/i,
    /(curl|wget|nc|netcat|ssh|scp)/i,
    /(rm\s+-rf|mkdir\s+|touch\s+)/i,
    /(chmod\s+|chown\s+)/i,
    /(passwd|shadow|etc\/passwd|etc\/shadow)/i,
    /(base64\s+-d|openssl\s+)/i,
    /\$env\{/i,
    /\$_GET|\$_POST|\$_REQUEST/i
  ],
  PATH_TRAVERSAL: [
    /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|%252e%252e%252f)/i,
    /(\/etc\/passwd|\/etc\/shadow|\/windows\/system32)/i,
    /(%00|%0a|%0d)/,
    /(root\/|home\/|usr\/)/i,
    /(\.\.\;\/|\.\.\|\/)/
  ],
  LDAP_INJECTION: [
    /(\*\)|\(\||\(&|\)\(|\)\()/i,
    /(\*\x00|\(\x00)/,
    /\*\)/
  ],
  XML_INJECTION: [
    /<!DOCTYPE[^>]*>/i,
    /<!ENTITY[^>]*>/i,
    /<!CDATA\[/i,
    /<\?xml[^>]*\?>/i,
    /<system[^>]*>/i
  ],
  BOTS: [
    /^(Mozilla\/5\.0 \(compatible; (Googlebot|Bingbot|Slurp|DuckDuckBot|YandexBot|Baiduspider|Sogou))/i,
    /(Nikto|Wapiti|sqlmap|havij|Nmap|Masscan|Metasploit|Acunetix|Burp|OWASP)/i,
    /(Python-urllib|Python-requests|Go-http-client|HttpClient)/i,
    /(curl|wget|scrapy|spider)/i,
    /(bot|crawler|spider|scanner|hammer|ddos|attack)/i
  ],
  SENSITIVE_DATA: [
    /(password|passwd|pwd)\s*[=:]\s*\S+/i,
    /(secret|token|api[_-]?key|api[_-]?secret)\s*[=:]\s*\S+/i,
    /(bearer\s+[a-zA-Z0-9\-\._~+\/]+=*)/i,
    /(Authorization:\s*\S+)/i,
    /(x-api-key|x-auth-token)\s*[=:]\s*\S+/i
  ],
  DANGEROUS_EXTENSIONS: [
    /\.exe$/i,
    /\.php$/i,
    /\.asp$/i,
    /\.jsp$/i,
    /\.phtml$/i,
    /\.cgi$/i,
    /\.sh$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.ps1$/i,
    /\.vbs$/i,
    /\.sql$/i,
    /\.db$/i,
    /\.sqlite$/i
  ]
};

const BLOCKED_IPS = new Map();
const THREAT_SCORES = new Map();
const REQUEST_COUNTS = new Map();
const CONCURRENT_REQUESTS = new Map();

function initWAFDatabase() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS waf_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        threat_type TEXT NOT NULL,
        payload TEXT,
        url TEXT,
        user_agent TEXT,
        score INTEGER,
        blocked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`DROP TABLE IF EXISTS blocked_ips`).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS blocked_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT UNIQUE NOT NULL,
        reason TEXT,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        permanent INTEGER DEFAULT 0
      )
    `).run();

    const now = new Date().toISOString();
    const blockedIps = db.prepare('SELECT ip_address, reason, expires_at, permanent FROM blocked_ips WHERE (permanent = 1 OR expires_at > ?)').all(now);
    blockedIps.forEach(ip => {
      BLOCKED_IPS.set(ip.ip_address, {
        reason: ip.reason,
        permanent: ip.permanent === 1,
        expiresAt: ip.expires_at
      });
    });

    console.log('✅ WAF database initialized');
  } catch (error) {
    console.error('❌ WAF database init error:', error.message);
  }
}

function isIPBlocked(ip) {
  const block = BLOCKED_IPS.get(ip);
  if (!block) return false;
  if (block.permanent) return true;
  if (block.expiresAt && new Date(block.expiresAt) < new Date()) {
    BLOCKED_IPS.delete(ip);
    try {
      db.prepare('DELETE FROM blocked_ips WHERE ip_address = ?').run(ip);
    } catch (e) {}
    return false;
  }
  return true;
}

function blockIP(ip, reason, permanent = false, duration = WAF_CONFIG.BLOCK_DURATION) {
  const expiresAt = permanent ? null : new Date(Date.now() + duration * 1000).toISOString();
  
  BLOCKED_IPS.set(ip, {
    reason,
    permanent,
    expiresAt
  });

  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO blocked_ips (ip_address, reason, blocked_at, expires_at, permanent)
      VALUES (?, ?, ?, ?, ?)
    `).run(ip, reason, now, expiresAt, permanent ? 1 : 0);
  } catch (error) {
    console.error('Failed to block IP:', error.message);
  }

  logSecurityEvent('ip_blocked', { ip, reason, permanent });
}

function unblockIP(ip) {
  BLOCKED_IPS.delete(ip);
  try {
    db.prepare('DELETE FROM blocked_ips WHERE ip_address = ?').run(ip);
  } catch (error) {
    console.error('Failed to unblock IP:', error.message);
  }
  logSecurityEvent('ip_unblocked', { ip });
}

function getThreatScore(patternType) {
  const scores = {
    SQL_INJECTION: 30,
    XSS: 25,
    COMMAND_INJECTION: 40,
    PATH_TRAVERSAL: 20,
    LDAP_INJECTION: 25,
    XML_INJECTION: 15,
    BOTS: 15,
    SENSITIVE_DATA: 10,
    DANGEROUS_EXTENSIONS: 5
  };
  return scores[patternType] || 10;
}

function scanPayload(payload, url = '', userAgent = '') {
  if (!payload || typeof payload !== 'string') return null;
  
  const threats = [];
  let totalScore = 0;

  for (const [type, patterns] of Object.entries(THREAT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(payload)) {
        const score = getThreatScore(type);
        threats.push({ type, score, pattern: pattern.toString() });
        totalScore += score;
        break;
      }
    }
  }

  if (url) {
    for (const type of ['PATH_TRAVERSAL', 'DANGEROUS_EXTENSIONS']) {
      const patterns = THREAT_PATTERNS[type];
      for (const pattern of patterns) {
        if (pattern.test(url)) {
          const score = getThreatScore(type);
          threats.push({ type, score, pattern: pattern.toString() });
          totalScore += score;
          break;
        }
      }
    }
  }

  if (userAgent) {
    for (const type of ['BOTS']) {
      const patterns = THREAT_PATTERNS[type];
      for (const pattern of patterns) {
        if (pattern.test(userAgent)) {
          const score = getThreatScore(type);
          threats.push({ type, score, pattern: pattern.toString() });
          totalScore += score;
          break;
        }
      }
    }
  }

  return threats.length > 0 ? { threats, score: Math.min(totalScore, WAF_CONFIG.MAX_THREAT_SCORE) } : null;
}

const LOCALHOST_WHITELIST = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];

function isLocalhostWhitelisted(ip) {
  return LOCALHOST_WHITELIST.some(allowed => ip === allowed || ip.endsWith(':' + allowed));
}

function getClientRequestCount(ip) {
  const key = ip;
  const now = Date.now();
  let count = REQUEST_COUNTS.get(key);
  
  if (!count || now - count.window > 60000) {
    count = { window: now, requests: 0 };
  }
  
  count.requests++;
  REQUEST_COUNTS.set(key, count);
  
  return count.requests;
}

function logWAFEvent(ip, threatType, payload, url, userAgent, score, blocked) {
  try {
    db.prepare(`
      INSERT INTO waf_logs (ip_address, threat_type, payload, url, user_agent, score, blocked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ip, threatType, payload?.substring(0, 500), url, userAgent, score, blocked ? 1 : 0);
  } catch (error) {
    console.error('WAF log error:', error.message);
  }
}

function wafMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const url = req.originalUrl || req.url;
  
  if (isLocalhostWhitelisted(ip)) {
    return next();
  }
  
  if (isIPBlocked(ip)) {
    logSecurityEvent('blocked_ip_request', { ip, url, userAgent });
    return res.status(403).sendFile(path.join(__dirname, '..', 'public', 'blocked.html'));
  }

  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.map'];
  const isStaticFile = staticExtensions.some(ext => url.endsWith(ext));
  if (isStaticFile) {
    return next();
  }
  
  const requestCount = getClientRequestCount(ip);
  if (requestCount > WAF_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    blockIP(ip, 'Rate limit exceeded - DDoS suspicion', false, WAF_CONFIG.BLOCK_DURATION);
    logSecurityEvent('rate_limit_block', { ip, requestCount });
    return res.status(403).sendFile(path.join(__dirname, '..', 'public', 'blocked.html'));
  }

  const scanData = [
    ...(req.body ? Object.values(req.body) : []),
    ...(req.query ? Object.values(req.query) : []),
    req.params ? Object.values(req.params) : [],
    url,
    userAgent
  ].join(' ');

  const result = scanPayload(scanData, url, userAgent);
  
  if (result) {
    const { threats, score } = result;
    const primaryThreat = threats[0].type;
    
    logWAFEvent(ip, primaryThreat, scanData.substring(0, 500), url, userAgent, score, false);
    
    logSecurityEvent('threat_detected', {
      ip,
      type: primaryThreat,
      score,
      url,
      threats: threats.map(t => t.type).join(', ')
    });

    const existingScore = THREAT_SCORES.get(ip) || 0;
    const newScore = existingScore + score;
    THREAT_SCORES.set(ip, newScore);

    if (newScore >= WAF_CONFIG.AUTO_BLOCK_THRESHOLD) {
      blockIP(ip, `Auto-block: threat score ${newScore} exceeded threshold`, false, WAF_CONFIG.BLOCK_DURATION);
      logSecurityEvent('auto_block', { ip, score: newScore, threshold: WAF_CONFIG.AUTO_BLOCK_THRESHOLD });
      return res.status(403).sendFile(path.join(__dirname, '..', 'public', 'blocked.html'));
    }

    if (score >= WAF_CONFIG.THREAT_SCORE_THRESHOLD) {
      return res.status(400).json({
        error: 'Request blocked by security system',
        code: 'WAF_BLOCK',
        reason: primaryThreat
      });
    }
  }

  req.wafScore = THREAT_SCORES.get(ip) || 0;
  next();
}

function wafStats() {
  try {
    const totalThreats = db.prepare('SELECT COUNT(*) as count FROM waf_logs').get().count;
    const blockedToday = db.prepare('SELECT COUNT(*) as count FROM blocked_ips WHERE date(blocked_at) = date("now")').get().count;
    const topThreats = db.prepare(`
      SELECT threat_type, COUNT(*) as count 
      FROM waf_logs 
      WHERE created_at > datetime("now", "-24 hours")
      GROUP BY threat_type 
      ORDER BY count DESC 
      LIMIT 10
    `).all();
    const topIPs = db.prepare(`
      SELECT ip_address, COUNT(*) as count 
      FROM waf_logs 
      WHERE created_at > datetime("now", "-24 hours") AND blocked = 1
      GROUP BY ip_address 
      ORDER BY count DESC 
      LIMIT 10
    `).all();
    
    return { totalThreats, blockedToday, topThreats, topIPs };
  } catch (error) {
    return { error: error.message };
  }
}

function getBlockedIPs() {
  return Array.from(BLOCKED_IPS.keys());
}

function manualBlockIP(ip, reason = 'Manual block') {
  blockIP(ip, reason, true);
}

function manualUnblockIP(ip) {
  unblockIP(ip);
}

initWAFDatabase();

module.exports = {
  WAF_CONFIG,
  wafMiddleware,
  isIPBlocked,
  blockIP,
  unblockIP,
  scanPayload,
  getThreatScore,
  wafStats,
  getBlockedIPs,
  manualBlockIP,
  manualUnblockIP,
  THREAT_PATTERNS
};

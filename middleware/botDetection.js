/**
 * ELECTRON VISION - Bot Detection & DDoS Mitigation
 * Advanced Bot Detection and Rate Limiting System
 */

require('dotenv').config();

const { getClientIP } = require('./security');
const db = require('../database');

const BOT_CONFIG = {
  WINDOW_SIZE: 60 * 1000,
  MAX_REQUESTS_PER_WINDOW: parseInt(process.env.BOT_MAX_REQUESTS) || 100,
  MAX_CONCURRENT_CONNECTIONS: parseInt(process.env.BOT_MAX_CONCURRENT) || 30,
  SUSPICIOUS_USER_AGENTS: [
    /bot|crawler|spider|scanner|hammer|ddos|attack|scan/i,
    /nikto|wapiti|sqlmap|havij|metasploit/i,
    /nmap|masscan|acunetix|burp|owasp/i,
    /python|curl|wget|scrapy/i,
    /python-urllib|python-requests/i,
    /go-http-client|okhttp/i
  ],
  BLOCK_DURATION: parseInt(process.env.BOT_BLOCK_DURATION) || 3600,
  CAPTCHA_TRIGGER_THRESHOLD: 30
};

class BotDetector {
  constructor() {
    this.ipRequests = new Map();
    this.ipConnections = new Map();
    this.ipHistory = new Map();
    this.userAgentCache = new Map();
  }

  analyzeUserAgent(userAgent) {
    if (!userAgent) return { isBot: true, score: 50, reason: 'no_user_agent' };

    let score = 0;
    const reasons = [];

    if (BOT_CONFIG.SUSPICIOUS_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
      score += 30;
      reasons.push('suspicious_user_agent');
    }

    if (/^(Mozilla\/5\.0 \(compatible;)/.test(userAgent) && !/Chrome|Firefox|Safari|Edge/.test(userAgent)) {
      score += 15;
      reasons.push('missing_browser');
    }

    if (userAgent.length < 20) {
      score += 20;
      reasons.push('short_user_agent');
    }

    if (/Python|curl|wget|Scrapy/.test(userAgent) && !/Mozilla/.test(userAgent)) {
      score += 25;
      reasons.push('known_bot_library');
    }

    if (/Mozilla\/4\.0/.test(userAgent)) {
      score += 10;
      reasons.push('old_mozilla');
    }

    const isBot = score >= 30;
    return { isBot, score, reason: reasons.join(', ') || 'normal' };
  }

  trackRequest(ip) {
    const now = Date.now();
    const windowStart = now - BOT_CONFIG.WINDOW_SIZE;

    if (!this.ipRequests.has(ip)) {
      this.ipRequests.set(ip, { requests: [], connections: 0 });
    }

    const ipData = this.ipRequests.get(ip);
    ipData.requests.push(now);
    ipData.requests = ipData.requests.filter(t => t > windowStart);

    if (ipData.requests.length > BOT_CONFIG.MAX_REQUESTS_PER_WINDOW) {
      return { 
        flagged: true, 
        reason: 'rate_limit_exceeded',
        requestCount: ipData.requests.length,
        limit: BOT_CONFIG.MAX_REQUESTS_PER_WINDOW
      };
    }

    return { flagged: false, requestCount: ipData.requests.length };
  }

  trackConnection(ip, connected = true) {
    if (!this.ipConnections.has(ip)) {
      this.ipConnections.set(ip, 0);
    }

    const count = this.ipConnections.get(ip);
    
    if (connected) {
      this.ipConnections.set(ip, count + 1);
    } else {
      this.ipConnections.set(ip, Math.max(0, count - 1));
    }

    const currentConnections = this.ipConnections.get(ip);
    
    if (currentConnections > BOT_CONFIG.MAX_CONCURRENT_CONNECTIONS) {
      return {
        flagged: true,
        reason: 'too_many_connections',
        connections: currentConnections,
        limit: BOT_CONFIG.MAX_CONCURRENT_CONNECTIONS
      };
    }

    return { flagged: false, connections: currentConnections };
  }

  analyzeRequestPattern(req) {
    const ip = getClientIP(req);
    const now = Date.now();
    const windowStart = now - (BOT_CONFIG.WINDOW_SIZE * 5);

    if (!this.ipHistory.has(ip)) {
      this.ipHistory.set(ip, { requests: [], firstSeen: now });
    }

    const history = this.ipHistory.get(ip);
    history.requests.push({ time: now, path: req.path, method: req.method });
    history.requests = history.requests.filter(r => r.time > windowStart);

    const patterns = {
      sequential: false,
      random: false,
      aggressive: false
    };

    if (history.requests.length > 20) {
      const paths = history.requests.map(r => r.path);
      const uniquePaths = new Set(paths).size;
      
      if (uniquePaths === 1 && history.requests.length > 30) {
        patterns.sequential = true;
      }

      if (uniquePaths > paths.length * 0.8 && history.requests.length > 50) {
        patterns.random = true;
      }

      const recentRequests = history.requests.filter(r => r.time > now - BOT_CONFIG.WINDOW_SIZE);
      if (recentRequests.length > BOT_CONFIG.MAX_REQUESTS_PER_WINDOW * 1.5) {
        patterns.aggressive = true;
      }
    }

    return patterns;
  }

  getStats() {
    const stats = {
      activeIPs: this.ipRequests.size,
      totalRequestsLastMinute: 0,
      flaggedIPs: 0
    };

    for (const [ip, data] of this.ipRequests) {
      stats.totalRequestsLastMinute += data.requests.length;
      if (data.requests.length > BOT_CONFIG.MAX_REQUESTS_PER_WINDOW * 0.8) {
        stats.flaggedIPs++;
      }
    }

    return stats;
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - (BOT_CONFIG.WINDOW_SIZE * 10);

    for (const [ip, data] of this.ipRequests) {
      if (data.requests.length === 0 || data.requests[0] < windowStart) {
        this.ipRequests.delete(ip);
      }
    }

    for (const [ip, history] of this.ipHistory) {
      history.requests = history.requests.filter(r => r.time > windowStart);
      if (history.requests.length === 0) {
        this.ipHistory.delete(ip);
      }
    }
  }
}

const botDetector = new BotDetector();

setInterval(() => botDetector.cleanup(), 60000);

function initBotDatabase() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS bot_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        reason TEXT,
        blocked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    console.log('✅ Bot detection database initialized');
  } catch (error) {
    console.error('❌ Bot database init error:', error.message);
  }
}

function logBotAttempt(ip, userAgent, reason, blocked = false) {
  try {
    db.prepare(`
      INSERT INTO bot_logs (ip_address, user_agent, reason, blocked)
      VALUES (?, ?, ?, ?)
    `).run(ip, userAgent?.substring(0, 500), reason, blocked ? 1 : 0);
  } catch (error) {
    console.error('Bot log error:', error.message);
  }
}

function botDetectionMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  
  const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  if (localhostIPs.some(allowed => ip === allowed || ip.endsWith(':' + allowed))) {
    return next();
  }

  const { isBot, score, reason } = botDetector.analyzeUserAgent(userAgent);
  req.botScore = score;

  if (isBot) {
    logBotAttempt(ip, userAgent, reason, false);
  }

  const rateCheck = botDetector.trackRequest(ip);
  if (rateCheck.flagged) {
    logBotAttempt(ip, userAgent, rateCheck.reason, true);
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60
    });
  }

  const patterns = botDetector.analyzeRequestPattern(req);
  if (patterns.sequential || patterns.random || patterns.aggressive) {
    logBotAttempt(ip, userAgent, `pattern_${Object.keys(patterns).find(k => patterns[k])}`, false);
  }

  res.setHeader('X-Bot-Score', score);
  res.setHeader('X-Request-Count', rateCheck.requestCount);

  next();
}

function ddosProtectionMiddleware(req, res, next) {
  const ip = getClientIP(req);
  
  const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  if (localhostIPs.some(allowed => ip === allowed || ip.endsWith(':' + allowed))) {
    return next();
  }
  
  const connectionCheck = botDetector.trackConnection(ip, true);

  res.on('finish', () => {
    botDetector.trackConnection(ip, false);
  });

  if (connectionCheck.flagged) {
    return res.status(429).json({
      error: 'Connection limit exceeded',
      code: 'CONNECTION_LIMIT',
      connections: connectionCheck.connections,
      limit: connectionCheck.limit
    });
  }

  const stats = botDetector.getStats();
  res.setHeader('X-Active-Connections', stats.activeIPs);

  next();
}

initBotDatabase();

module.exports = {
  botDetector,
  botDetectionMiddleware,
  ddosProtectionMiddleware,
  BOT_CONFIG,
  initBotDatabase,
  logBotAttempt
};

/**
 * ELECTRON VISION - Cybersecurity Controller (Advanced)
 * Full firewall monitoring, threat analysis, reports, export
 */

const db = require('../database');
const backend = require('./cybersecurity-backend');

function safeQuery(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

// ============================================================================
// FULL DASHBOARD DATA (one call to get everything)
// ============================================================================

function getDashboard(req, res) {
  try {
    // WAF stats
    const totalThreats = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM waf_logs').get().c, 0);
    const threats24h = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM waf_logs WHERE created_at > datetime("now", "-24 hours")').get().c, 0);
    const blocked24h = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM waf_logs WHERE blocked = 1 AND created_at > datetime("now", "-24 hours")').get().c, 0);

    // Blocked IPs
    const blockedIPs = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM blocked_ips WHERE expires_at > datetime("now") OR expires_at IS NULL').get().c, 0);

    // Login stats
    const failedLogins24h = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM login_history WHERE success = 0 AND created_at > datetime("now", "-24 hours")').get().c, 0);
    const successfulLogins24h = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM login_history WHERE success = 1 AND created_at > datetime("now", "-24 hours")').get().c, 0);

    // Users
    const activeUsers = safeQuery(() => db.prepare('SELECT COUNT(*) as c FROM users').get().c, 0);

    // Server data
    const iptablesRules = backend.getIPTablesRules();
    const ufwRules = backend.getUFWRules();
    const connSummary = backend.getConnectionSummary();
    const pktStats = backend.getPacketStats();
    const suspicious = backend.detectSuspiciousNetworks();
    const threatAnalysis = backend.getThreatAnalysis();
    const perf = backend.getFirewallPerformance();

    // Threat types from WAF (7 days)
    const threatTypes = safeQuery(() => db.prepare(`
      SELECT threat_type, COUNT(*) as count, SUM(blocked) as blocked
      FROM waf_logs WHERE created_at > datetime('now', '-7 days')
      GROUP BY threat_type ORDER BY count DESC
    `).all(), []);

    // Top attackers (24h)
    const topAttackers = safeQuery(() => db.prepare(`
      SELECT ip_address, COUNT(*) as attacks, SUM(blocked) as blocked, MAX(created_at) as last_seen
      FROM waf_logs WHERE created_at > datetime('now', '-24 hours')
      GROUP BY ip_address ORDER BY attacks DESC LIMIT 15
    `).all(), []);

    // Hourly attacks (24h)
    const hourlyAttacks = safeQuery(() => db.prepare(`
      SELECT strftime('%H', created_at) as hour, COUNT(*) as count
      FROM waf_logs WHERE created_at > datetime('now', '-24 hours')
      GROUP BY hour ORDER BY hour
    `).all(), []);

    // Security events (24h)
    const securityEvents = safeQuery(() => db.prepare(`
      SELECT action, COUNT(*) as count, MAX(created_at) as last_seen
      FROM activity_logs WHERE action LIKE 'security_%' AND created_at > datetime('now', '-24 hours')
      GROUP BY action ORDER BY count DESC
    `).all(), []);

    // System info (using Node.js APIs - no sudo needed)
    let systemLoad = '', memoryInfo = {}, diskInfo = {};
    try {
      // Process uptime
      const uptimeSeconds = process.uptime();
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      systemLoad = `up ${hours}h ${minutes}m`;

      // Memory from Node.js process
      const mem = process.memoryUsage();
      memoryInfo = {
        total: mem.rss,
        used: mem.heapUsed,
        free: mem.rss - mem.heapUsed,
        heap: mem.heapTotal,
        external: mem.external
      };

      // Try system commands if available (no sudo)
      try {
        const { execSync } = require('child_process');
        const uptimeOut = execSync('uptime 2>/dev/null', { timeout: 3000 }).toString().trim();
        if (uptimeOut) systemLoad = uptimeOut;
      } catch (e) {}

      try {
        const { execSync } = require('child_process');
        const memOut = execSync('free -b 2>/dev/null', { timeout: 3000 }).toString();
        const memLines = memOut.split('\n');
        if (memLines[1]) {
          const p = memLines[1].split(/\s+/);
          memoryInfo = { total: parseInt(p[1])||0, used: parseInt(p[2])||0, free: parseInt(p[3])||0 };
        }
      } catch (e) {}

      try {
        const { execSync } = require('child_process');
        const disk = execSync("df -B1 / 2>/dev/null | tail -1", { timeout: 3000 }).toString();
        const dp = disk.split(/\s+/);
        diskInfo = { total: parseInt(dp[1])||0, used: parseInt(dp[2])||0, available: parseInt(dp[3])||0, percent: dp[4]||'0%' };
      } catch (e) {}
    } catch (e) {}

    res.json({
      stats: { totalThreats, threats24h, blocked24h, blockedIPs, failedLogins24h, successfulLogins24h, activeUsers },
      iptablesRules, ufwRules, connSummary, pktStats, suspicious, threatAnalysis, perf,
      threatTypes, topAttackers, hourlyAttacks, securityEvents,
      systemLoad, memoryInfo, diskInfo
    });
  } catch (error) {
    console.error('Cybersecurity dashboard error:', error);
    res.status(500).json({ error: 'خطأ في تحميل بيانات الأمان' });
  }
}

// ============================================================================
// IPTABLES RULES (detailed)
// ============================================================================

function getRules(req, res) {
  try {
    const rules = backend.getIPTablesRules();
    const ufw = backend.getUFWRules();
    res.json({ iptables: rules, ufw });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', iptables: [], ufw: { active: false, rules: [] } });
  }
}

// ============================================================================
// ACTIVE CONNECTIONS
// ============================================================================

function getConnections(req, res) {
  try {
    const connections = backend.getActiveConnections();
    const summary = backend.getConnectionSummary();
    res.json({ connections, summary });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', connections: [], summary: {} });
  }
}

// ============================================================================
// PACKET STATS
// ============================================================================

function getPackets(req, res) {
  try {
    const stats = backend.getPacketStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

// ============================================================================
// THREAT ANALYSIS
// ============================================================================

function getThreats(req, res) {
  try {
    const analysis = backend.getThreatAnalysis();
    const suspicious = backend.detectSuspiciousNetworks();
    res.json({ analysis, suspicious });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

// ============================================================================
// FIREWALL PERFORMANCE
// ============================================================================

function getPerformance(req, res) {
  try {
    const perf = backend.getFirewallPerformance();
    res.json(perf);
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

// ============================================================================
// WAF LOGS
// ============================================================================

function getWAFLogs(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const ip = req.query.ip || '';
    const type = req.query.type || '';

    let where = 'WHERE 1=1';
    const params = [];
    if (ip) { where += ' AND ip_address = ?'; params.push(ip); }
    if (type) { where += ' AND threat_type = ?'; params.push(type); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM waf_logs ${where}`).get(...params).c;
    const logs = db.prepare(`SELECT * FROM waf_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const types = safeQuery(() => db.prepare('SELECT DISTINCT threat_type FROM waf_logs ORDER BY threat_type').all().map(t => t.threat_type), []);

    res.json({ logs, total, page, pages: Math.ceil(total / limit), types });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', logs: [] });
  }
}

// ============================================================================
// BLOCKED IPs MANAGEMENT
// ============================================================================

function getBlockedIPsList(req, res) {
  try {
    const ips = db.prepare(`
      SELECT * FROM blocked_ips
      WHERE expires_at > datetime('now') OR expires_at IS NULL OR permanent = 1
      ORDER BY blocked_at DESC
    `).all();
    res.json({ ips });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', ips: [] });
  }
}

function blockIPAction(req, res) {
  try {
    const { ip, reason, permanent } = req.body;
    if (!ip) return res.status(400).json({ error: 'عنوان IP مطلوب' });

    const expires = permanent ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT OR REPLACE INTO blocked_ips (ip_address, reason, expires_at, permanent) VALUES (?, ?, ?, ?)`).run(ip, reason || 'Manual block', expires, permanent ? 1 : 0);

    try {
      const { blockIP } = require('../middleware/waf');
      blockIP(ip, reason || 'Manual block', true);
    } catch (e) {}

    db.prepare(`INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`).run(req.user.id, 'security_MANUAL_BLOCK', `Blocked: ${ip} - ${reason}`, ip);
    res.json({ message: 'تم حظر العنوان' });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

function unblockIPAction(req, res) {
  try {
    const ip = decodeURIComponent(req.params.ip);
    db.prepare('DELETE FROM blocked_ips WHERE ip_address = ?').run(ip);
    try { require('../middleware/waf').unblockIP(ip); } catch (e) {}
    db.prepare(`INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`).run(req.user.id, 'security_MANUAL_UNBLOCK', `Unblocked: ${ip}`, ip);
    res.json({ message: 'تم إلغاء الحظر' });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

function unblockAllAction(req, res) {
  try {
    db.prepare('DELETE FROM blocked_ips WHERE permanent = 0').run();
    res.json({ message: 'تم إلغاء الحظر المؤقت' });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

// ============================================================================
// LOGIN HISTORY
// ============================================================================

function getLoginHistory(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const success = req.query.success;

    let where = '';
    const params = [];
    if (success !== undefined && success !== '') { where = 'WHERE success = ?'; params.push(parseInt(success)); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM login_history ${where}`).get(...params).c;
    const logs = db.prepare(`SELECT * FROM login_history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', logs: [] });
  }
}

// ============================================================================
// SECURITY EVENTS
// ============================================================================

function getSecurityEvents(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const action = req.query.action || '';

    let where = "WHERE action LIKE 'security_%'";
    const params = [];
    if (action) { where += ' AND action = ?'; params.push(action); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM activity_logs ${where}`).get(...params).c;
    const events = db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const types = safeQuery(() => db.prepare("SELECT DISTINCT action FROM activity_logs WHERE action LIKE 'security_%' ORDER BY action").all().map(t => t.action), []);

    res.json({ events, total, page, pages: Math.ceil(total / limit), types });
  } catch (error) {
    res.status(500).json({ error: 'خطأ', events: [] });
  }
}

// ============================================================================
// EXPORT CSV
// ============================================================================

function exportData(req, res) {
  try {
    const type = req.query.type || 'waf';
    const csv = backend.exportCSV(type);
    const filenames = { waf: 'waf-logs', blocked: 'blocked-ips', logins: 'login-history', events: 'security-events' };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filenames[type] || 'export'}-${new Date().toISOString().slice(0,10)}.csv`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (error) {
    res.status(500).json({ error: 'خطأ في التصدير' });
  }
}

// ============================================================================
// FLUSH OLD LOGS
// ============================================================================

function flushLogs(req, res) {
  try {
    const deleted = db.prepare('DELETE FROM waf_logs WHERE created_at < datetime("now", "-30 days")').run();
    res.json({ message: 'تم مسح السجلات القديمة', deleted: deleted.changes });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

// ============================================================================
// FIREWALL STATUS (app-level, no system firewall needed)
// ============================================================================

function getFirewallStatus(req, res) {
  try {
    const rules = backend.getIPTablesRules();
    const perf = backend.getFirewallPerformance();
    res.json({
      mode: 'application-level',
      message: 'جدار الحماية يعمل على مستوى التطبيق - لا يحتاج sudo',
      rules,
      performance: perf
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ' });
  }
}

module.exports = {
  getDashboard,
  getRules,
  getConnections,
  getPackets,
  getThreats,
  getPerformance,
  getWAFLogs,
  getBlockedIPsList,
  blockIPAction,
  unblockIPAction,
  unblockAllAction,
  getLoginHistory,
  getSecurityEvents,
  exportData,
  flushLogs,
  getFirewallStatus
};

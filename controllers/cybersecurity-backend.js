/**
 * ELECTRON VISION - Cybersecurity Backend (No Sudo / Free Hosting Compatible)
 * Reads data from app-level firewall, WAF, and database only
 * No iptables, no ufw, no fail2ban - works on any free hosting
 */

const fs = require('fs');
const db = require('../database');

// ============================================================================
// SAFE SHELL COMMANDS (no sudo, no firewall commands)
// ============================================================================

function safeCmd(command, timeout = 5000) {
  try {
    const { execSync } = require('child_process');
    return execSync(command, { timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '';
  }
}

// ============================================================================
// APP-LEVEL FIREWALL RULES (replaces iptables reading)
// ============================================================================

function getAppFirewallRules() {
  try {
    const { FIREWALL_CONFIG, getBlockedIPs } = require('../middleware/app-firewall');
    const { WAF_CONFIG, getBlockedIPs: wafGetBlockedIPs, wafStats } = require('../middleware/waf');

    const rules = [];

    // App Firewall rules
    rules.push({ type: 'firewall', name: 'Global Rate Limit', value: `${FIREWALL_CONFIG.GLOBAL_MAX_REQUESTS_PER_MINUTE} req/min`, status: 'active' });
    rules.push({ type: 'firewall', name: 'Max Connections/IP', value: `${FIREWALL_CONFIG.GLOBAL_MAX_CONNECTIONS_PER_IP} concurrent`, status: 'active' });
    rules.push({ type: 'firewall', name: 'SYN Flood Protection', value: `${FIREWALL_CONFIG.SYN_FLOOD_MAX} req/${FIREWALL_CONFIG.SYN_FLOOD_WINDOW / 1000}s`, status: 'active' });
    rules.push({ type: 'firewall', name: 'HTTP Brute Force', value: `${FIREWALL_CONFIG.HTTP_BRUTE_MAX} req/${FIREWALL_CONFIG.HTTP_BRUTE_WINDOW / 1000}s`, status: 'active' });
    rules.push({ type: 'firewall', name: 'Auth Brute Force', value: `${FIREWALL_CONFIG.AUTH_BRUTE_MAX} attempts/${FIREWALL_CONFIG.AUTH_BRUTE_WINDOW / 60000}min`, status: 'active' });
    rules.push({ type: 'firewall', name: 'Port Scan Detection', value: `${FIREWALL_CONFIG.SCAN_DETECTION_THRESHOLD} paths/${FIREWALL_CONFIG.SCAN_DETECTION_WINDOW / 60000}min`, status: 'active' });
    rules.push({ type: 'firewall', name: 'Blocked Sensitive Paths', value: `${FIREWALL_CONFIG.BLOCKED_SENSITIVE_PATHS.length} paths`, status: 'active' });

    // WAF rules
    rules.push({ type: 'waf', name: 'Threat Score Threshold', value: `${WAF_CONFIG.THREAT_SCORE_THRESHOLD}`, status: 'active' });
    rules.push({ type: 'waf', name: 'Auto-Block Threshold', value: `${WAF_CONFIG.AUTO_BLOCK_THRESHOLD}`, status: 'active' });
    rules.push({ type: 'waf', name: 'Max Requests/Minute', value: `${WAF_CONFIG.MAX_REQUESTS_PER_MINUTE}`, status: 'active' });
    rules.push({ type: 'waf', name: 'Max Concurrent Requests', value: `${WAF_CONFIG.MAX_CONCURRENT_REQUESTS}`, status: 'active' });

    return { rules, totalRules: rules.length };
  } catch (e) {
    return { rules: [], totalRules: 0 };
  }
}

// Use same function for both iptables and UFW replacements
function getIPTablesRules() {
  return getAppFirewallRules();
}

function getUFWRules() {
  const appRules = getAppFirewallRules();
  return { active: true, rules: appRules.rules, raw: 'Application-level firewall (no system firewall required)' };
}

// ============================================================================
// ACTIVE CONNECTIONS (using ss without sudo - works on free hosting)
// ============================================================================

function getActiveConnections() {
  const connections = [];

  // ss works without sudo for listing own connections
  const ssRaw = safeCmd('ss -tunap 2>/dev/null || ss -tuna 2>/dev/null');
  if (!ssRaw) return connections;

  const lines = ssRaw.split('\n');
  for (const line of lines) {
    if (line.startsWith('Netid') || line.startsWith('State') || !line.trim()) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 5) {
      const state = parts[1] || '';
      const localAddr = parts[3] || '';
      const remoteAddr = parts[4] || '';

      connections.push({
        protocol: parts[0],
        state,
        localAddress: localAddr,
        remoteAddress: remoteAddr,
        process: parts[6] ? parts[6].replace(/users:\(\("/, '').replace(/".*/, '') : ''
      });
    }
  }

  return connections;
}

// ============================================================================
// CONNECTION STATES SUMMARY
// ============================================================================

function getConnectionSummary() {
  const ssRaw = safeCmd('ss -s 2>/dev/null');
  const summary = { tcp: 0, udp: 0, established: 0, closed: 0, timewait: 0, listen: 0, synRecv: 0 };

  if (!ssRaw) return summary;

  const tcpMatch = ssRaw.match(/TCP:\s+(\d+)/);
  if (tcpMatch) summary.tcp = parseInt(tcpMatch[1]);

  const udpMatch = ssRaw.match(/UDP:\s+(\d+)/);
  if (udpMatch) summary.udp = parseInt(udpMatch[1]);

  const states = safeCmd("ss -tan 2>/dev/null | awk '{print $1}' | sort | uniq -c");
  if (states) {
    for (const line of states.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const count = parseInt(parts[0]) || 0;
      const state = (parts[1] || '').toLowerCase();
      if (state === 'estab') summary.established = count;
      if (state === 'closed') summary.closed = count;
      if (state === 'timewait') summary.timewait = count;
      if (state === 'listen') summary.listen = count;
      if (state === 'syn-recv') summary.synRecv = count;
    }
  }

  return summary;
}

// ============================================================================
// PACKET STATS (from database instead of iptables)
// ============================================================================

function getPacketStats() {
  const stats = {
    input: { accepted: 0, dropped: 0, rejected: 0, total: 0 },
    output: { accepted: 0, dropped: 0, rejected: 0, total: 0 },
    forward: { accepted: 0, dropped: 0, rejected: 0, total: 0 }
  };

  try {
    // Get stats from firewall_logs table
    const blocked = db.prepare(`
      SELECT COUNT(*) as c FROM firewall_logs 
      WHERE action IN ('BLOCK', 'DROPPED') AND created_at > datetime('now', '-24 hours')
    `).get();
    stats.input.dropped = blocked ? blocked.c : 0;

    const passed = db.prepare(`
      SELECT COUNT(*) as c FROM access_log 
      WHERE created_at > datetime('now', '-24 hours')
    `).get();
    stats.input.accepted = passed ? passed.c : 0;

    // Also get WAF stats
    const wafBlocked = db.prepare(`
      SELECT COUNT(*) as c FROM waf_logs 
      WHERE blocked = 1 AND created_at > datetime('now', '-24 hours')
    `).get();
    stats.input.dropped += wafBlocked ? wafBlocked.c : 0;

    stats.input.total = stats.input.accepted + stats.input.dropped;

  } catch (e) {
    // Tables may not exist yet
  }

  return stats;
}

// ============================================================================
// SUSPICIOUS NETWORKS DETECTION (app-level)
// ============================================================================

function detectSuspiciousNetworks() {
  const suspicious = [];

  try {
    // Check for many requests from single IPs (from WAF logs)
    const topIPs = db.prepare(`
      SELECT ip_address, COUNT(*) as count 
      FROM waf_logs 
      WHERE created_at > datetime('now', '-1 hour')
      GROUP BY ip_address 
      HAVING count > 50
      ORDER BY count DESC LIMIT 10
    `).all();

    for (const row of topIPs) {
      suspicious.push({
        type: 'HIGH_REQUESTS',
        severity: row.count > 100 ? 'high' : 'medium',
        description: `${row.ip_address} - ${row.count} requests in last hour`,
        ip: row.ip_address,
        count: row.count
      });
    }

    // Check for brute force attempts
    const bruteForce = db.prepare(`
      SELECT ip_address, COUNT(*) as count 
      FROM login_history 
      WHERE success = 0 AND created_at > datetime('now', '-1 hour')
      GROUP BY ip_address 
      HAVING count > 5
      ORDER BY count DESC LIMIT 10
    `).all();

    for (const row of bruteForce) {
      suspicious.push({
        type: 'BRUTE_FORCE',
        severity: row.count > 20 ? 'high' : 'medium',
        description: `${row.ip_address} - ${row.count} failed logins`,
        ip: row.ip_address,
        count: row.count
      });
    }

    // Check for blocked IPs
    const blockedCount = db.prepare(`
      SELECT COUNT(*) as c FROM blocked_ips 
      WHERE expires_at > datetime('now') OR expires_at IS NULL
    `).get();

    if (blockedCount && blockedCount.c > 0) {
      suspicious.push({
        type: 'BLOCKED_IPS',
        severity: 'info',
        description: `${blockedCount.c} IPs currently blocked`,
        count: blockedCount.c
      });
    }

  } catch (e) {
    // Tables may not exist yet
  }

  return suspicious;
}

// ============================================================================
// SECURITY THREAT ANALYSIS (from database)
// ============================================================================

function getThreatAnalysis() {
  const analysis = {
    high: [], medium: [], low: [],
    summary: { high: 0, medium: 0, low: 0, total: 0 }
  };

  try {
    // High: blocked IPs
    const highThreats = db.prepare(`
      SELECT ip_address, reason, blocked_at, permanent
      FROM blocked_ips
      WHERE blocked_at > datetime('now', '-24 hours')
      ORDER BY blocked_at DESC LIMIT 20
    `).all();
    analysis.high = highThreats.map(t => ({ ...t, level: 'high' }));
    analysis.summary.high = highThreats.length;

    // Medium: WAF blocks
    const mediumThreats = db.prepare(`
      SELECT ip_address, threat_type, score, url, created_at
      FROM waf_logs
      WHERE blocked = 1 AND created_at > datetime('now', '-24 hours')
      ORDER BY score DESC LIMIT 20
    `).all();
    analysis.medium = mediumThreats.map(t => ({ ...t, level: 'medium' }));
    analysis.summary.medium = mediumThreats.length;

    // Low: failed logins
    const lowThreats = db.prepare(`
      SELECT ip_address, COUNT(*) as count, MAX(created_at) as last_attempt
      FROM login_history
      WHERE success = 0 AND created_at > datetime('now', '-24 hours')
      GROUP BY ip_address
      ORDER BY count DESC LIMIT 20
    `).all();
    analysis.low = lowThreats.map(t => ({ ...t, level: 'low' }));
    analysis.summary.low = lowThreats.length;

    analysis.summary.total = analysis.summary.high + analysis.summary.medium + analysis.summary.low;
  } catch (e) {}

  return analysis;
}

// ============================================================================
// FIREWALL PERFORMANCE (app-level metrics)
// ============================================================================

function getFirewallPerformance() {
  const perf = {
    rulesCount: 0,
    inputRules: 0,
    outputRules: 0,
    totalPacketsProcessed: 0,
    packetsDropped: 0,
    packetsAccepted: 0,
    dropRate: '0%',
    uptime: '',
    kernelVersion: '',
    lastRulesetChange: '',
    mode: 'application-level'
  };

  try {
    const appRules = getAppFirewallRules();
    perf.rulesCount = appRules.totalRules;
    perf.inputRules = appRules.totalRules;

    // Get stats from database
    const pktStats = getPacketStats();
    perf.totalPacketsProcessed = pktStats.input.total;
    perf.packetsDropped = pktStats.input.dropped;
    perf.packetsAccepted = pktStats.input.accepted;
    if (perf.totalPacketsProcessed > 0) {
      perf.dropRate = ((perf.packetsDropped / perf.totalPacketsProcessed) * 100).toFixed(2) + '%';
    }

    // Process uptime (no sudo needed)
    perf.uptime = process.uptime();
    const hours = Math.floor(perf.uptime / 3600);
    const minutes = Math.floor((perf.uptime % 3600) / 60);
    perf.uptime = `${hours}h ${minutes}m`;

    // Memory usage
    const mem = process.memoryUsage();
    perf.memoryUsage = {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heap: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
    };

  } catch (e) {}

  return perf;
}

// ============================================================================
// EXPORT CSV
// ============================================================================

function exportCSV(type) {
  let rows = [];

  if (type === 'waf') {
    const logs = db.prepare('SELECT * FROM waf_logs ORDER BY created_at DESC LIMIT 1000').all();
    rows = ['Time,IP,Type,Path,Score,Blocked'];
    for (const l of logs) {
      rows.push(`${l.created_at},${l.ip_address},${l.threat_type},"${(l.url||'').replace(/"/g,'""')}",${l.score},${l.blocked ? 'Yes' : 'No'}`);
    }
  } else if (type === 'blocked') {
    const ips = db.prepare('SELECT * FROM blocked_ips ORDER BY blocked_at DESC').all();
    rows = ['IP,Reason,Blocked At,Expires,Permanent'];
    for (const i of ips) {
      rows.push(`${i.ip_address},"${(i.reason||'').replace(/"/g,'""')}",${i.blocked_at},${i.expires_at||'Permanent'},${i.permanent ? 'Yes' : 'No'}`);
    }
  } else if (type === 'logins') {
    const logs = db.prepare('SELECT * FROM login_history ORDER BY created_at DESC LIMIT 1000').all();
    rows = ['Time,Email,IP,Browser,Result'];
    for (const l of logs) {
      rows.push(`${l.created_at},${l.email},${l.ip_address},"${(l.user_agent||'').replace(/"/g,'""')}",${l.success ? 'Success' : 'Failed'}`);
    }
  } else if (type === 'events') {
    const events = db.prepare("SELECT * FROM activity_logs WHERE action LIKE 'security_%' ORDER BY created_at DESC LIMIT 1000").all();
    rows = ['Time,Type,Details,IP'];
    for (const e of events) {
      rows.push(`${e.created_at},${e.action},"${(e.details||'').replace(/"/g,'""')}",${e.ip_address || ''}`);
    }
  }

  return rows.join('\n');
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  getIPTablesRules,
  getUFWRules,
  getActiveConnections,
  getConnectionSummary,
  getPacketStats,
  detectSuspiciousNetworks,
  getThreatAnalysis,
  getFirewallPerformance,
  exportCSV
};

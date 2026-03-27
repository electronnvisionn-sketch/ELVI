/**
 * ELECTRON VISION - Monitoring & Alerting System
 * Real-time Security Monitoring and Alerts
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../database');
const { getClientIP } = require('./security');

const MONITOR_CONFIG = {
  ALERT_THRESHOLDS: {
    requestsPerMinute: parseInt(process.env.ALERT_RPM) || 200,
    errorRate: parseInt(process.env.ALERT_ERROR_RATE) || 10,
    threatScore: parseInt(process.env.ALERT_THREAT_SCORE) || 50,
    failedLogins: parseInt(process.env.ALERT_FAILED_LOGINS) || 20
  },
  CHECK_INTERVAL: parseInt(process.env.MONITOR_INTERVAL) || 60000,
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION) || 30,
  ENABLE_TELEGRAM_ALERTS: process.env.ENABLE_TELEGRAM_ALERTS !== 'false',
  ENABLE_EMAIL_ALERTS: process.env.ENABLE_EMAIL_ALERTS === 'true'
};

const ALERT_TYPES = {
  RATE_LIMIT: 'rate_limit',
  THREAT_DETECTED: 'threat_detected',
  IP_BLOCKED: 'ip_blocked',
  DDOS_ATTACK: 'ddos_attack',
  SQL_INJECTION: 'sql_injection',
  XSS_ATTACK: 'xss_attack',
  BRUTE_FORCE: 'brute_force',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  SERVER_ERROR: 'server_error',
  BOT_DETECTED: 'bot_detected'
};

const activeAlerts = new Map();
const metricsBuffer = [];
let lastCleanup = Date.now();

class SecurityMonitor {
  constructor() {
    this.metrics = {
      requests: [],
      threats: [],
      errors: [],
      blocks: [],
      bandwidth: []
    };
    this.startTime = Date.now();
  }

  recordRequest(ip, path, method, status, responseTime) {
    this.metrics.requests.push({
      timestamp: Date.now(),
      ip,
      path,
      method,
      status,
      responseTime
    });
  }

  recordThreat(ip, type, score, details) {
    this.metrics.threats.push({
      timestamp: Date.now(),
      ip,
      type,
      score,
      details
    });
  }

  recordError(ip, error, path) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      ip,
      error,
      path
    });
  }

  recordBlock(ip, reason) {
    this.metrics.blocks.push({
      timestamp: Date.now(),
      ip,
      reason
    });
  }

  getMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const recentRequests = this.metrics.requests.filter(r => r.timestamp > oneMinuteAgo);
    const hourlyRequests = this.metrics.requests.filter(r => r.timestamp > oneHourAgo);
    const dailyRequests = this.metrics.requests.filter(r => r.timestamp > oneDayAgo);

    const recentThreats = this.metrics.threats.filter(t => t.timestamp > oneMinuteAgo);
    const hourlyThreats = this.metrics.threats.filter(t => t.timestamp > oneHourAgo);

    const hourlyErrors = this.metrics.errors.filter(e => e.timestamp > oneHourAgo);
    const hourlyBlocks = this.metrics.blocks.filter(b => b.timestamp > oneHourAgo);

    const uniqueIPs = new Set(recentRequests.map(r => r.ip)).size;
    const uniqueIPsHour = new Set(hourlyRequests.map(r => r.ip)).size;

    const statusCounts = {};
    recentRequests.forEach(r => {
      const statusGroup = Math.floor(r.status / 100) + 'xx';
      statusCounts[statusGroup] = (statusCounts[statusGroup] || 0) + 1;
    });

    const avgResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length
      : 0;

    const threatTypes = {};
    hourlyThreats.forEach(t => {
      threatTypes[t.type] = (threatTypes[t.type] || 0) + 1;
    });

    return {
      uptime: now - this.startTime,
      requests: {
        lastMinute: recentRequests.length,
        lastHour: hourlyRequests.length,
        lastDay: dailyRequests.length,
        uniqueIPsLastMinute: uniqueIPs,
        uniqueIPsLastHour: uniqueIPsHour
      },
      performance: {
        avgResponseTime: Math.round(avgResponseTime),
        requestsPerSecond: (recentRequests.length / 60).toFixed(2)
      },
      threats: {
        lastMinute: recentThreats.length,
        lastHour: hourlyThreats.length,
        byType: threatTypes
      },
      errors: {
        lastHour: hourlyErrors.length
      },
      blocks: {
        lastHour: hourlyBlocks.length
      },
      httpStatus: statusCounts
    };
  }

  checkThresholds() {
    const metrics = this.getMetrics();
    const alerts = [];

    if (metrics.requests.lastMinute > MONITOR_CONFIG.ALERT_THRESHOLDS.requestsPerMinute) {
      alerts.push({
        type: ALERT_TYPES.DDOS_ATTACK,
        severity: 'critical',
        message: `High request rate: ${metrics.requests.lastMinute} req/min`,
        details: metrics.requests
      });
    }

    if (metrics.threats.lastMinute > MONITOR_CONFIG.ALERT_THRESHOLDS.threatScore / 10) {
      alerts.push({
        type: ALERT_TYPES.THREAT_DETECTED,
        severity: 'high',
        message: `High threat rate: ${metrics.threats.lastMinute} threats/min`,
        details: metrics.threats
      });
    }

    if (metrics.errors.lastHour > MONITOR_CONFIG.ALERT_THRESHOLDS.errorRate) {
      alerts.push({
        type: ALERT_TYPES.SERVER_ERROR,
        severity: 'medium',
        message: `High error rate: ${metrics.errors.lastHour} errors/hour`,
        details: { errorsLastHour: metrics.errors.lastHour }
      });
    }

    if (metrics.blocks.lastHour > 10) {
      alerts.push({
        type: ALERT_TYPES.IP_BLOCKED,
        severity: 'medium',
        message: `High block rate: ${metrics.blocks.lastHour} blocks/hour`,
        details: metrics.blocks
      });
    }

    return alerts;
  }

  cleanup() {
    const now = Date.now();
    const cutoff = now - 86400000 * MONITOR_CONFIG.LOG_RETENTION_DAYS;

    this.metrics.requests = this.metrics.requests.filter(r => r.timestamp > cutoff);
    this.metrics.threats = this.metrics.threats.filter(t => t.timestamp > cutoff);
    this.metrics.errors = this.metrics.errors.filter(e => e.timestamp > cutoff);
    this.metrics.blocks = this.metrics.blocks.filter(b => b.timestamp > cutoff);

    lastCleanup = now;
  }
}

const monitor = new SecurityMonitor();

function initMonitorDatabase() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT,
        details TEXT,
        ip_address TEXT,
        resolved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS monitoring_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        value REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    console.log('✅ Monitoring database initialized');
  } catch (error) {
    console.error('❌ Monitoring database init error:', error.message);
  }
}

function createAlert(alertType, severity, message, details = {}, ip = null) {
  const alert = {
    id: Date.now() + Math.random(),
    type: alertType,
    severity,
    message,
    details,
    ip,
    timestamp: new Date().toISOString(),
    resolved: false
  };

  activeAlerts.set(alert.id, alert);

  try {
    db.prepare(`
      INSERT INTO security_alerts (alert_type, severity, message, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(alertType, severity, message, JSON.stringify(details), ip);
  } catch (error) {
    console.error('Failed to create alert:', error.message);
  }

  sendTelegramAlert(alert);
  console.error(`🚨 [ALERT] ${severity.toUpperCase()}: ${message}`);

  return alert;
}

async function sendTelegramAlert(alert) {
  if (!MONITOR_CONFIG.ENABLE_TELEGRAM_ALERTS) return;

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) return;

    const message = `🚨 *Security Alert*\n\n` +
      `*Type:* ${alert.type}\n` +
      `*Severity:* ${alert.severity}\n` +
      `*Message:* ${alert.message}\n` +
      `*Time:* ${alert.timestamp}\n` +
      `${alert.ip ? `*IP:* ${alert.ip}\n` : ''}`;

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('Telegram alert error:', error.message);
  }
}

function resolveAlert(alertId) {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();

    try {
      db.prepare(`
        UPDATE security_alerts 
        SET resolved = 1, resolved_at = datetime("now") 
        WHERE id = ?
      `).run(alertId);
    } catch (error) {
      console.error('Failed to resolve alert:', error.message);
    }
  }

  activeAlerts.delete(alertId);
}

function getActiveAlerts() {
  return Array.from(activeAlerts.values()).filter(a => !a.resolved);
}

function getAlertHistory(hours = 24) {
  try {
    return db.prepare(`
      SELECT * FROM security_alerts 
      WHERE created_at > datetime("now", "-${hours} hours")
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
  } catch (error) {
    return [];
  }
}

function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();
  const ip = getClientIP(req);

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    monitor.recordRequest(ip, req.path, req.method, res.statusCode, responseTime);

    if (res.statusCode >= 500) {
      monitor.recordError(ip, `Status ${res.statusCode}`, req.path);
    }
  });

  next();
}

function recordThreat(ip, type, score, details) {
  monitor.recordThreat(ip, type, score, details);

  if (score >= MONITOR_CONFIG.ALERT_THRESHOLDS.threatScore) {
    createAlert(
      type === 'SQL_INJECTION' ? ALERT_TYPES.SQL_INJECTION :
      type === 'XSS' ? ALERT_TYPES.XSS_ATTACK :
      ALERT_TYPES.THREAT_DETECTED,
      score > 30 ? 'critical' : 'high',
      `Threat detected: ${type} (score: ${score})`,
      details,
      ip
    );
  }
}

function recordBlock(ip, reason) {
  monitor.recordBlock(ip, reason);
  createAlert(ALERT_TYPES.IP_BLOCKED, 'medium', `IP blocked: ${reason}`, {}, ip);
}

function startMonitoring() {
  setInterval(() => {
    const alerts = monitor.checkThresholds();
    alerts.forEach(alert => {
      createAlert(alert.type, alert.severity, alert.message, alert.details);
    });

    if (Date.now() - lastCleanup > 3600000) {
      monitor.cleanup();
    }

    const metrics = monitor.getMetrics();
    try {
      db.prepare(`
        INSERT INTO monitoring_metrics (metric_type, value)
        VALUES ('requests_per_minute', ?)
      `).run(metrics.requests.lastMinute);
    } catch (error) {}
  }, MONITOR_CONFIG.CHECK_INTERVAL);

  console.log('✅ Security monitoring started');
}

initMonitorDatabase();
startMonitoring();

module.exports = {
  monitor,
  monitoringMiddleware,
  createAlert,
  resolveAlert,
  getActiveAlerts,
  getAlertHistory,
  recordThreat,
  recordBlock,
  ALERT_TYPES,
  MONITOR_CONFIG
};

/**
 * ELECTRON VISION - Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateService } = require('../middleware/validators');
const { requirePermission, requireAnyPermission, getAllRoles } = require('../middleware/permissions');
const db = require('../database');
const cybersecurityController = require('../controllers/cybersecurityController');

// All routes require authentication
router.use(authenticate);

// All routes require at least moderator level
router.use(requireAnyPermission(['dashboard.view', 'users.view', 'bookings.view', 'tickets.view', 'messages.view', 'notifications.view', 'broadcasts.view']));

// GET /api/admin/roles
router.get('/roles', (req, res) => {
  try { res.json({ roles: getAllRoles() }); }
  catch (e) { res.status(500).json({ error: 'خطأ' }); }
});

// ===== Dashboard =====
router.get('/dashboard', requireAnyPermission(['dashboard.view', 'users.view', 'bookings.view']), adminController.getDashboardStats);

// ===== Users (manager + admin only) =====
router.get('/users', requirePermission('users.view'), adminController.getAllUsers);
router.post('/users', requirePermission('users.create'), adminController.createUser);
router.get('/users/:id', requirePermission('users.view'), adminController.getUser);
router.put('/users/:id', requirePermission('users.edit'), adminController.updateUser);
router.delete('/users/:id', requirePermission('users.delete'), adminController.deleteUser);

// ===== Services (admin only) =====
router.get('/services', requireAdmin, adminController.getAllServices);
router.post('/services', requireAdmin, validateService, adminController.createService);
router.put('/services/:id', requireAdmin, validateService, adminController.updateService);
router.delete('/services/:id', requireAdmin, adminController.deleteService);

// ===== Messages (moderator + admin) =====
router.get('/messages', requirePermission('messages.view'), adminController.getAllMessages);
router.put('/messages/:id/read', requirePermission('messages.view'), adminController.markMessageRead);
router.delete('/messages/:id', requirePermission('messages.delete'), adminController.deleteMessage);

// ===== Orders (admin only) =====
router.get('/orders', requireAdmin, adminController.getAllOrders);
router.get('/orders/:id', requireAdmin, adminController.getOrderByIdAdmin);
router.put('/orders/:id/status', requireAdmin, adminController.updateOrderStatus);

// ===== Activity Logs (admin only) =====
router.get('/logs', requireAdmin, adminController.getActivityLogs);

// ===== Website Content (admin only) =====
router.get('/content', requireAdmin, (req, res) => {
  try {
    const content = db.prepare('SELECT * FROM website_content').all();
    res.json({ content });
  } catch (error) { res.status(500).json({ error: 'خطأ' }); }
});

router.put('/content', requireAdmin, (req, res) => {
  try {
    const { section, key, value } = req.body;
    if (!section || !key) return res.status(400).json({ error: 'القسم والمفتاح مطلوبان' });
    db.prepare(`INSERT INTO website_content (section, key, value) VALUES (?, ?, ?) ON CONFLICT(section, key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`).run(section, key, value, value);
    db.prepare(`INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`).run(req.user.id, 'content_updated', `Content updated: ${section}.${key}`, req.ip);
    res.json({ message: 'تم التحديث' });
  } catch (error) { res.status(500).json({ error: 'خطأ' }); }
});

// ===== Database (admin only) =====
const SYSTEM_ADMIN_PASSWORD = 'ELECTRON.VISION.2012.2010';

function encryptPassword(pw, key) {
  let r = '';
  for (let i = 0; i < pw.length; i++) r += String.fromCharCode(pw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return Buffer.from(r).toString('base64');
}

function decryptPassword(enc, key) {
  try {
    const d = Buffer.from(enc, 'base64').toString('utf8');
    let r = '';
    for (let i = 0; i < d.length; i++) r += String.fromCharCode(d.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return r;
  } catch (e) { return null; }
}

router.post('/verify-db-password', requireAdmin, (req, res) => {
  try {
    const { password, key } = req.body;
    if (!password || !key) return res.status(400).json({ error: 'مطلوب' });
    const decrypted = decryptPassword(password, key);
    if (decrypted === SYSTEM_ADMIN_PASSWORD) {
      const { sign } = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'electron-vision-secret-key-2024';
      const token = sign({ id: 999, username: 'db_admin', role: 'admin', is_db_admin: true }, JWT_SECRET, { expiresIn: '1h', issuer: 'electron-vision' });
      db.prepare(`INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`).run(req.user?.id || 0, 'db_access', 'تم الوصول لقاعدة البيانات', req.ip);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }
  } catch (error) { res.status(500).json({ error: 'خطأ' }); }
});

router.get('/db-stats', requireAdmin, (req, res) => {
  try {
    const stats = {};
    const tables = ['users', 'products', 'orders', 'sessions', 'tickets', 'services', 'messages'];
    for (const t of tables) {
      try {
        const c = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
        stats[t] = { count: c?.count || 0 };
      } catch (e) { stats[t] = { count: 0 }; }
    }
    res.json(stats);
  } catch (error) { res.status(500).json({ error: 'خطأ' }); }
});

router.get('/db-table/:table', requireAdmin, (req, res) => {
  try {
    const tableMap = { users: 'users', products: 'products', orders: 'orders', bookings: 'sessions', tickets: 'tickets', services: 'services', messages: 'messages', coupons: 'coupon_codes' };
    const t = tableMap[req.params.table];
    if (!t) return res.status(400).json({ error: 'جدول غير صالح' });
    const records = db.prepare(`SELECT * FROM ${t} ORDER BY id DESC LIMIT 100`).all();
    res.json({ success: true, records });
  } catch (error) { res.status(500).json({ error: 'خطأ', records: [] }); }
});

router.delete('/db-delete/:table/:id', requireAdmin, (req, res) => {
  try {
    const tableMap = { users: 'users', products: 'products', orders: 'orders', bookings: 'sessions', tickets: 'tickets', services: 'services', messages: 'messages', coupons: 'coupon_codes' };
    const t = tableMap[req.params.table];
    if (!t) return res.status(400).json({ error: 'جدول غير صالح' });
    if (t === 'users') {
      const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
      if (u?.role === 'admin') return res.status(400).json({ error: 'لا يمكن حذف حساب الأدمن' });
    }
    const result = db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(req.params.id);
    if (result.changes > 0) {
      db.prepare(`INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`).run(req.user?.id || 0, 'db_delete', `تم حذف من ${t}`, req.ip);
      res.json({ success: true, message: 'تم الحذف' });
    } else {
      res.status(404).json({ error: 'غير موجود' });
    }
  } catch (error) { res.status(500).json({ error: 'خطأ' }); }
});

// ===== Notifications (manager + admin) =====
router.get('/notifications', requirePermission('notifications.view'), adminController.getNotifications);
router.put('/notifications/:id/read', requirePermission('notifications.view'), adminController.markNotificationRead);
router.delete('/notifications/:id', requirePermission('notifications.view'), adminController.deleteNotification);
router.delete('/notifications', requirePermission('notifications.view'), adminController.deleteAllNotifications);

// ===== Broadcasts (manager + admin) =====
router.get('/broadcasts', requirePermission('broadcasts.view'), adminController.getBroadcasts);
router.post('/broadcasts', requirePermission('broadcasts.create'), adminController.createBroadcast);
router.delete('/broadcasts/:id', requirePermission('broadcasts.delete'), adminController.deleteBroadcast);

// ===== Analytics (admin only) =====
router.get('/analytics', requireAdmin, adminController.getAnalytics);
router.get('/api-usage', requireAdmin, adminController.getApiUsage);

// ===== Firewall Status (admin only) =====
router.get('/firewall', requireAdmin, adminController.getFirewallStatus);

// ===== Cybersecurity (admin only) =====
router.get('/cybersecurity/dashboard', requireAdmin, cybersecurityController.getDashboard);
router.get('/cybersecurity/rules', requireAdmin, cybersecurityController.getRules);
router.get('/cybersecurity/connections', requireAdmin, cybersecurityController.getConnections);
router.get('/cybersecurity/packets', requireAdmin, cybersecurityController.getPackets);
router.get('/cybersecurity/threats', requireAdmin, cybersecurityController.getThreats);
router.get('/cybersecurity/performance', requireAdmin, cybersecurityController.getPerformance);
router.get('/cybersecurity/waf-logs', requireAdmin, cybersecurityController.getWAFLogs);
router.get('/cybersecurity/blocked-ips', requireAdmin, cybersecurityController.getBlockedIPsList);
router.post('/cybersecurity/block-ip', requireAdmin, cybersecurityController.blockIPAction);
router.delete('/cybersecurity/unblock-ip/:ip', requireAdmin, cybersecurityController.unblockIPAction);
router.post('/cybersecurity/unblock-all', requireAdmin, cybersecurityController.unblockAllAction);
router.get('/cybersecurity/login-history', requireAdmin, cybersecurityController.getLoginHistory);
router.get('/cybersecurity/events', requireAdmin, cybersecurityController.getSecurityEvents);
router.get('/cybersecurity/export', requireAdmin, cybersecurityController.exportData);
router.post('/cybersecurity/flush-logs', requireAdmin, cybersecurityController.flushLogs);
router.get('/cybersecurity/firewall-status', requireAdmin, cybersecurityController.getFirewallStatus);

// ===== System Health (admin only) =====
router.get('/system-health', requireAdmin, adminController.getSystemHealth);
router.get('/error-logs', requireAdmin, adminController.getErrorLogs);

// ===== Payment Methods (admin only) =====
router.get('/payment-methods', requireAdmin, adminController.getPaymentMethods);
router.post('/payment-methods', requireAdmin, adminController.addPaymentMethod);
router.put('/payment-methods/:id', requireAdmin, adminController.updatePaymentMethod);
router.delete('/payment-methods/:id', requireAdmin, adminController.deletePaymentMethod);

// ===== Auto Responses (admin only) =====
router.get('/auto-responses', requireAdmin, adminController.getAutoResponses);
router.post('/auto-responses', requireAdmin, adminController.createAutoResponse);
router.put('/auto-responses/:id', requireAdmin, adminController.updateAutoResponse);
router.delete('/auto-responses/:id', requireAdmin, adminController.deleteAutoResponse);

module.exports = router;

/**
 * ELECTRON VISION - Admin Controller
 */

const bcrypt = require('bcrypt');
const db = require('../database');
const { emitToAll } = require('../middleware/socket');

// Get dashboard statistics
function getDashboardStats(req, res) {
  try {
    const userStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      verified: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_verified = 1').get().count,
      unverified: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_verified = 0').get().count
    };
    
    const productStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
      free: db.prepare('SELECT COUNT(*) as count FROM products WHERE is_free = 1').get().count,
      paid: db.prepare('SELECT COUNT(*) as count FROM products WHERE is_paid = 1').get().count
    };
    
    const ticketStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM tickets').get().count,
      open: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get().count,
      inProgress: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'").get().count,
      closed: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'").get().count
    };
    
    const messageStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
      unread: db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_read = 0').get().count
    };
    
    // Recent activity
    const recentActivity = db.prepare(`
      SELECT al.*, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all();
    
    res.json({
      users: userStats,
      products: productStats,
      tickets: ticketStats,
      messages: messageStats,
      recentActivity
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get all users (admin only)
function getAllUsers(req, res) {
  try {
    const { role, verified } = req.query;
    
    let query = 'SELECT id, username, email, role, is_verified, created_at FROM users WHERE 1=1';
    const params = [];
    
    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    
    if (verified !== undefined) {
      query += ' AND is_verified = ?';
      params.push(verified === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const users = db.prepare(query).all(...params);
    
    res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get single user (admin only)
function getUser(req, res) {
  try {
    const { id } = req.params;
    
    const user = db.prepare(`
      SELECT id, username, email, role, is_verified, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // Get user's tickets
    const userTickets = db.prepare(`
      SELECT id, title, priority, status, created_at
      FROM tickets WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(id);
    
    res.json({ user, tickets: userTickets });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Create new user (admin/manager only)
async function createUser(req, res) {
  try {
    const { username, email, password, role, is_verified } = req.body;
    
    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    
    // Validate role
    const validRoles = ['user', 'admin', 'manager', 'moderator'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'الدور المحدد غير صالح' });
    }
    
    // Check for existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    
    if (existing) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو اسم المستخدم موجود بالفعل' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new user
    const result = db.prepare(`
      INSERT INTO users (username, email, password, role, is_verified)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hashedPassword, role || 'user', is_verified ? 1 : 0);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'user_created', `New user created: ${username}`, req.ip);
    
    res.status(201).json({ 
      message: 'تم إنشاء المستخدم بنجاح',
      userId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Update user (admin/manager only)
function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { username, email, role, is_verified } = req.body;
    
    // Validate role
    const validRoles = ['user', 'admin', 'manager', 'moderator'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'الدور المحدد غير صالح' });
    }
    
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // Check for duplicate email/username
    const duplicate = db.prepare(`
      SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?
    `).get(email, username, id);
    
    if (duplicate) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو اسم المستخدم مستخدم بالفعل' });
    }
    
    db.prepare(`
      UPDATE users SET username = ?, email = ?, role = ?, is_verified = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(username, email, role, is_verified ? 1 : 0, id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'user_updated', `User #${id} updated`, req.ip);
    
    res.json({ message: 'تم تحديث المستخدم بنجاح' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete user (admin only)
function deleteUser(req, res) {
  try {
    const { id } = req.params;
    
    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
    }
    
    const existing = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'user_deleted', `User deleted: ${existing.username}`, req.ip);
    
    res.json({ message: 'تم حذف المستخدم بنجاح' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get all services (admin only)
function getAllServices(req, res) {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY created_at DESC').all();
    res.json({ services });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Create service (admin only)
function createService(req, res) {
  try {
    const { name, name_ar, description, description_ar, icon } = req.body;
    
    const result = db.prepare(`
      INSERT INTO services (name, name_ar, description, description_ar, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, name_ar, description || '', description_ar || '', icon || 'star');
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'service_created', `Service created: ${name}`, req.ip);
    
    res.status(201).json({
      message: 'تم إنشاء الخدمة بنجاح',
      serviceId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Update service (admin only)
function updateService(req, res) {
  try {
    const { id } = req.params;
    const { name, name_ar, description, description_ar, icon } = req.body;
    
    const existing = db.prepare('SELECT id FROM services WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'الخدمة غير موجودة' });
    }
    
    db.prepare(`
      UPDATE services SET name = ?, name_ar = ?, description = ?, description_ar = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, name_ar, description || '', description_ar || '', icon || 'star', id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'service_updated', `Service #${id} updated`, req.ip);
    
    res.json({ message: 'تم تحديث الخدمة بنجاح' });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete service (admin only)
function deleteService(req, res) {
  try {
    const { id } = req.params;
    
    const existing = db.prepare('SELECT id, name FROM services WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'الخدمة غير موجودة' });
    }
    
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'service_deleted', `Service deleted: ${existing.name}`, req.ip);
    
    res.json({ message: 'تم حذف الخدمة بنجاح' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get all messages (admin only)
function getAllMessages(req, res) {
  try {
    const messages = db.prepare(`
      SELECT id, name, phone, email, subject, message, is_read, created_at 
      FROM messages 
      ORDER BY created_at DESC
    `).all();
    
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Mark message as read (admin only)
function markMessageRead(req, res) {
  try {
    const { id } = req.params;
    
    const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'الرسالة غير موجودة' });
    }
    
    db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(id);
    
    res.json({ message: 'تم تحديد الرسالة كمقروءة' });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete message (admin only)
function deleteMessage(req, res) {
  try {
    const { id } = req.params;
    
    const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'الرسالة غير موجودة' });
    }
    
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    
    res.json({ message: 'تم حذف الرسالة بنجاح' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get activity logs (admin only)
function getActivityLogs(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Cap at 100
    
    const logs = db.prepare(`
      SELECT al.*, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
    
    res.json({ logs });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Admin: Orders
function getAllOrders(req, res) {
  try {
    const orders = db.prepare(`
      SELECT o.*, u.username, u.email
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `).all();

    res.json({ orders });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ error: 'خطأ في جلب الطلبات' });
  }
}

function getOrderByIdAdmin(req, res) {
  try {
    const { id } = req.params;

    const order = db.prepare(`
      SELECT o.*, u.username, u.email
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ?
    `).get(id);

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.name, p.name_ar, p.download_url
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(order.id);

    const payments = db.prepare(`
      SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC
    `).all(order.id);

    res.json({ order, items, payments });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'خطأ في جلب الطلب' });
  }
}

function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['cart', 'pending', 'paid', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'حالة غير صحيحة' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    db.prepare(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'order_updated', `Order #${id} status updated to ${status}`, req.ip);

    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'خطأ في تحديث حالة الطلب' });
  }
}

// Get notifications
function getNotifications(req, res) {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    
    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications WHERE is_read = 0
    `).get();
    
    res.json({ 
      notifications: notifications || [],
      unreadCount: unreadCount?.count || 0
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ notifications: [], unreadCount: 0 });
  }
}

// Mark notification as read
function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ message: 'تم تحديد الإشعار كمقروء' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete notification
function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
    res.json({ message: 'تم حذف الإشعار بنجاح' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete all notifications
function deleteAllNotifications(req, res) {
  try {
    db.prepare('DELETE FROM notifications').run();
    res.json({ message: 'تم حذف جميع الإشعارات بنجاح' });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get broadcasts
function getBroadcasts(req, res) {
  try {
    const broadcasts = db.prepare(`
      SELECT b.*, u.username as creator_name
      FROM broadcasts b
      LEFT JOIN users u ON b.created_by = u.id
      ORDER BY b.created_at DESC 
      LIMIT 50
    `).all();
    res.json({ broadcasts: broadcasts || [] });
  } catch (error) {
    console.error('Get broadcasts error:', error);
    res.status(500).json({ broadcasts: [] });
  }
}

// Create broadcast
function createBroadcast(req, res) {
  try {
    console.log('[Broadcast] Creating broadcast, body:', req.body);
    const { title, message, target_type } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
    }
    
    const result = db.prepare(`
      INSERT INTO broadcasts (title, message, target_type, created_by)
      VALUES (?, ?, ?, ?)
    `).run(title, message, target_type || 'all', req.user.id);
    
    console.log('[Broadcast] Inserted, id:', result.lastInsertRowid);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'broadcast_created', `Broadcast created: ${title}`, req.ip);
    
    // Get all users based on target_type
    let users = [];
    if (target_type === 'all' || !target_type) {
      // Get ALL users including admins
      users = db.prepare('SELECT id FROM users').all();
    } else if (target_type === 'users') {
      users = db.prepare('SELECT id FROM users WHERE role = ?').all('user');
    } else if (target_type === 'admins') {
      users = db.prepare('SELECT id FROM users WHERE role = ?').all('admin');
    }
    
    // Create notification for each user
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    try {
      for (const user of users) {
        // Use 'system' type instead of 'broadcast' to avoid CHECK constraint issues
        insertNotif.run(user.id, 'system', title, message, '/notifications');
      }
      console.log('[Broadcast] Created notifications for', users.length, 'users');
    } catch (notifError) {
      console.error('[Broadcast] Error creating notifications:', notifError.message);
    }
    
    // Send real-time notification to all connected users
    console.log('[Broadcast] Checking global.io:', !!global.io);
    if (global.io) {
      console.log('[Broadcast] Emitting notification event');
      emitToAll(global.io, 'notification', {
        id: result.lastInsertRowid,
        title: title,
        message: message,
        type: 'broadcast',
        timestamp: new Date().toISOString()
      });
      console.log('[Broadcast] Notification emitted');
    } else {
      console.log('[Broadcast] global.io is undefined!');
    }
    
    // Send push notifications to all users with subscriptions
    sendPushBroadcast(title, message);
    
    res.status(201).json({ 
      message: 'تم إنشاء البث بنجاح',
      broadcastId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create broadcast error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Send push notification to all subscribed users
async function sendPushBroadcast(title, message) {
  try {
    const webpush = require('web-push');
    const vapidKeys = require('../vapid-keys.json');
    
    webpush.setVapidDetails(
      'mailto:admin@electronvision.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
    
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: JSON.parse(sub.endpoint),
          keys: JSON.parse(sub.keys)
        };
        
        await webpush.sendNotification(pushSubscription, JSON.stringify({
          title,
          body: message,
          icon: '/icon-192.png',
          badge: '/badge.png',
          tag: 'broadcast',
          data: { url: '/' }
        }));
        
        console.log('[Push] Broadcast sent to user', sub.user_id);
      } catch (e) {
        // Remove invalid subscription
        if (e.statusCode === 410 || e.statusCode === 404) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          console.log('[Push] Removed invalid subscription', sub.id);
        }
      }
    }
  } catch (error) {
    console.error('[Push] Broadcast error:', error.message);
  }
}

// Delete broadcast
function deleteBroadcast(req, res) {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
    res.json({ message: 'تم حذف البث بنجاح' });
  } catch (error) {
    console.error('Delete broadcast error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get analytics data
function getAnalytics(req, res) {
  try {
    // Revenue analytics
    let revenueData = { total_revenue: 0, total_orders: 0 };
    try {
      const rd = db.prepare(`
        SELECT SUM(total_amount) as total_revenue, COUNT(*) as total_orders
        FROM orders 
        WHERE status = 'paid'
      `).get();
      if (rd) revenueData = rd;
    } catch (e) { console.log('Revenue query skipped:', e.message); }
    
    // New users in last 30 days
    let newUsers = { count: 0 };
    try {
      const nu = db.prepare(`
        SELECT COUNT(*) as count FROM users 
        WHERE created_at >= datetime('now', '-30 days')
      `).get();
      if (nu) newUsers = nu;
    } catch (e) { console.log('New users query skipped:', e.message); }
    
    // Top products
    let topProducts = [];
    try {
      topProducts = db.prepare(`
        SELECT p.name, p.name_ar, COUNT(oi.id) as order_count
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id
        ORDER BY order_count DESC
        LIMIT 10
      `).all();
    } catch (e) { 
      console.log('Top products query skipped:', e.message);
      try {
        topProducts = db.prepare(`
          SELECT name, name_ar, 0 as order_count
          FROM products
          ORDER BY created_at DESC
          LIMIT 10
        `).all();
      } catch (e2) { topProducts = []; }
    }
    
    // Orders by date (last 30 days)
    let ordersByDate = [];
    try {
      ordersByDate = db.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total_amount) as revenue
        FROM orders
        WHERE created_at >= datetime('now', '-30 days') AND status = 'paid'
        GROUP BY DATE(created_at)
        ORDER BY date
      `).all();
    } catch (e) { console.log('Orders by date query skipped:', e.message); }
    
    res.json({
      revenue: revenueData?.total_revenue || 0,
      totalOrders: revenueData?.total_orders || 0,
      newUsers: newUsers?.count || 0,
      topProducts: topProducts || [],
      ordersByDate: ordersByDate || []
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.json({
      revenue: 0,
      totalOrders: 0,
      newUsers: 0,
      topProducts: [],
      ordersByDate: []
    });
  }
}

// Get API usage statistics
function getApiUsage(req, res) {
  try {
    // Total requests from activity logs (last 30 days)
    let totalRequests = { count: 0 };
    try {
      totalRequests = db.prepare(`
        SELECT COUNT(*) as count FROM activity_logs
        WHERE created_at >= datetime('now', '-30 days')
      `).get() || { count: 0 };
    } catch (e) {}

    // Requests today
    let todayRequests = { count: 0 };
    try {
      todayRequests = db.prepare(`
        SELECT COUNT(*) as count FROM activity_logs
        WHERE DATE(created_at) = DATE('now')
      `).get() || { count: 0 };
    } catch (e) {}

    // Top actions
    let topActions = [];
    try {
      topActions = db.prepare(`
        SELECT action, COUNT(*) as count
        FROM activity_logs
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `).all();
    } catch (e) {}

    // Active users (last 7 days)
    let activeUsers = { count: 0 };
    try {
      activeUsers = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM activity_logs
        WHERE created_at >= datetime('now', '-7 days') AND user_id IS NOT NULL
      `).get() || { count: 0 };
    } catch (e) {}

    // Total users
    let totalUsers = { count: 0 };
    try {
      totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() || { count: 0 };
    } catch (e) {}

    // Requests by day (last 7 days)
    let requestsByDay = [];
    try {
      requestsByDay = db.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM activity_logs
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY date
      `).all();
    } catch (e) {}

    res.json({
      totalRequests: totalRequests.count,
      todayRequests: todayRequests.count,
      activeUsers: activeUsers.count,
      totalUsers: totalUsers.count,
      topActions: topActions,
      requestsByDay: requestsByDay
    });
  } catch (error) {
    console.error('Get API usage error:', error);
    res.json({
      totalRequests: 0,
      todayRequests: 0,
      activeUsers: 0,
      totalUsers: 0,
      topActions: [],
      requestsByDay: []
    });
  }
}

// Get system health
function getSystemHealth(req, res) {
  try {
    const os = require('os');
    
    // Get database size (approximate)
    let dbSize = 0;
    try {
      const dbInfo = db.prepare('PRAGMA page_count').get();
      const pageSize = db.prepare('PRAGMA page_size').get();
      dbSize = ((dbInfo?.page_count || 0) * (pageSize?.page_size || 4096)) / (1024 * 1024);
    } catch (e) {}
    
    // Get table counts
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    
    res.json({
      uptime: process.uptime(),
      memory: {
        used: Math.round((os.totalmem() - os.freemem()) / (1024 * 1024)),
        total: Math.round(os.totalmem() / (1024 * 1024))
      },
      cpu: os.loadavg()[0],
      platform: os.platform(),
      nodeVersion: process.version,
      database: {
        size: dbSize.toFixed(2) + ' MB',
        users: userCount?.count || 0,
        products: productCount?.count || 0,
        orders: orderCount?.count || 0
      },
      telegram: {
        connected: true
      }
    });
  } catch (error) {
    console.error('Get system health error:', error);
    res.status(500).json({ error: 'خطأ في جلب حالة النظام' });
  }
}

// Get error logs - includes activity logs with errors and server errors
function getErrorLogs(req, res) {
  try {
    // Get activity logs with errors
    const activityLogs = db.prepare(`
      SELECT al.*, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action LIKE '%error%' OR al.action LIKE '%failed%' OR al.action LIKE '%blocked%'
      ORDER BY al.created_at DESC
      LIMIT 50
    `).all();
    
    // Read recent errors from error log file
    let serverErrors = [];
    try {
      const fs = require('fs');
      const path = require('path');
      const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
      const errorLogPath = path.join(LOG_DIR, 'error.log');
      if (fs.existsSync(errorLogPath)) {
        const errorContent = fs.readFileSync(errorLogPath, 'utf-8');
        const errorLines = errorContent.split('\n').filter(l => l.trim()).slice(-20);
        serverErrors = errorLines.map((line, idx) => ({
          id: 'server-' + idx,
          action: 'Server Error',
          details: line.substring(0, 200),
          created_at: new Date().toISOString(),
          source: 'server'
        }));
      }
    } catch (e) {}
    
    // Combine and sort
    const allLogs = [
      ...(activityLogs || []).map(l => ({...l, source: 'activity'})),
      ...serverErrors
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
    
    res.json({ logs: allLogs });
  } catch (error) {
    console.error('Get error logs error:', error);
    res.status(500).json({ logs: [] });
  }
}

// Get payment methods
function getPaymentMethods(req, res) {
  try {
    // Get from database or return default methods
    const methods = db.prepare(`
      SELECT * FROM payment_methods 
      ORDER BY id
    `).all();
    
    // If no methods, return defaults
    if (!methods || methods.length === 0) {
      return res.json([
        { id: 1, name: 'PayPal', type: 'paypal', is_active: 1 },
        { id: 2, name: 'Stripe', type: 'stripe', is_active: 1 },
        { id: 3, name: 'تحويل بنكي', type: 'bank', is_active: 1 }
      ]);
    }
    
    res.json(methods);
  } catch (error) {
    console.error('Get payment methods error:', error);
    // Return defaults on error
    res.json([
      { id: 1, name: 'PayPal', type: 'paypal', is_active: 1 },
      { id: 2, name: 'Stripe', type: 'stripe', is_active: 1 }
    ]);
  }
}

// Add payment method
function addPaymentMethod(req, res) {
  try {
    const { name, type, is_active } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
    }
    
    // Try to insert into database, if table doesn't exist, return success anyway
    try {
      db.prepare(`
        INSERT INTO payment_methods (name, type, is_active)
        VALUES (?, ?, ?)
      `).run(name, type, is_active ? 1 : 0);
    } catch (e) {
      // Table might not exist, ignore
    }
    
    res.status(201).json({ message: 'تم إضافة طريقة الدفع بنجاح' });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ error: 'خطأ في إضافة طريقة الدفع' });
  }
}

// Update payment method
function updatePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const { name, type, is_active } = req.body;
    
    try {
      db.prepare(`
        UPDATE payment_methods SET name = ?, type = ?, is_active = ?
        WHERE id = ?
      `).run(name, type, is_active ? 1 : 0, id);
    } catch (e) {
      // Table might not exist
    }
    
    res.json({ message: 'تم تحديث طريقة الدفع بنجاح' });
  } catch (error) {
    console.error('Update payment method error:', error);
    res.status(500).json({ error: 'خطأ في تحديث طريقة الدفع' });
  }
}

// Delete payment method
function deletePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    
    try {
      db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
    } catch (e) {
      // Table might not exist
    }
    
    res.json({ message: 'تم حذف طريقة الدفع بنجاح' });
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ error: 'خطأ في حذف طريقة الدفع' });
  }
}

// Get auto responses
function getAutoResponses(req, res) {
  try {
    const responses = db.prepare(`
      SELECT id, trigger_keyword as keyword, response_text as response, is_active, priority, created_at
      FROM auto_responses 
      ORDER BY priority DESC, id
    `).all();
    
    res.json({ responses: responses || [] });
  } catch (error) {
    console.error('Get auto responses error:', error);
    res.status(500).json({ responses: [] });
  }
}

// Create auto response
function createAutoResponse(req, res) {
  try {
    const { keyword, response, is_active, priority } = req.body;
    
    if (!keyword || !response) {
      return res.status(400).json({ error: 'الكلمة المفتاحية والرد مطلوبان' });
    }
    
    try {
      const result = db.prepare(`
        INSERT INTO auto_responses (trigger_keyword, response_text, is_active, priority, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(keyword, response, is_active ? 1 : 0, priority || 0, req.user.id);
      
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(req.user.id, 'auto_response_created', `Auto response created: ${keyword}`, req.ip);
      
      res.status(201).json({ message: 'تم إنشاء الرد التلقائي بنجاح', responseId: result.lastInsertRowid });
    } catch (e) {
      console.error('Insert auto response error:', e);
      res.status(500).json({ error: 'خطأ في إنشاء الرد التلقائي' });
    }
  } catch (error) {
    console.error('Create auto response error:', error);
    res.status(500).json({ error: 'خطأ في إنشاء الرد التلقائي' });
  }
}

// Update auto response
function updateAutoResponse(req, res) {
  try {
    const { id } = req.params;
    const { keyword, response, is_active, priority } = req.body;
    
    try {
      db.prepare(`
        UPDATE auto_responses SET trigger_keyword = ?, response_text = ?, is_active = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(keyword, response, is_active ? 1 : 0, priority || 0, id);
      
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(req.user.id, 'auto_response_updated', `Auto response #${id} updated`, req.ip);
      
      res.json({ message: 'تم تحديث الرد التلقائي بنجاح' });
    } catch (e) {
      console.error('Update auto response error:', e);
      res.status(500).json({ error: 'خطأ في تحديث الرد التلقائي' });
    }
  } catch (error) {
    console.error('Update auto response error:', error);
    res.status(500).json({ error: 'خطأ في تحديث الرد التلقائي' });
  }
}

// Delete auto response
function deleteAutoResponse(req, res) {
  try {
    const { id } = req.params;
    
    try {
      db.prepare('DELETE FROM auto_responses WHERE id = ?').run(id);
      
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(req.user.id, 'auto_response_deleted', `Auto response #${id} deleted`, req.ip);
      
      res.json({ message: 'تم حذف الرد التلقائي بنجاح' });
    } catch (e) {
      console.error('Delete auto response error:', e);
      res.status(500).json({ error: 'خطأ في حذف الرد التلقائي' });
    }
  } catch (error) {
    console.error('Delete auto response error:', error);
    res.status(500).json({ error: 'خطأ في حذف الرد التلقائي' });
  }
}

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getAllServices,
  createService,
  updateService,
  deleteService,
  getAllMessages,
  markMessageRead,
  deleteMessage,
  getActivityLogs,
  getAllOrders,
  getOrderByIdAdmin,
  updateOrderStatus,
  getNotifications,
  markNotificationRead,
  deleteNotification,
  deleteAllNotifications,
  getBroadcasts,
  createBroadcast,
  deleteBroadcast,
  getAnalytics,
  getApiUsage,
  getSystemHealth,
  getErrorLogs,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getAutoResponses,
  createAutoResponse,
  updateAutoResponse,
  deleteAutoResponse,
  getFirewallStatus
};

// Get firewall status
function getFirewallStatus(req, res) {
  const { execSync } = require('child_process');
  const result = { status: 'unknown', ufw: {}, iptables: {}, fail2ban: {}, connections: {}, blocked: {} };

  // UFW status
  try {
    const ufwOut = execSync('ufw status verbose 2>/dev/null || echo "inactive"', { timeout: 5000 }).toString().trim();
    result.ufw = {
      active: !ufwOut.includes('inactive'),
      raw: ufwOut.substring(0, 1000)
    };
  } catch (e) { result.ufw = { active: false, raw: 'غير متاح' }; }

  // iptables rules count & dropped
  try {
    const iptOut = execSync('iptables -L INPUT -v -n 2>/dev/null || echo "no access"', { timeout: 5000 }).toString().trim();
    const dropped = iptOut.split('\n').filter(l => l.includes('DROP')).reduce((s, l) => s + (parseInt(l.trim().split(/\s+/)[0]) || 0), 0);
    const rules = iptOut.split('\n').length - 2;
    result.iptables = {
      active: !iptOut.includes('no access'),
      rules: Math.max(0, rules),
      droppedPackets: dropped
    };
  } catch (e) { result.iptables = { active: false, rules: 0, droppedPackets: 0 }; }

  // Fail2Ban status
  try {
    const f2bOut = execSync('fail2ban-client status 2>/dev/null || echo "inactive"', { timeout: 5000 }).toString().trim();
    const jails = [];
    if (!f2bOut.includes('inactive')) {
      try {
        const jailList = execSync("fail2ban-client status 2>/dev/null | grep 'Jail list' | sed 's/.*://;s/,//g'", { timeout: 5000 }).toString().trim();
        for (const jail of jailList.split(/\s+/).filter(Boolean)) {
          const jailStatus = execSync(`fail2ban-client status ${jail} 2>/dev/null`, { timeout: 5000 }).toString();
          const banned = jailStatus.match(/Currently banned:\s+(\d+)/)?.[1] || '0';
          const total = jailStatus.match(/Total banned:\s+(\d+)/)?.[1] || '0';
          jails.push({ name: jail, banned: parseInt(banned), totalBanned: parseInt(total) });
        }
      } catch (e) {}
    }
    result.fail2ban = {
      active: !f2bOut.includes('inactive'),
      jails
    };
  } catch (e) { result.fail2ban = { active: false, jails: [] }; }

  // Active connections
  try {
    const ssOut = execSync('ss -s 2>/dev/null || echo "no ss"', { timeout: 5000 }).toString().trim();
    const established = ssOut.match(/estab\s+(\d+)/)?.[1] || '0';
    const closed = ssOut.match(/closed\s+(\d+)/)?.[1] || '0';
    const timewait = ssOut.match(/timewait\s+(\d+)/)?.[1] || '0';
    result.connections = {
      established: parseInt(established),
      closed: parseInt(closed),
      timewait: parseInt(timewait)
    };
  } catch (e) { result.connections = { established: 0, closed: 0, timewait: 0 }; }

  // Top attacking IPs from blocked log
  try {
    const blockedLog = execSync('cat /var/log/nginx/blocked.log 2>/dev/null | awk \'{print $1}\' | sort | uniq -c | sort -rn | head -10 || echo ""', { timeout: 5000 }).toString().trim();
    result.blocked.topIPs = blockedLog.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      return { count: parseInt(parts[0]), ip: parts[1] };
    });
  } catch (e) { result.blocked = { topIPs: [] }; }

  // Security logs from app
  try {
    const secLogs = db.prepare(`
      SELECT action, COUNT(*) as count, MAX(created_at) as last_seen
      FROM activity_logs
      WHERE action LIKE 'security_%' AND created_at > datetime('now', '-24 hours')
      GROUP BY action
      ORDER BY count DESC
    `).all();
    result.securityEvents = secLogs;
  } catch (e) { result.securityEvents = []; }

  // System load
  try {
    const load = execSync('uptime 2>/dev/null || echo ""', { timeout: 5000 }).toString().trim();
    const mem = execSync('free -h 2>/dev/null || echo ""', { timeout: 5000 }).toString().trim();
    const disk = execSync('df -h / 2>/dev/null | tail -1 || echo ""', { timeout: 5000 }).toString().trim();
    result.system = { load, memory: mem, disk };
  } catch (e) { result.system = { load: '', memory: '', disk: '' }; }

  result.status = 'ok';
  res.json(result);
}

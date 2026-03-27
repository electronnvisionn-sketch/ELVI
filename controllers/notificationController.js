/**
 * ELECTRON VISION - Notifications Controller
 * Real-time notifications system
 */

const db = require('../database');
const { getClientIP } = require('../middleware/auth');
const { sendEmail } = require('../middleware/email');

// Send push notification to a single user
async function sendPushToUser(userId, title, body) {
  try {
    const webpush = require('web-push');
    const vapidKeys = require('../vapid-keys.json');
    
    const subscription = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').get(userId);
    if (!subscription) return;
    
    webpush.setVapidDetails(
      'mailto:admin@electronvision.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    
    const pushSubscription = {
      endpoint: JSON.parse(subscription.endpoint),
      keys: JSON.parse(subscription.keys)
    };
    
    await webpush.sendNotification(pushSubscription, JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: 'notification',
      data: { url: '/' }
    }));
    
    console.log('[Push] Sent to user', userId);
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
      console.log('[Push] Removed invalid subscription for user', userId);
    } else {
      console.error('[Push] Error:', e.message);
    }
  }
}

// Create a notification
function createNotification(userId, type, title, message, link = null) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, type, title, message, link);
    
    // Also notify admin for important notifications (but not if userId is already admin)
    if (type !== 'system') {
      const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
      if (admin && admin.id !== userId) {
        // Check if this is a duplicate notification for admin
        const existingNotif = db.prepare(`
          SELECT id FROM notifications 
          WHERE user_id = ? AND title = ? AND message = ? AND created_at > datetime('now', '-10 seconds')
        `).get(admin.id, title, message);
        
        if (!existingNotif) {
          db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, link)
            VALUES (?, ?, ?, ?, ?)
          `).run(admin.id, type, title, message, link);
        }
      }
    }

    // Send push notification to the user
    sendPushToUser(userId, title, message);
    
    // Emit real-time notification via socket if available
    if (global.io) {
      const { emitNotification } = require('../middleware/socket');
      emitNotification(global.io, userId, { title, message, type, link });
    }
    
    return true;
  } catch (error) {
    console.error('Create notification error:', error);
    return false;
  }
}

// Get user's notifications
function getNotifications(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const userRole = req.user ? req.user.role : null;
    
    console.log('[Notifications] Request - user:', req.user, 'cookies:', req.cookies ? 'yes' : 'no', 'token cookie:', req.cookies?.token ? 'yes' : 'no');
    
    if (!userId) {
      console.log('[Notifications] No user ID, returning 401');
      return res.status(401).json({ error: 'Unauthorized', requireLogin: true });
    }
    
    console.log('[Notifications] Fetching for user:', userId, 'role:', userRole);
    
    let notifications;
    if (userRole === 'admin') {
      // Admin sees all notifications
      notifications = db.prepare(`
        SELECT * FROM notifications
        ORDER BY created_at DESC
        LIMIT 50
      `).all();
    } else {
      // Regular users see their notifications
      notifications = db.prepare(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(userId);
    }
    
    const unreadResult = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId);
    
    const unreadCount = unreadResult ? unreadResult.count : 0;
    console.log('[Notifications] Found:', notifications?.length || 0, 'unread:', unreadCount);
    
    res.json({
      notifications: notifications || [],
      unreadCount: unreadCount
    });
  } catch (error) {
    console.error('[Notifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

// Mark notification as read
function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    if (userRole === 'admin') {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

// Mark all as read
function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    if (userRole === 'admin') {
      db.prepare('UPDATE notifications SET is_read = 1').run();
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
}

// Delete notification
function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};

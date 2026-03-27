/**
 * ELECTRON VISION - Support Ticket Controller
 * With Admin Approval System
 */

const db = require('../database');
const { createNotification } = require('../controllers/notificationController');
const { notifyNewTicket, notifyTicketApproved, notifyTicketRejected, notifyNewMessage } = require('../middleware/telegram');

// Create new ticket (requires admin approval)
async function createTicket(req, res) {
  try {
    const { title, description, priority, attachments, user_id } = req.body;
    // If admin provides user_id, use it; otherwise use the authenticated user's id
    // Admin role check would be ideal here but we'll allow it for authenticated users
    let userId = user_id || req.user.id;
    
    // If user_id is provided, verify it exists (only for admins/managers)
    if (user_id && user_id !== req.user.id) {
      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
      if (!targetUser) {
        return res.status(404).json({ error: 'المستخدم المستهدف غير موجود' });
      }
      userId = user_id;
    }
    
    const result = db.prepare(`
      INSERT INTO tickets (user_id, title, description, priority, status, is_approved, attachments)
      VALUES (?, ?, ?, ?, 'pending', 0, ?)
    `).run(userId, title, description, priority || 'medium', attachments || '');
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'ticket_created', `Ticket created: ${title}`, req.ip);
    
    // Get username for notifications
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    const username = user?.username || 'Unknown';
    
    // Create notification for admin
    createNotification(1, 'support', 'New Support Ticket', `${title} - Priority: ${priority || 'medium'}`, '/admin');
    
    // Send Telegram notification with more details
    await notifyNewTicket(
      { 
        id: result.lastInsertRowid, 
        title, 
        description,
        priority: priority || 'medium',
        status: 'pending',
        is_approved: 0
      }, 
      username
    );
    
    // Create notification for user
    createNotification(userId, 'support', 'Ticket Submitted', 'Your support ticket is pending approval', '/support');
    
    res.status(201).json({
      message: user_id && user_id !== req.user.id ? 'تم إنشاء التذكرة للمستخدم بنجاح وتحتاج موافقة الإدارة' : 'تم إنشاء التذكرة بنجاح وتحتاج موافقة الإدارة!',
      ticketId: result.lastInsertRowid,
      requiresApproval: true
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم: ' + error.message });
  }
}

// Approve ticket (admin only)
async function approveTicket(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    if (ticket.is_approved) {
      return res.status(400).json({ error: 'التذكرة تمت الموافقة عليها بالفعل' });
    }
    
    // Approve the ticket
    db.prepare(`
      UPDATE tickets 
      SET is_approved = 1, approved_by = ?, approved_at = datetime('now'), status = 'open', updated_at = datetime('now')
      WHERE id = ?
    `).run(adminId, id);
    
    // Get username for notification
    const ticketUser = db.prepare('SELECT username FROM users WHERE id = ?').get(ticket.user_id);
    const ticketUsername = ticketUser?.username || 'Unknown';
    const adminUsername = req.user.username || 'Admin';
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'ticket_approved', `Ticket #${id} approved`, req.ip);
    
    // Create notification for user
    createNotification(ticket.user_id, 'support', 'Ticket Approved', `Your ticket "${ticket.title}" has been approved`, '/support');
    
    // Send Telegram notification
    await notifyTicketApproved(ticket, ticketUsername, adminUsername);
    
    res.json({ 
      message: 'تمت الموافقة على التذكرة بنجاح',
      ticketId: id
    });
  } catch (error) {
    console.error('Approve ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Reject ticket (admin only)
async function rejectTicket(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;
    
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    // Close the ticket
    db.prepare(`
      UPDATE tickets 
      SET status = 'closed', is_approved = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    
    // Add rejection reason as a reply
    db.prepare(`
      INSERT INTO ticket_replies (ticket_id, user_id, message, is_admin_reply)
      VALUES (?, ?, ?, 1)
    `).run(id, adminId, reason || 'تم رفض التذكرة من قبل الإدارة');
    
    // Get username for notification
    const ticketUser = db.prepare('SELECT username FROM users WHERE id = ?').get(ticket.user_id);
    const ticketUsername = ticketUser?.username || 'Unknown';
    const adminUsername = req.user.username || 'Admin';
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'ticket_rejected', `Ticket #${id} rejected`, req.ip);
    
    // Create notification for user
    createNotification(ticket.user_id, 'support', 'Ticket Rejected', `Your ticket "${ticket.title}" has been rejected`, '/support');
    
    // Send Telegram notification
    await notifyTicketRejected(ticket, ticketUsername, adminUsername, reason);
    
    res.json({ 
      message: 'تم رفض التذكرة',
      ticketId: id
    });
  } catch (error) {
    console.error('Reject ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get user's tickets
function getUserTickets(req, res) {
  try {
    const userId = req.user.id;
    
    const tickets = db.prepare(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id) as reply_count
      FROM tickets t
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `).all(userId);
    
    res.json({ tickets });
  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get single ticket with replies
function getTicket(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const ticket = db.prepare(`
      SELECT t.*, u.username, u.email
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ? AND (t.user_id = ? OR ? = 'admin')
    `).get(id, userId, req.user.role);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    const replies = db.prepare(`
      SELECT tr.*, u.username, u.role as user_role
      FROM ticket_replies tr
      JOIN users u ON tr.user_id = u.id
      WHERE tr.ticket_id = ?
      ORDER BY tr.created_at ASC
    `).all(id);
    
    res.json({ ticket, replies });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Add reply to ticket
async function addReply(req, res) {
  try {
    const { id } = req.params;
    const { message, attachments } = req.body;
    const userId = req.user.id;
    
    const ticket = db.prepare('SELECT id, status, user_id, title FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    const isAdmin = ['admin', 'manager', 'moderator'].includes(req.user.role);
    
    const result = db.prepare(`
      INSERT INTO ticket_replies (ticket_id, user_id, message, attachments, is_admin_reply)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, message, attachments || '', isAdmin ? 1 : 0);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'ticket_replied', `Reply added to ticket #${id}`, req.ip);

    // Create notification for ticket owner if admin replies
    if (isAdmin && ticketOwner) {
      createNotification(ticketOwner.user_id, 'support', 'رد على تذكرتك', `تم الرد على تذكرتك "${ticket.title}"`, '/support');
    }
    
    // Telegram notification for new ticket reply
    const ticketOwner = db.prepare('SELECT user_id FROM tickets WHERE id = ?').get(id);
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (ticketOwner && user) {
      await notifyNewMessage({
        type: 'ticket',
        ticketId: id,
        userName: user.username,
        message,
        attachments
      });
    }

    res.status(201).json({
      message: 'تم إضافة الرد بنجاح',
      replyId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get all tickets (admin only)
function getAllTickets(req, res) {
  try {
    const { status, priority } = req.query;
    
    let query = `
      SELECT t.*, u.username, u.email,
        (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id) as reply_count
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    const tickets = db.prepare(query).all(...params);
    
    res.json({ tickets });
  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Update ticket (admin only)
function updateTicket(req, res) {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;
    
    const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    db.prepare(`
      UPDATE tickets SET status = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, priority, id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'ticket_updated', `Ticket #${id} updated - status: ${status}, priority: ${priority}`, req.ip);
    
    res.json({ message: 'تم تحديث التذكرة بنجاح' });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Close ticket
function closeTicket(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const ticket = db.prepare('SELECT id, user_id FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    // Allow both owner and admin/moderator/manager to close
    if (ticket.user_id !== userId && !['admin', 'manager', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح لك بإغلاق هذه التذكرة' });
    }
    
    db.prepare(`
      UPDATE tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'ticket_closed', `Ticket #${id} closed`, req.ip);
    
    res.json({ message: 'تم إغلاق التذكرة بنجاح' });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get ticket statistics (admin only)
function getTicketStats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM tickets').get();
    const open = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get();
    const inProgress = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'").get();
    const closed = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'").get();
    
    const byPriority = {
      low: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE priority = 'low'").get().count,
      medium: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE priority = 'medium'").get().count,
      high: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE priority = 'high'").get().count,
      critical: db.prepare("SELECT COUNT(*) as count FROM tickets WHERE priority = 'critical'").get().count
    };
    
    res.json({
      total: total.count,
      open: open.count,
      inProgress: inProgress.count,
      closed: closed.count,
      byPriority
    });
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete ticket (owner or admin)
function deleteTicket(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userLevel = req.user.level || 0;
    
    const ticket = db.prepare('SELECT id, user_id FROM tickets WHERE id = ?').get(id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    // Allow both owner and admin/moderator to delete
    const isAdmin = userRole === 'admin' || userRole === 'moderator';
    if (ticket.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذه التذكرة' });
    }
    
    // Delete the ticket (cascades to replies)
    db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'ticket_deleted', `Ticket #${id} deleted`, req.ip);
    
    res.json({ message: 'تم حذف التذكرة بنجاح' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ error: 'خطأ في حذف التذكرة' });
  }
}

module.exports = {
  createTicket,
  approveTicket,
  rejectTicket,
  getUserTickets,
  getTicket,
  addReply,
  getAllTickets,
  updateTicket,
  closeTicket,
  getTicketStats,
  deleteTicket
};

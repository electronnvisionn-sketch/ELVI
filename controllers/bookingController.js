/**
 * ELECTRON VISION - Sessions Booking Controller
 * Professional booking system with real-time updates
 */

const db = require('../database');
const { getClientIP } = require('../middleware/auth');
const { sendEmail } = require('../middleware/email');
const { createNotification } = require('./notificationController');
let emitSessionStatusChange;
try {
  ({ emitSessionStatusChange } = require('../middleware/socket'));
} catch (e) {
  console.log('[Booking] Socket module not available');
}

// Session types available
const SESSION_TYPES = [
  { id: 'consultation', name: 'استشارة فنية', name_en: 'Technical Consultation', duration: 30 },
  { id: 'development', name: 'تطوير برمجيات', name_en: 'Software Development', duration: 60 },
  { id: 'support', name: 'دعم فني', name_en: 'Technical Support', duration: 30 },
  { id: 'training', name: 'تدريب', name_en: 'Training', duration: 60 },
  { id: 'meeting', name: 'اجتماع', name_en: 'Meeting', duration: 30 },
  { id: 'custom', name: 'جلسة مخصصة', name_en: 'Custom Session', duration: 60 }
];

// Create new session booking
async function createSession(req, res) {
  try {
    const { 
      session_type, 
      session_title, 
      session_description,
      preferred_date, 
      preferred_time, 
      duration,
      guest_name,
      guest_email,
      guest_phone
    } = req.body;

    // Validation
    if (!session_type || !preferred_date || !preferred_time) {
      return res.status(400).json({ 
        error: 'جميع الحقول مطلوبة: نوع الجلسة، التاريخ، الوقت' 
      });
    }

    const userId = req.user ? req.user.id : null;
    const isGuest = !userId;

    if (isGuest && (!guest_name || !guest_email)) {
      return res.status(400).json({ 
        error: 'الاسم والبريد الإلكتروني مطلوبان للحجز كضيف' 
      });
    }

    // Get session type info
    const sessionTypeInfo = SESSION_TYPES.find(s => s.id === session_type) || SESSION_TYPES[5];
    const sessionDuration = duration || sessionTypeInfo.duration;
    const sessionPrice = sessionTypeInfo.price;

    // Create session record
    const result = db.prepare(`
      INSERT INTO sessions (user_id, guest_name, guest_email, guest_phone, session_type, session_title, session_description, preferred_date, preferred_time, duration, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      userId, 
      guest_name || null, 
      guest_email || null, 
      guest_phone || null,
      session_type,
      session_title || sessionTypeInfo.name,
      session_description || '',
      preferred_date, 
      preferred_time, 
      sessionDuration,
      sessionPrice
    );

    const sessionId = result.lastInsertRowid;

    // Log activity
    const userIdentifier = userId ? `User #${userId}` : (guest_email || 'Guest');
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'session_created', `Session booked: ${sessionTypeInfo.name}`, getClientIP(req));

    // Create notification for admin
    createNotification(1, 'booking', 'حجز جلسة جديد', 
      `حجز ${sessionTypeInfo.name} - ${isGuest ? guest_name : 'مستخدم مسجل'}`, 
      '/admin?sessions'
    );

    // Send confirmation email
    if (guest_email || (req.user && req.user.email)) {
      const email = guest_email || req.user.email;
      const name = guest_name || (req.user ? req.user.username : 'عميل');
      
      try {
        await sendEmail(email, 'تأكيد حجز جلسة - ELECTRON VISION', `
          <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px;">
            <h2 style="color: #00ff88;">✅ تم استلام حجزك بنجاح!</h2>
            <p>مرحباً <strong>${name}</strong>،</p>
            <p>لقد استلمنا حجزك للجلسة التالية:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>نوع الجلسة:</strong> ${sessionTypeInfo.name}</p>
              <p><strong>التاريخ:</strong> ${preferred_date}</p>
              <p><strong>الوقت:</strong> ${preferred_time}</p>
              <p><strong>المدة:</strong> ${sessionDuration} دقيقة</p>
              ${sessionPrice > 0 ? `<p><strong>السعر:</strong> ${sessionPrice} دولار</p>` : ''}
            </div>
            <p>سيتم التواصل معك قريباً لتأكيد الموعد.</p>
            <p>شكراً لثقتكم بنا!</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              ELECTRON VISION - حلول برمجية متقدمة<br>
              www.electronvision.com
            </p>
          </div>
        `);
      } catch (emailError) {
        // Email notification skipped silently
      }
    }

    // Emit Socket.io event
    if (global.io) {
      const { emitNewSession } = require('../middleware/socket');
      emitNewSession(global.io, {
        id: sessionId,
        session_type: sessionTypeInfo.name,
        guest_name: guest_name,
        username: req.user ? req.user.username : null,
        preferred_date,
        preferred_time,
        status: 'pending'
      });
    }

    res.status(201).json({
      message: 'تم حجز جلستك بنجاح! سنقوم بتأكيد الموعد قريباً',
      sessionId: sessionId,
      status: 'pending',
      session: {
        type: sessionTypeInfo,
        date: preferred_date,
        time: preferred_time,
        duration: sessionDuration,
        price: sessionPrice
      }
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'فشل في حجز الجلسة: ' + error.message });
  }
}

// Get user's sessions
async function getUserSessions(req, res) {
  try {
    const userId = req.user.id;

    const sessions = db.prepare(`
      SELECT s.* FROM sessions s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);

    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'خطأ في جلب الجلسات' });
  }
}

// Get single session
async function getSession(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    let session;
    if (userRole === 'admin') {
      session = db.prepare(`
        SELECT s.*, u.username, u.email
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
      `).get(id);
    } else {
      session = db.prepare(`
        SELECT s.*, u.username, u.email
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = ? AND (s.user_id = ? OR s.guest_email = ?)
      `).get(id, userId, req.user.email);
    }

    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    // Get chat room if exists
    const chatRoom = db.prepare('SELECT * FROM chat_rooms WHERE session_id = ?').get(id);

    res.json({ session, chatRoom });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'خطأ في جلب الجلسة' });
  }
}

// Get all sessions (admin)
async function getAllSessions(req, res) {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT s.*, u.username, u.email
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }

    query += ' ORDER BY s.created_at DESC';

    const sessions = db.prepare(query).all(...params);

    res.json({ sessions });
  } catch (error) {
    console.error('Get all sessions error:', error);
    res.status(500).json({ error: 'خطأ في جلب الجلسات' });
  }
}

// Get session statistics (admin)
async function getSessionStats(req, res) {
  try {
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
      pending: db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'pending'").get().count,
      confirmed: db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'confirmed'").get().count,
      completed: db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'completed'").get().count,
      cancelled: db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'cancelled'").get().count,
      rejected: db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'rejected'").get().count
    };

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
  }
}

// Confirm session (admin)
async function confirmSession(req, res) {
  try {
    const { id } = req.params;
    const { admin_notes, meeting_link } = req.body;
    const adminId = req.user.id;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'الجلسة تم تأكيدها بالفعل أو إلغاؤها' });
    }

    // Create chat room for the session
    const roomResult = db.prepare(`
      INSERT INTO chat_rooms (session_id, name, room_type)
      VALUES (?, ?, 'session')
    `).run(id, `Session #${id} - ${session.session_type}`);
    
    const roomId = roomResult.lastInsertRowid;
    
    // Update session with room_id
    db.prepare(`
      UPDATE sessions 
      SET status = 'confirmed', admin_notes = ?, meeting_link = ?, chat_room_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(admin_notes || '', meeting_link || '', roomId, id);

    // Add participants (use INSERT OR IGNORE to handle duplicates)
    if (session.user_id) {
      db.prepare(`
        INSERT OR IGNORE INTO chat_participants (room_id, user_id, role)
        VALUES (?, ?, 'member')
      `).run(roomId, session.user_id);
    }

    db.prepare(`
      INSERT OR IGNORE INTO chat_participants (room_id, user_id, role)
      VALUES (?, ?, 'admin')
    `).run(roomId, adminId);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'session_confirmed', `Session #${id} confirmed`, getClientIP(req));

    // Notify user
    if (session.user_id) {
      createNotification(session.user_id, 'booking', 'تم تأكيد جلستك!', 
        `تم تأكيد جلستك بتاريخ ${session.preferred_date}`, '/sessions');
    }

    // Send confirmation email
    const email = session.guest_email || (session.user_id ? 
      db.prepare('SELECT email FROM users WHERE id = ?').get(session.user_id)?.email : null);
    
    if (email) {
      const name = session.guest_name || 'عميل';
      try {
        await sendEmail(email, 'تأكيد جلسة - ELECTRON VISION', `
          <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px;">
            <h2 style="color: #00ff88;">✅ تم تأكيد جلستك!</h2>
            <p>مرحباً <strong>${name}</strong>،</p>
            <p>تم تأكيد جلستك بالموعد التالي:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>التاريخ:</strong> ${session.preferred_date}</p>
              <p><strong>الوقت:</strong> ${session.preferred_time}</p>
              <p><strong>المدة:</strong> ${session.duration} دقيقة</p>
              ${meeting_link ? `<p><strong>رابط الاجتماع:</strong> <a href="${meeting_link}">${meeting_link}</a></p>` : ''}
              ${admin_notes ? `<p><strong>ملاحظات:</strong> ${admin_notes}</p>` : ''}
            </div>
            <p>نراك في الجلسة!</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              ELECTRON VISION - حلول برمجية متقدمة
            </p>
          </div>
        `);
      } catch (e) {}
    }

    // Socket.io notification
    if (global.io && session.user_id && emitSessionStatusChange) {
      try {
        emitSessionStatusChange(global.io, session.user_id, {
          ...session,
          status: 'confirmed',
          meeting_link,
          roomId
        });
      } catch (e) {
        console.error('[Booking] Socket emission error:', e);
      }
    }

    res.json({ 
      message: 'تم تأكيد الجلسة بنجاح',
      roomId: roomId,
      status: 'confirmed'
    });
  } catch (error) {
    console.error('Confirm session error:', error);
    res.status(500).json({ error: 'فشل في تأكيد الجلسة: ' + error.message });
  }
}

// Reject session (admin)
async function rejectSession(req, res) {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.user.id;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    // Update session
    db.prepare(`
      UPDATE sessions 
      SET status = 'rejected', admin_notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(admin_notes || 'تم رفض الجلسة من قبل الإدارة', id);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'session_rejected', `Session #${id} rejected`, getClientIP(req));

    // Notify user
    if (session.user_id) {
      createNotification(session.user_id, 'booking', 'تم رفض جلستك', 
        `تم رفض جلستك بتاريخ ${session.preferred_date}`, '/sessions');
    }

    // Send email
    const email = session.guest_email || (session.user_id ? 
      db.prepare('SELECT email FROM users WHERE id = ?').get(session.user_id)?.email : null);
    
    if (email) {
      const name = session.guest_name || 'عميل';
      try {
        await sendEmail(email, 'إلغاء جلسة - ELECTRON VISION', `
          <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px;">
            <h2 style="color: #ff4444;">❌ تم إلغاء جلستك</h2>
            <p>مرحباً <strong>${name}</strong>،</p>
            <p>نأسف لإبلاغك أنه تم إلغاء جلستك.</p>
            ${admin_notes ? `<p><strong>السبب:</strong> ${admin_notes}</p>` : ''}
            <p>لمعرفة المزيد، يرجى التواصل معنا.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              ELECTRON VISION - حلول برمجية متقدمة
            </p>
          </div>
        `);
      } catch (e) {}
    }

    // Socket.io
    if (global.io && session.user_id) {
      const { emitSessionStatusChange } = require('../middleware/socket');
      emitSessionStatusChange(global.io, session.user_id, {
        ...session,
        status: 'rejected',
        admin_notes
      });
    }

    res.json({ message: 'تم رفض الجلسة' });
  } catch (error) {
    console.error('Reject session error:', error);
    res.status(500).json({ error: 'فشل في رفض الجلسة' });
  }
}

// Complete session (admin)
async function completeSession(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    db.prepare(`
      UPDATE sessions 
      SET status = 'completed', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'session_completed', `Session #${id} completed`, getClientIP(req));

    res.json({ message: 'تمت الجلسة بنجاح' });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'فشل في إكمال الجلسة' });
  }
}

// Cancel session (user)
async function cancelSession(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'لا يمكن إلغاء جلسة مؤكدة أو مكتملة' });
    }

    db.prepare(`
      UPDATE sessions 
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    res.json({ message: 'تم إلغاء الجلسة بنجاح' });
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ error: 'فشل في إلغاء الجلسة' });
  }
}

// Get session types
function getSessionTypes(req, res) {
  const lang = req.query.lang || 'ar';
  const types = SESSION_TYPES.map(t => ({
    id: t.id,
    name: lang === 'ar' ? t.name : t.name_en,
    duration: t.duration,
    price: t.price
  }));
  res.json({ types });
}

// ==================== CHAT ROOM FUNCTIONS ====================

// Get user's chat rooms
async function getUserRooms(req, res) {
  try {
    const userId = req.user.id;

    const rooms = db.prepare(`
      SELECT cr.*, 
        s.session_type, s.session_title, s.preferred_date, s.preferred_time, s.status as session_status,
        (SELECT COUNT(*) FROM chat_messages WHERE room_id = cr.id) as message_count,
        (SELECT COUNT(*) FROM chat_messages WHERE room_id = cr.id AND is_read = 0 AND user_id != ?) as unread_count
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      LEFT JOIN sessions s ON cr.session_id = s.id
      WHERE cp.user_id = ? AND cr.is_active = 1
      ORDER BY cr.created_at DESC
    `).all(userId, userId);

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'خطأ في جلب الغرف' });
  }
}

// Get room messages
async function getRoomMessages(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user is participant
    const participant = db.prepare(`
      SELECT * FROM chat_participants WHERE room_id = ? AND user_id = ?
    `).get(id, userId);

    if (!participant) {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه الغرفة' });
    }

    const messages = db.prepare(`
      SELECT cm.*, u.username, u.role as user_role
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at ASC
    `).all(id);

    // Mark messages as read
    db.prepare(`
      UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND user_id != ?
    `).run(id, userId);

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'خطأ في جلب الرسائل' });
  }
}

// Send message
async function sendMessage(req, res) {
  try {
    const { id } = req.params;
    const { message, attachments } = req.body;
    const userId = req.user.id;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }

    // Check if user is participant
    const participant = db.prepare(`
      SELECT * FROM chat_participants WHERE room_id = ? AND user_id = ?
    `).get(id, userId);

    if (!participant) {
      return res.status(403).json({ error: 'غير مصرح لك بإرسال رسائل لهذه الغرفة' });
    }

    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);

    // Insert message
    const result = db.prepare(`
      INSERT INTO chat_messages (room_id, user_id, message, attachments)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, message, attachments || '');

    // Emit Socket.io event
    if (global.io) {
      const { emitChatMessage } = require('../middleware/socket');
      emitChatMessage(global.io, id, {
        id: result.lastInsertRowid,
        room_id: id,
        user_id: userId,
        username: user.username,
        message: message,
        message_type: 'text',
        created_at: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      messageId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'فشل في إرسال الرسالة' });
  }
}

// Delete session (admin or user for completed sessions)
async function deleteSession(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = ['admin', 'manager', 'moderator'].includes(req.user.role);

    // Get session
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }

    // Only allow deletion if:
    // 1. User is admin, OR
    // 2. Session is completed and belongs to the user
    if (!isAdmin) {
      if (session.status !== 'completed') {
        return res.status(400).json({ error: 'لا يمكن حذف جلسة غير مكتملة' });
      }
      if (session.user_id !== userId) {
        return res.status(403).json({ error: 'غير مصرح لك بحذف هذه الجلسة' });
      }
    }

    // Delete chat messages and participants first (foreign key constraints)
    db.prepare('DELETE FROM chat_messages WHERE room_id IN (SELECT id FROM chat_rooms WHERE session_id = ?)').run(id);
    db.prepare('DELETE FROM chat_participants WHERE room_id IN (SELECT id FROM chat_rooms WHERE session_id = ?)').run(id);
    db.prepare('DELETE FROM chat_rooms WHERE session_id = ?').run(id);

    // Delete the session
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'session_deleted', `Session #${id} deleted`, getClientIP(req));

    res.json({ message: 'تم حذف الجلسة بنجاح' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'فشل في حذف الجلسة' });
  }
}

module.exports = {
  createSession,
  getUserSessions,
  getSession,
  getAllSessions,
  getSessionStats,
  confirmSession,
  rejectSession,
  completeSession,
  cancelSession,
  deleteSession,
  getSessionTypes,
  getUserRooms,
  getRoomMessages,
  sendMessage
};

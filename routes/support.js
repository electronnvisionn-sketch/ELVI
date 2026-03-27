/**
 * ELECTRON VISION - Support Routes
 */

const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateTicket } = require('../middleware/validators');
const db = require('../database');
const { body, validationResult } = require('express-validator');

// POST /api/contact - Submit contact form (public - no auth required)
router.post('/contact', [
  body('name').notEmpty().withMessage('الاسم مطلوب').isLength({ min: 5 }),
  body('message').notEmpty().withMessage('الرسالة مطلوبة').isLength({ min: 10 }),
  body('email').optional().isEmail(),
  body('phone').optional()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  
  const { name, phone, email, subject, message } = req.body;
  
  // Validate that at least phone or email is provided
  if (!phone && !email) {
    return res.status(400).json({ error: 'يجب إدخال رقم الهاتف أو البريد الإلكتروني على الأقل' });
  }
  
  try {
    const result = db.prepare(`
      INSERT INTO messages (name, phone, email, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, phone || null, email || null, subject || '', message);
    
    res.status(201).json({ 
      success: true, 
      message: 'تم إرسال رسالتك بنجاح',
      messageId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'فشل في إرسال الرسالة' });
  }
});

// POST /api/support/tickets - Create new ticket (authenticated users)
router.post('/tickets', authenticate, validateTicket, supportController.createTicket);

// GET /api/support/tickets - Get user's tickets
router.get('/tickets', authenticate, supportController.getUserTickets);

// GET /api/support/tickets/:id - Get single ticket with replies
router.get('/tickets/:id', authenticate, supportController.getTicket);

// POST /api/support/tickets/:id/reply - Add reply to ticket
router.post('/tickets/:id/reply', authenticate, supportController.addReply);

// PUT /api/support/tickets/:id/close - Close ticket
router.put('/tickets/:id/close', authenticate, supportController.closeTicket);

// GET /api/support/admin/tickets - Get all tickets (admin only)
router.get('/admin/tickets', authenticate, requireAdmin, supportController.getAllTickets);

// PUT /api/support/admin/tickets/:id - Update ticket (admin only)
router.put('/admin/tickets/:id', authenticate, requireAdmin, supportController.updateTicket);

// POST /api/support/admin/tickets/:id/approve - Approve ticket (admin only)
router.post('/admin/tickets/:id/approve', authenticate, requireAdmin, supportController.approveTicket);

// POST /api/support/admin/tickets/:id/reject - Reject ticket (admin only)
router.post('/admin/tickets/:id/reject', authenticate, requireAdmin, supportController.rejectTicket);

// DELETE /api/support/tickets/:id - Delete ticket (owner or admin)
router.delete('/tickets/:id', authenticate, supportController.deleteTicket);

// GET /api/support/admin/stats - Get ticket statistics (admin only)
router.get('/admin/stats', authenticate, requireAdmin, supportController.getTicketStats);

module.exports = router;

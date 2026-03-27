/**
 * ELECTRON VISION - Sessions Routes
 * Professional booking and chat system
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateSession = [
  body('session_type').notEmpty().withMessage('نوع الجلسة مطلوب'),
  body('preferred_date').notEmpty().withMessage('التاريخ مطلوب'),
  body('preferred_time').notEmpty().withMessage('الوقت مطلوب'),
  body('guest_name').optional().trim(),
  body('guest_email').optional().trim(),
  body('guest_phone').optional().trim()
];

const validateMessage = [
  body('message').notEmpty().withMessage('الرسالة مطلوبة').trim()
];

// ==================== PUBLIC ROUTES ====================

// Get available session types
router.get('/types', (req, res) => {
  bookingController.getSessionTypes(req, res);
});

// Create guest session booking (public)
router.post('/guest', validateSession, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.createSession(req, res);
});

// ==================== AUTHENTICATED ROUTES ====================

router.use(authenticate);

// ==================== ADMIN ROUTES (must be before generic :id routes) ====================

// Delete session (admin)
router.delete('/admin/:id', requireAdmin, param('id').isInt(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.deleteSession(req, res);
});

// Get all sessions (admin)
router.get('/admin/all', requireAdmin, (req, res) => {
  bookingController.getAllSessions(req, res);
});

// Get session statistics (admin)
router.get('/admin/stats', requireAdmin, (req, res) => {
  bookingController.getSessionStats(req, res);
});

// Confirm session (admin)
router.post('/admin/:id/confirm', requireAdmin, (req, res) => {
  bookingController.confirmSession(req, res);
});

// Reject session (admin)
router.post('/admin/:id/reject', requireAdmin, (req, res) => {
  bookingController.rejectSession(req, res);
});

// Complete session (admin)
router.post('/admin/:id/complete', requireAdmin, (req, res) => {
  bookingController.completeSession(req, res);
});

// ==================== USER ROUTES ====================

// Get user's sessions
router.get('/my', (req, res) => {
  bookingController.getUserSessions(req, res);
});

// Create authenticated session booking
router.post('/', validateSession, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.createSession(req, res);
});

// Cancel session (user) - must be after admin routes
router.delete('/:id', param('id').isInt(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.cancelSession(req, res);
});

// Get single session - must be after admin routes
router.get('/:id', param('id').isInt(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.getSession(req, res);
});

// ==================== CHAT ROUTES ====================

// Get user's chat rooms
router.get('/rooms/my', (req, res) => {
  bookingController.getUserRooms(req, res);
});

// Get room messages
router.get('/rooms/:id/messages', param('id').isInt(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.getRoomMessages(req, res);
});

// Send message
router.post('/rooms/:id/message', validateMessage, param('id').isInt(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  bookingController.sendMessage(req, res);
});

module.exports = router;

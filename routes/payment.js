/**
 * ELECTRON VISION - Payment Routes
 * Stripe Checkout and payment handling
 */

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

// Create Stripe Checkout session (requires login)
router.post('/create-checkout-session', 
  authenticate,
  body('productId').isInt({ min: 1 }).withMessage('Product ID مطلوب'),
  body('couponCode').optional({ nullable: true }).isString().withMessage('كود الخصم غير صالح'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  (req, res, next) => {
    // Debug: log the request body
    console.log('Create checkout session request:', {
      body: req.body,
      user: req.user ? req.user.id : 'not authenticated',
      cookies: req.cookies ? 'present' : 'none'
    });
    next();
  },
  paymentController.createCheckoutSession
);

// Validate coupon code (optional auth - users don't need to be logged in)
router.post('/validate-coupon',
  optionalAuth,
  body('code').notEmpty().withMessage('كود الخصم مطلوب'),
  body('productId').optional().isInt(),
  paymentController.validateCouponAPI
);

// Check download access
router.post('/check-download',
  authenticate,
  body('productId').isInt({ min: 1 }).withMessage('Product ID مطلوب'),
  paymentController.checkDownloadAccess
);

// Get user's purchases
router.get('/my-purchases',
  authenticate,
  paymentController.getUserPurchases
);

// Payment success callback
router.get('/success', paymentController.paymentSuccess);

// Payment cancel callback
router.get('/cancel', paymentController.paymentCancel);

// Stripe webhook
router.post('/webhook', 
  express.raw({ type: 'application/json' }),
  paymentController.handleCheckoutWebhook
);

// Admin: Get all coupons
router.get('/admin/coupons', 
  authenticate, 
  requireAdmin, 
  (req, res) => {
    const db = require('../database');
    const coupons = db.prepare(`
      SELECT cc.*, u.username as created_by_name
      FROM coupon_codes cc
      LEFT JOIN users u ON cc.created_by = u.id
      ORDER BY cc.created_at DESC
    `).all();
    res.json(coupons);
  }
);

// Admin: Create coupon
router.post('/admin/coupons',
  authenticate,
  requireAdmin,
  (req, res, next) => {
    // Debug: log the request body
    console.log('[PAYMENT] Create coupon request body:', JSON.stringify(req.body));
    console.log('[PAYMENT] Request headers:', JSON.stringify(req.headers));
    next();
  },
  body('code').notEmpty().trim().withMessage('كود الخصم مطلوب'),
  body('discountType').optional({ nullable: true, checkFalsy: true }).isIn(['percentage', 'fixed']).withMessage('نوع الخصم يجب أن يكون نسبة أو مبلغ ثابت'),
  body('discountValue').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('قيمة الخصم مطلوبة'),
  body('maxUses').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  body('minPurchaseAmount').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[PAYMENT] Coupon validation errors:', JSON.stringify(errors.array()));
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, description, discountType, discountValue, maxUses, minPurchaseAmount, startsAt, expiresAt, isSingleUse, productIds } = req.body;

    // Ensure proper types
    const finalCode = code ? code.toUpperCase().trim() : null;
    const finalDiscountType = discountType || 'percentage';
    const finalDiscountValue = parseFloat(discountValue) || 0;
    const finalMaxUses = maxUses ? parseInt(maxUses) : null;
    const finalMinPurchaseAmount = minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0;

    try {
      const db = require('../database');
      
      // Check if code already exists
      const existing = db.prepare('SELECT id FROM coupon_codes WHERE code = ?').get(finalCode);
      if (existing) {
        return res.status(400).json({ error: 'كود الخصم موجود بالفعل' });
      }

      db.prepare(`
        INSERT INTO coupon_codes (code, description, discount_type, discount_value, max_uses, min_purchase_amount, starts_at, expires_at, is_single_use, product_ids, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        finalCode,
        description || '',
        finalDiscountType,
        finalDiscountValue,
        finalMaxUses,
        finalMinPurchaseAmount,
        startsAt || null,
        expiresAt || null,
        isSingleUse ? 1 : 0,
        productIds || null,
        req.user.id
      );

      res.json({ success: true, message: 'تم إنشاء كود الخصم بنجاح' });
    } catch (error) {
      console.error('[PAYMENT] Create coupon error:', error);
      console.error('[PAYMENT] Stack trace:', error.stack);
      res.status(500).json({ error: 'حدث خطأ في إنشاء الكود: ' + error.message });
    }
  }
);

// Admin: Update coupon
router.put('/admin/coupons/:id',
  authenticate,
  requireAdmin,
  (req, res) => {
    const { id } = req.params;
    const { description, discountType, discountValue, maxUses, minPurchaseAmount, startsAt, expiresAt, isActive, isSingleUse, productIds } = req.body;

    try {
      const db = require('../database');
      
      db.prepare(`
        UPDATE coupon_codes 
        SET description = ?, discount_type = ?, discount_value = ?, 
            max_uses = ?, min_purchase_amount = ?, starts_at = ?, 
            expires_at = ?, is_active = ?, is_single_use = ?, product_ids = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        description,
        discountType,
        discountValue,
        maxUses,
        minPurchaseAmount,
        startsAt,
        expiresAt,
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        isSingleUse ? 1 : 0,
        productIds || null,
        id
      );

      res.json({ success: true, message: 'تم تحديث كود الخصم بنجاح' });
    } catch (error) {
      console.error('Update coupon error:', error);
      res.status(500).json({ error: 'حدث خطأ في تحديث كود الخصم' });
    }
  }
);

// Admin: Delete coupon
router.delete('/admin/coupons/:id',
  authenticate,
  requireAdmin,
  (req, res) => {
    const { id } = req.params;

    try {
      const db = require('../database');
      db.prepare('DELETE FROM coupon_codes WHERE id = ?').run(id);
      res.json({ success: true, message: 'تم حذف كود الخصم بنجاح' });
    } catch (error) {
      console.error('Delete coupon error:', error);
      res.status(500).json({ error: 'حدث خطأ في حذف كود الخصم' });
    }
  }
);

module.exports = router;

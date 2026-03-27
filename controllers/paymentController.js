/**
 * ELECTRON VISION - Payment Controller
 * Stripe Checkout integration with coupon support
 */

const db = require('../database');
const { getClientIP } = require('../middleware/auth');
const { sendEmail } = require('../middleware/email');
const { createNotification } = require('../controllers/notificationController');
const { notifyNewPayment, notifyPaymentSuccess, notifyPaymentFailed } = require('../middleware/telegram');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create Stripe Checkout session
async function createCheckoutSession(req, res) {
  try {
    // Must be authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'يجب تسجيل الدخول أولاً',
        requireLogin: true
      });
    }

    const { productId, orderId, couponCode, items } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Determine order items
    let orderItems = [];
    let order = null;

    if (orderId) {
      order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
      if (!order) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      orderItems = db.prepare(`
        SELECT oi.*, p.name, p.description, p.price as product_price, p.download_url
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
      `).all(orderId);

      if (!orderItems.length) {
        return res.status(400).json({ error: 'السلة فارغة' });
      }
    } else if (productId) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      if (!product.is_paid || product.price <= 0) {
        return res.status(400).json({ error: 'هذا منتج مجاني' });
      }

      // Check if user already purchased this product
      const existingPurchase = db.prepare(`
        SELECT * FROM purchases 
        WHERE user_id = ? AND product_id = ? AND status = 'completed'
      `).get(userId, productId);

      if (existingPurchase) {
        // Check if download is still valid (within 1 month)
        if (existingPurchase.download_expires_at) {
          const expiresAt = new Date(existingPurchase.download_expires_at);
          if (expiresAt > new Date()) {
            return res.json({
              alreadyPurchased: true,
              downloadUrl: product.download_url,
              expiresAt: existingPurchase.download_expires_at
            });
          }
        }
      }

      orderItems = [{
        product_id: product.id,
        name: product.name,
        description: product.description,
        quantity: 1,
        price: product.price,
        download_url: product.download_url
      }];
    } else if (Array.isArray(items) && items.length > 0) {
      // Items array should include { productId, quantity }
      const productIds = items.map(i => i.productId);
      const products = db.prepare(`SELECT * FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`).all(...productIds);
      const productsById = Object.fromEntries(products.map(p => [p.id, p]));

      orderItems = items.map(i => {
        const prod = productsById[i.productId];
        if (!prod) return null;
        return {
          product_id: prod.id,
          name: prod.name,
          description: prod.description,
          quantity: Math.max(1, parseInt(i.quantity) || 1),
          price: prod.price,
          download_url: prod.download_url
        };
      }).filter(Boolean);

      if (!orderItems.length) {
        return res.status(400).json({ error: 'لم يتم العثور على عناصر صالحة' });
      }
    } else {
      return res.status(400).json({ error: 'يرجى تحديد منتج واحد أو سلة مشتريات' });
    }

    // Calculate totals
    const rawTotal = orderItems.reduce((acc, item) => acc + (item.price || 0) * (item.quantity || 1), 0);

    if (rawTotal <= 0) {
      return res.status(400).json({ error: 'السعر غير صحيح' });
    }

    let finalPrice = rawTotal;
    let discountAmount = 0;
    let appliedCoupon = null;
    let couponProductId = null;

    // Get productId for coupon validation (use first product if single product, or null for cart)
    if (productId) {
      couponProductId = productId;
    } else if (orderItems && orderItems.length > 0) {
      couponProductId = orderItems[0].product_id;
    }

    // Apply coupon if provided
    if (couponCode) {
      const couponValidation = validateCoupon(couponCode, rawTotal, userId, couponProductId);
      if (couponValidation.valid) {
        finalPrice = couponValidation.finalPrice;
        discountAmount = couponValidation.discountAmount;
        appliedCoupon = couponCode;
      } else if (!couponValidation.valid && couponValidation.error) {
        return res.status(400).json({ error: couponValidation.error });
      }
    }

    // Create or update order record
    if (!order) {
      const insertOrder = db.prepare(`
        INSERT INTO orders (user_id, total_amount, status, coupon_code, discount_amount, currency)
        VALUES (?, ?, 'pending', ?, ?, 'usd')
      `).run(userId, finalPrice, appliedCoupon, discountAmount);
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(insertOrder.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      `);

      orderItems.forEach(item => {
        insertItem.run(order.id, item.product_id, item.quantity, item.price);
      });
    } else {
      db.prepare(`
        UPDATE orders
        SET total_amount = ?, coupon_code = ?, discount_amount = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalPrice, appliedCoupon, discountAmount, order.id);

      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      `);
      orderItems.forEach(item => {
        insertItem.run(order.id, item.product_id, item.quantity, item.price);
      });
    }

    // Calculate final price for Stripe (in cents)
    const priceInCents = Math.round(finalPrice * 100);

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Order #${order.id}`,
            description: `طلب شراء رقم ${order.id}`
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.SITE_URL || 'http://localhost:3000'}/api/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL || 'http://localhost:3000'}/cancel.html`,
      customer_email: userEmail,
      metadata: {
        orderId: order.id.toString(),
        userId: userId.toString(),
        couponCode: appliedCoupon || '',
        totalAmount: rawTotal.toString(),
        discountAmount: discountAmount.toString()
      },
      allow_promotion_codes: false
    });

    // Create pending payment record
    db.prepare(`
      INSERT INTO payments (order_id, amount, payment_method, status, stripe_session_id)
      VALUES (?, ?, 'stripe', 'pending', ?)
    `).run(order.id, finalPrice, session.id);

    // Keep legacy purchase record for existing download logic
    if (orderItems.length === 1) {
      const item = orderItems[0];
      db.prepare(`
        INSERT INTO purchases (user_id, product_id, stripe_session_id, amount, discount_amount, coupon_code, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(userId, item.product_id, session.id, item.price, discountAmount, appliedCoupon);
    }

    // Send notifications
    await notifyNewPayment({ sessionId: session.id, productName: `Order #${order.id}`, amount: finalPrice, userEmail });

    res.json({ url: session.url, sessionId: session.id, orderId: order.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    // Log more details for debugging
    if (error.type === 'StripeError') {
      console.error('Stripe error type:', error.type);
      console.error('Stripe error code:', error.code);
      console.error('Stripe error message:', error.message);
    }
    res.status(500).json({ error: 'حدث خطأ في إنشاء صفحة الدفع', details: error.message });
  }
}

// Validate coupon code
function validateCoupon(code, purchaseAmount, userId, productId = null) {
  const coupon = db.prepare(`
    SELECT * FROM coupon_codes 
    WHERE code = ? AND is_active = 1
  `).get(code.toUpperCase());

  if (!coupon) {
    return { valid: false, error: 'كود الخصم غير صحيح' };
  }

  // Check expiration
  if (coupon.expires_at) {
    const expiresAt = new Date(coupon.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false, error: 'كود الخصم منتهي الصلاحية' };
    }
  }

  // Check start date
  if (coupon.starts_at) {
    const startsAt = new Date(coupon.starts_at);
    if (startsAt > new Date()) {
      return { valid: false, error: 'كود الخصم لم يبدأ بعد' };
    }
  }

  // Check minimum purchase
  if (coupon.min_purchase_amount > 0 && purchaseAmount < coupon.min_purchase_amount) {
    return { valid: false, error: `الحد الأدنى للشراء هو ${coupon.min_purchase_amount}` };
  }

  // Check usage limit
  if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
    return { valid: false, error: 'تم استخدام كود الخصم بالكامل' };
  }

  // Check single-use: if already used, cannot be used again
  if (coupon.is_single_use === 1 && coupon.current_uses >= 1) {
    return { valid: false, error: 'كود الخصم لمرة واحدة تم استخدامه بالفعل' };
  }

  // Check if coupon is restricted to specific products
  if (coupon.product_ids && productId) {
    const allowedProducts = coupon.product_ids.split(',').map(id => parseInt(id.trim()));
    if (!allowedProducts.includes(productId)) {
      return { valid: false, error: 'كود الخصم غير صالح لهذا المنتج' };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discount_type === 'percentage') {
    discountAmount = (purchaseAmount * coupon.discount_value) / 100;
  } else {
    discountAmount = coupon.discount_value;
  }

  // Don't exceed purchase amount
  discountAmount = Math.min(discountAmount, purchaseAmount);
  const finalPrice = Math.max(0, purchaseAmount - discountAmount);

  return {
    valid: true,
    discountAmount,
    finalPrice,
    coupon
  };
}

// Handle successful payment (redirect page)
async function paymentSuccess(req, res) {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.redirect('/cancel.html?error=no_session');
    }

    // Get session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.redirect('/cancel.html?error=payment_not_completed');
    }

    // Find payment record
    const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(session_id);
    if (!payment) {
      return res.redirect('/cancel.html?error=payment_not_found');
    }

    // Find order
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
    if (!order) {
      return res.redirect('/cancel.html?error=order_not_found');
    }

    // Update payment status
    db.prepare(`
      UPDATE payments
      SET status = 'paid', stripe_payment_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(session.payment_intent, payment.id);

    // Update order status
    db.prepare(`
      UPDATE orders
      SET status = 'paid', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(order.id);

    // Update coupon usage if applied
    if (order.coupon_code) {
      // Get coupon details to check if it's single-use
      const coupon = db.prepare('SELECT * FROM coupon_codes WHERE code = ?').get(order.coupon_code);
      
      if (coupon && coupon.is_single_use === 1) {
        // For single-use coupons, mark as used with user info
        db.prepare(`
          UPDATE coupon_codes
          SET current_uses = current_uses + 1, used_by = ?, used_at = CURRENT_TIMESTAMP
          WHERE code = ?
        `).run(order.user_id, order.coupon_code);
      } else if (coupon) {
        // For regular coupons, just increment usage
        db.prepare(`
          UPDATE coupon_codes
          SET current_uses = current_uses + 1
          WHERE code = ?
        `).run(order.coupon_code);
      }
    }

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(order.user_id, 'order_paid', `Order #${order.id} paid`, getClientIP(req));

    // Create notification
    createNotification(order.user_id, 'payment', 'تم إتمام الدفع بنجاح', `طلبك رقم ${order.id} تم دفعه بنجاح.`);

    // Find an order item for download (if exists)
    const item = db.prepare(`
      SELECT oi.*, p.download_url, p.name
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      LIMIT 1
    `).get(order.id);

    const downloadUrl = item?.download_url || '';

    res.redirect(`/success.html?order_id=${order.id}&download_url=${encodeURIComponent(downloadUrl)}`);

  } catch (error) {
    console.error('Payment success error:', error);
    res.redirect('/cancel.html?error=processing_error');
  }
}

// Handle canceled payment
function paymentCancel(req, res) {
  const { session_id } = req.query;

  // Clean up pending payment/order if exists
  if (session_id) {
    const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(session_id);
    if (payment) {
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('failed', payment.id);
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', payment.order_id);
    }

    // Also fallback to legacy purchase table
    db.prepare(`
      UPDATE purchases 
      SET status = 'failed' 
      WHERE stripe_session_id = ? AND status = 'pending'
    `).run(session_id);
  }

  res.redirect('/cancel.html');
}

// Handle Stripe webhook
async function handleCheckoutWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    let event;

    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        {
          const session = event.data.object;

          // Update payment record
          const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(session.id);
          if (payment) {
            db.prepare(`
              UPDATE payments
              SET status = 'paid', stripe_payment_id = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(session.payment_intent, payment.id);

            db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('paid', payment.order_id);
          }

          // Update coupon usage
          if (session.metadata && session.metadata.couponCode) {
            // Get the order to find user_id
            const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(session.id);
            const order = payment ? db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) : null;
            const userId = order ? order.user_id : null;
            
            // Get coupon details to check if it's single-use
            const coupon = db.prepare('SELECT * FROM coupon_codes WHERE code = ?').get(session.metadata.couponCode);
            
            if (coupon && coupon.is_single_use === 1) {
              // For single-use coupons, mark as used with user info
              db.prepare(`
                UPDATE coupon_codes
                SET current_uses = current_uses + 1, used_by = ?, used_at = CURRENT_TIMESTAMP
                WHERE code = ?
              `).run(userId, session.metadata.couponCode);
            } else if (coupon) {
              // For regular coupons, just increment usage
              db.prepare(`
                UPDATE coupon_codes 
                SET current_uses = current_uses + 1 
                WHERE code = ?
              `).run(session.metadata.couponCode);
            }
          }

          // Send Telegram notification for successful payment
          await notifyPaymentSuccess(session);
        }
        break;

      case 'checkout.session.expired':
        {
          const expiredSession = event.data.object;

          const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(expiredSession.id);
          if (payment) {
            db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('failed', payment.id);
            db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', payment.order_id);
          }

          // Send Telegram notification for failed payment
          await notifyPaymentFailed(expiredSession);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
}

// Validate coupon API
function validateCouponAPI(req, res) {
  try {
    const { code, productId } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'يرجى إدخال كود الخصم' });
    }

    // Get product price
    let productPrice = 0;
    if (productId) {
      const product = db.prepare('SELECT price FROM products WHERE id = ?').get(productId);
      if (product) {
        productPrice = product.price;
      }
    }

    const result = validateCoupon(code, productPrice, req.user?.id, productId);

    if (result.valid) {
      res.json({
        valid: true,
        discountAmount: result.discountAmount,
        finalPrice: result.finalPrice,
        discountType: result.coupon.discount_type,
        discountValue: result.coupon.discount_value,
        isSingleUse: result.coupon.is_single_use === 1,
        remainingUses: result.coupon.max_uses ? result.coupon.max_uses - result.coupon.current_uses : null
      });
    } else {
      res.status(400).json({ valid: false, error: result.error });
    }

  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ error: 'حدث خطأ في التحقق من الكود' });
  }
}

// Check if user can download product
function checkDownloadAccess(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const { productId } = req.body;
    const userId = req.user.id;

    const orderItem = db.prepare(`
      SELECT oi.*, o.status, o.created_at AS order_created_at, p.name, p.download_url
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'paid'
      ORDER BY o.created_at DESC
      LIMIT 1
    `).get(userId, productId);

    if (!orderItem) {
      return res.status(404).json({
        hasAccess: false,
        error: 'لم تقم بشراء هذا المنتج بعد'
      });
    }

    // Optional: limit download to 30 days after purchase
    const orderDate = new Date(orderItem.order_created_at);
    const expiryDate = new Date(orderDate);
    expiryDate.setDate(expiryDate.getDate() + 30);

    if (expiryDate < new Date()) {
      return res.json({
        hasAccess: false,
        error: 'انتهت صلاحية التحميل',
        expiredAt: expiryDate.toISOString()
      });
    }

    res.json({
      hasAccess: true,
      downloadUrl: orderItem.download_url,
      expiresAt: expiryDate.toISOString(),
      productName: orderItem.name
    });

  } catch (error) {
    console.error('Check download access error:', error);
    res.status(500).json({ error: 'حدث خطأ في التحقق' });
  }
}

// Get user's purchased orders
function getUserPurchases(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;

    const orders = db.prepare(`
      SELECT o.*,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as items_count
      FROM orders o
      WHERE o.user_id = ? AND o.status = 'paid'
      ORDER BY o.created_at DESC
    `).all(userId);

    const orderItems = db.prepare(`
      SELECT oi.*, p.name, p.name_ar, p.download_url, p.version
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `);

    const result = orders.map(order => {
      const items = orderItems.all(order.id);

      return {
        ...order,
        items,
        totalItems: items.reduce((acc, item) => acc + (item.quantity || 0), 0)
      };
    });

    res.json(result);

  } catch (error) {
    console.error('Get user purchases error:', error);
    res.status(500).json({ error: 'حدث خطأ في جلب المشتريات' });
  }
}

module.exports = {
  createCheckoutSession,
  paymentSuccess,
  paymentCancel,
  handleCheckoutWebhook,
  validateCouponAPI,
  checkDownloadAccess,
  getUserPurchases
};

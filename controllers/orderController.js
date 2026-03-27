/**
 * ELECTRON VISION - Order Controller
 * Handles cart, orders and order items
 */

const db = require('../database');
const paymentController = require('./paymentController');

function getCart(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;

    const cart = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? AND status = 'cart' ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    if (!cart) {
      return res.json({ cart: { items: [] } });
    }

    const items = db.prepare(`
      SELECT oi.*, p.name, p.name_ar, p.download_url, p.version
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(cart.id);

    res.json({ cart: { ...cart, items } });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'حدث خطأ في جلب السلة' });
  }
}

function addToCart(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    const qty = Math.max(1, parseInt(quantity) || 1);

    let order = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? AND status = 'cart' ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    if (!order) {
      const insertOrder = db.prepare(`
        INSERT INTO orders (user_id, total_amount, status, currency)
        VALUES (?, 0, 'cart', 'usd')
      `).run(userId);
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(insertOrder.lastInsertRowid);
    }

    // Check if item already in cart
    const existingItem = db.prepare(`
      SELECT * FROM order_items WHERE order_id = ? AND product_id = ?
    `).get(order.id, productId);

    if (existingItem) {
      db.prepare(`
        UPDATE order_items SET quantity = ?, price = ? WHERE id = ?
      `).run(existingItem.quantity + qty, product.price, existingItem.id);
    } else {
      db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      `).run(order.id, productId, qty, product.price);
    }

    // Recalculate totals
    const total = db.prepare(`
      SELECT SUM(quantity * price) as total
      FROM order_items WHERE order_id = ?
    `).get(order.id).total || 0;

    db.prepare(`
      UPDATE orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(total, order.id);

    res.json({ message: 'تم تحديث السلة بنجاح', cartId: order.id, total });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'حدث خطأ في تحديث السلة' });
  }
}

function removeFromCart(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;
    const { itemId } = req.params;

    const order = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? AND status = 'cart' ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    if (!order) {
      return res.status(404).json({ error: 'السلة غير موجودة' });
    }

    const item = db.prepare(`
      SELECT * FROM order_items WHERE id = ? AND order_id = ?
    `).get(itemId, order.id);

    if (!item) {
      return res.status(404).json({ error: 'العنصر غير موجود في السلة' });
    }

    db.prepare('DELETE FROM order_items WHERE id = ?').run(itemId);

    const total = db.prepare(`
      SELECT SUM(quantity * price) as total
      FROM order_items WHERE order_id = ?
    `).get(order.id).total || 0;

    db.prepare(`
      UPDATE orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(total, order.id);

    res.json({ message: 'تم حذف العنصر من السلة', cartId: order.id, total });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'حدث خطأ في حذف العنصر' });
  }
}

async function checkoutCart(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;
    const { orderId, couponCode } = req.body;

    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = 'cart'
    `).get(orderId, userId);

    if (!order) {
      return res.status(404).json({ error: 'السلة غير موجودة' });
    }

    // Redirect to existing payment controller flow
    req.body = {
      orderId: order.id,
      couponCode
    };

    return paymentController.createCheckoutSession(req, res);
  } catch (error) {
    console.error('Checkout cart error:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إتمام الطلب' });
  }
}

function getUserOrders(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;

    const orders = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId);

    const orderItemsStmt = db.prepare(`
      SELECT oi.*, p.name, p.download_url
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `);

    const result = orders.map(order => ({
      ...order,
      items: orderItemsStmt.all(order.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ error: 'حدث خطأ في جلب الطلبات' });
  }
}

function getOrderById(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }

    const userId = req.user.id;
    const { id } = req.params;

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.name, p.download_url
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(order.id);

    res.json({ ...order, items });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'حدث خطأ في جلب الطلب' });
  }
}

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  checkoutCart,
  getUserOrders,
  getOrderById
};

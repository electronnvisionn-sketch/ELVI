/**
 * ELECTRON VISION - Order Routes
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');

// Cart
router.get('/cart', authenticate, orderController.getCart);
router.post('/cart', authenticate, orderController.addToCart);
router.delete('/cart/items/:itemId', authenticate, orderController.removeFromCart);

// Checkout
router.post('/checkout', authenticate, orderController.checkoutCart);

// Orders
router.get('/', authenticate, orderController.getUserOrders);
router.get('/:id', authenticate, orderController.getOrderById);

module.exports = router;

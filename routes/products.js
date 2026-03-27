/**
 * ELECTRON VISION - Product Routes
 */

const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const uploadController = require('../controllers/uploadController');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateProduct } = require('../middleware/validators');

// GET /api/products - Get all products (public)
router.get('/', optionalAuth, productController.getAllProducts);

// GET /api/products/free - Get free products (public)
router.get('/free', productController.getFreeProducts);

// GET /api/products/paid - Get paid products (public)
router.get('/paid', productController.getPaidProducts);

// GET /api/products/purchased - Get user's purchased products (authenticated)
router.get('/purchased', authenticate, productController.getPurchasedProducts);

// POST /api/products/upload - Upload product file (supports up to 20GB) - MUST be before /:id
router.post('/upload', authenticate, requireAdmin, uploadController.handleUpload);

// GET /api/products/stats - Get product statistics (admin only)
router.get('/stats', authenticate, requireAdmin, productController.getProductStats);

// GET /api/products/:id - Get single product (public) - MUST be last
router.get('/:id', productController.getProduct);

// POST /api/products - Create product (admin only)
router.post('/', authenticate, requireAdmin, validateProduct, productController.createProduct);

// PUT /api/products/:id - Update product (admin only)
router.put('/:id', authenticate, requireAdmin, validateProduct, productController.updateProduct);

// DELETE /api/products/:id - Delete product (admin only)
router.delete('/:id', authenticate, requireAdmin, productController.deleteProduct);

module.exports = router;

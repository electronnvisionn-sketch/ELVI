/**
 * ELECTRON VISION - Product Controller
 */

const db = require('../database');
const fs = require('fs');
const path = require('path');

// Get all products
function getAllProducts(req, res) {
  try {
    const products = db.prepare(`
      SELECT * FROM products ORDER BY created_at DESC
    `).all();
    
    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get free products
function getFreeProducts(req, res) {
  try {
    const products = db.prepare(`
      SELECT * FROM products WHERE is_free = 1 ORDER BY created_at DESC
    `).all();
    
    res.json({ products });
  } catch (error) {
    console.error('Get free products error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get paid products
function getPaidProducts(req, res) {
  try {
    const products = db.prepare(`
      SELECT * FROM products WHERE is_paid = 1 ORDER BY price ASC
    `).all();
    
    res.json({ products });
  } catch (error) {
    console.error('Get paid products error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get single product
function getProduct(req, res) {
  try {
    const { id } = req.params;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Create product (admin only)
function createProduct(req, res) {
  try {
    const { name, name_ar, description, description_ar, price, is_free, is_paid, version, category, image_url, download_url, original_filename } = req.body;
    
    const result = db.prepare(`
      INSERT INTO products (name, name_ar, description, description_ar, price, is_free, is_paid, version, category, image_url, download_url, original_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, name_ar, description || '', description_ar || '',
      parseFloat(price) || 0,
      is_free ? 1 : 0,
      is_paid ? 1 : 0,
      version || '1.0.0',
      category || 'general',
      image_url || '',
      download_url || '',
      original_filename || ''
    );
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'product_created', `Product created: ${name}`, req.ip);
    
    res.status(201).json({
      message: 'تم إنشاء المنتج بنجاح',
      productId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Update product (admin only)
function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, name_ar, description, description_ar, price, is_free, is_paid, version, category, image_url, download_url, original_filename } = req.body;
    
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    db.prepare(`
      UPDATE products SET 
        name = ?, name_ar = ?, description = ?, description_ar = ?,
        price = ?, is_free = ?, is_paid = ?, version = ?, category = ?,
        image_url = ?, download_url = ?, original_filename = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, name_ar, description || '', description_ar || '',
      parseFloat(price) || 0,
      is_free ? 1 : 0,
      is_paid ? 1 : 0,
      version || '1.0.0',
      category || 'general',
      image_url || '',
      download_url || '',
      original_filename || '',
      id
    );
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'product_updated', `Product updated: ${name}`, req.ip);
    
    res.json({ message: 'تم تحديث المنتج بنجاح' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Delete product (admin only)
function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    
    const existing = db.prepare('SELECT id, name, download_url, image_url FROM products WHERE id = ?').get(id);
    
    if (!existing) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

    // Delete associated files from uploads
    if (existing.download_url) {
      const filename = existing.download_url.replace('/uploads/', '');
      const filepath = path.join(uploadsDir, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    if (existing.image_url) {
      const imgName = existing.image_url.replace('/uploads/', '');
      const imgPath = path.join(uploadsDir, imgName);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    }
    
    // Delete related order items first (set product_id to NULL)
    db.prepare('DELETE FROM order_items WHERE product_id = ?').run(id);
    
    // Delete the product
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    
    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'product_deleted', `Product deleted: ${existing.name}`, req.ip);
    
    res.json({ message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get product statistics (admin only)
function getProductStats(req, res) {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const freeProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE is_free = 1').get();
    const paidProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE is_paid = 1').get();
    
    res.json({
      total: totalProducts.count,
      free: freeProducts.count,
      paid: paidProducts.count
    });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get user's purchased products (redirects to payment controller)
function getPurchasedProducts(req, res) {
  // reuse payment logic
  const paymentController = require('./paymentController');
  return paymentController.getUserPurchases(req, res);
}

module.exports = {
  getAllProducts,
  getFreeProducts,
  getPaidProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStats,
  getPurchasedProducts
};

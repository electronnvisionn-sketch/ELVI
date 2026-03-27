/**
 * ELECTRON VISION - Large File Upload Controller
 * Handles uploads up to 20GB using streams and busboy
 */

const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const db = require('../database');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/products');
const MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024; // 20GB

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// Upload product file with progress tracking (supports up to 20GB)
function handleUpload(req, res) {
  // Set longer timeout for large files (30 minutes)
  req.setTimeout(1800000);
  req.connection.setTimeout(1800000);
  
  ensureUploadDir();

  const busboy = Busboy({ 
    headers: req.headers,
    limits: { 
      fileSize: MAX_FILE_SIZE 
    }
  });
  
  let fileName = '';
  let productName = '';
  let productNameAr = '';
  let productDescription = '';
  let productDescriptionAr = '';
  let productPrice = '0';
  let productIsFree = false;
  let productIsPaid = false;
  let productVersion = '1.0.0';
  let productCategory = 'general';
  let productId = '';
  
  const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const tempFile = path.join(UPLOAD_DIR, `temp_${fileId}`);
  
  // Use high water mark for large files (64MB chunks)
  const writeStream = fs.createWriteStream(tempFile, { 
    highWaterMark: 64 * 1024 * 1024 
  });
  
  let bytesWritten = 0;
  let fieldsProcessed = false;
  let fileStarted = false;

  busboy.on('file', (fieldname, file, info) => {
    console.log(`[Upload] Processing file: ${info.filename}, size limit: ${MAX_FILE_SIZE} bytes`);
    fileName = info.filename;
    fileStarted = true;
    
    file.on('data', (data) => {
      bytesWritten += data.length;
      writeStream.write(data);
      
      // Check size limit
      if (bytesWritten > MAX_FILE_SIZE) {
        file.destroy();
        writeStream.destroy();
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        res.status(413).json({ error: 'File too large. Maximum allowed size is 20GB.' });
      }
    });

    file.on('end', () => {
      console.log(`[Upload] File complete: ${bytesWritten} bytes`);
      writeStream.end();
    });

    file.on('error', (err) => {
      console.error('[Upload] File stream error:', err);
      writeStream.destroy();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });
  });

  busboy.on('field', (fieldname, val) => {
    switch (fieldname) {
      case 'name':
        productName = val;
        break;
      case 'name_ar':
        productNameAr = val;
        break;
      case 'description':
        productDescription = val;
        break;
      case 'description_ar':
        productDescriptionAr = val;
        break;
      case 'price':
        productPrice = val;
        break;
      case 'is_free':
        productIsFree = val === 'true';
        break;
      case 'is_paid':
        productIsPaid = val === 'true';
        break;
      case 'version':
        productVersion = val;
        break;
      case 'category':
        productCategory = val;
        break;
      case 'product-id':
        productId = val;
        break;
    }
  });

  busboy.on('finish', () => {
    writeStream.on('finish', () => {
      if (!fileName) {
        // No file uploaded, just create product
        createProductInDb(res, null, null, null);
        return;
      }
      
      // Generate unique filename
      const ext = path.extname(fileName);
      const newFileName = `${Date.now()}_${Math.random().toString(36).substr(2)}${ext}`;
      const finalPath = path.join(UPLOAD_DIR, newFileName);
      
      fs.rename(tempFile, finalPath, (err) => {
        if (err) {
          console.error('[Upload] Rename error:', err);
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          return res.status(500).json({ error: 'Error saving file' });
        }
        
        const downloadUrl = `/uploads/products/${newFileName}`;
        
        // Create or update product in database
        createProductInDb(res, {
          name: productName,
          name_ar: productNameAr,
          description: productDescription,
          description_ar: productDescriptionAr,
          price: parseFloat(productPrice) || 0,
          is_free: productIsFree,
          is_paid: productIsPaid,
          version: productVersion || '1.0.0',
          category: productCategory || 'general',
          downloadUrl,
          originalFilename: fileName
        }, bytesWritten, newFileName);
      });
    });
  });

  busboy.on('error', (err) => {
    console.error('[Upload] Busboy error:', err);
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  });

  req.pipe(busboy);
}

function createProductInDb(res, productData, fileSize, fileName) {
  try {
    if (productData && productData.downloadUrl) {
      // Create new product with file
      const result = db.prepare(`
        INSERT INTO products (name, name_ar, description, description_ar, price, is_free, is_paid, version, category, download_url, original_filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productData.name,
        productData.name_ar || '',
        productData.description || '',
        productData.description_ar || '',
        productData.price,
        productData.is_free ? 1 : 0,
        productData.is_paid ? 1 : 0,
        productData.version || '1.0.0',
        productData.category || 'general',
        productData.downloadUrl,
        productData.originalFilename || ''
      );
      
      // Log activity
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(1, 'product_created', `Product created: ${productData.name}`, '127.0.0.1');
      
      res.json({
        success: true,
        message: 'تم إنشاء المنتج بنجاح',
        productId: result.lastInsertRowid,
        fileName: fileName,
        originalName: productData.originalFilename,
        size: fileSize,
        downloadUrl: productData.downloadUrl
      });
    } else {
      res.json({
        success: true,
        message: 'تم حفظ البيانات'
      });
    }
  } catch (dbError) {
    console.error('[Upload] Database error:', dbError);
    res.status(500).json({ error: 'Error creating product: ' + dbError.message });
  }
}

// Delete product file
function deleteProductFile(req, res) {
  try {
    const { id } = req.params;
    
    const product = db.prepare('SELECT download_url FROM products WHERE id = ?').get(id);
    
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    if (product.download_url) {
      const filename = product.download_url.replace('/uploads/products/', '');
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.json({ success: true, message: 'تم حذف الملف بنجاح' });
  } catch (error) {
    console.error('[Upload] Delete error:', error);
    res.status(500).json({ error: 'Error deleting file' });
  }
}

module.exports = {
  handleUpload,
  deleteProductFile
};
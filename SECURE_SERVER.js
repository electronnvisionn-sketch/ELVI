/**
 * ELECTRON VISION - Secure Production Server
 * Ultra-Secure Configuration with All Security Features
 */

require('dotenv').config();

// Make env variables available globally
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
process.env.TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.CHAT_ID;

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const http = require('http');

// Security modules
const { 
  authenticate, 
  requireAdmin,
  generateTokens,
  generateOTP,
  hashString,
  compareString,
  verifyAccessToken,
  checkRateLimit,
  recordFailedLogin,
  isAccountLocked,
  lockAccount,
  unlockAccount,
  getClientIP,
  getAdminPath,
  isAdminPath,
  validatePassword,
  logSecurityEvent
} = require('./middleware/security');

const { 
  requestLogger, 
  errorHandler,
  logSecurity,
  logAudit 
} = require('./middleware/logger');

const { 
  createHTTPSRedirect, 
  addSecurityHeaders,
  createHTTPSServer,
  checkSSLCertificates
} = require('./middleware/https');

const {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  sanitizeQueryResult,
  safeQuery,
  safeRun,
  safeGet
} = require('./middleware/database-security');

const { sanitizeInput, validateContact } = require('./middleware/validators');
const telegramBot = require('./middleware/telegram');
const { compressUploadedFile } = require('./middleware/compression');

// Initialize database
require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// SECURITY MIDDLEWARE CONFIGURATION
// ============================================================================

// Request logging
app.use(requestLogger);

// Disable X-Powered-By header
app.disable('x-powered-by');

// Advanced Helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "data:", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'https://api.stripe.com'],
      frameSrc: ["'self'", 'https://js.stripe.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration - restrictive for production
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400 // 24 hours
}));

// ============================================================================
// RATE LIMITING - Multiple Layers
// ============================================================================

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 1000,
  message: { 
    error: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurity('rate_limit_exceeded', {
      ip: getClientIP(req),
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 900
    });
  }
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { 
    error: 'Too many authentication attempts',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurity('auth_rate_limit_exceeded', {
      ip: getClientIP(req),
      path: req.path
    });
    res.status(429).json({
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: 900
    });
  }
});

// Admin-specific rate limiting
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Admin rate limit exceeded',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED'
  }
});

// Apply rate limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify', authLimiter);
app.use('/api/admin', adminLimiter);

// ============================================================================
// INPUT VALIDATION & SANITIZATION
// ============================================================================

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100
}));

app.use(cookieParser());

// Sanitize all inputs
app.use(sanitizeInput);

// ============================================================================
// SECURE SESSION CONFIGURATION
// ============================================================================

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-production',
  name: '__Host-session', // Use secure cookie name
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined
  }
}));

// ============================================================================
// FILE UPLOAD SECURITY
// ============================================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const ext = path.extname(sanitizedName);
    cb(null, uniqueSuffix + ext);
  }
});

// File filter - restrict to safe file types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/zip',
    'application/x-rar-compressed',
    'text/plain',
    'text/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  // Allow all for admin, restrict for others
  if (req.user && req.user.role === 'admin') {
    cb(null, true);
  } else if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// ============================================================================
// STATIC FILES - SECURITY CONFIGURED
// ============================================================================

// Proper Content-Type for HTML
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }
  next();
});

// Static files with security headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Don't cache sensitive files
    if (filePath.includes('admin') || filePath.includes('dashboard')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

// Uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ============================================================================
// FILE UPLOAD ENDPOINTS
// ============================================================================

app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileInfo = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: '/uploads/' + req.file.filename,
      uploadedAt: new Date().toISOString()
    };
    
    // Auto-compress the uploaded file
    try {
      const compressionResult = await compressUploadedFile(req.file);
      if (compressionResult.success) {
        fileInfo.compressed = true;
        fileInfo.compressionRatio = compressionResult.ratio;
      }
    } catch (e) {
      console.error('Compression error:', e.message);
    }
    
    // Log upload
    logAudit('file_upload', req.user.id, {
      filename: req.file.filename,
      size: req.file.size
    });
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get uploaded files
app.get('/api/uploads', authenticate, (req, res) => {
  try {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(uploadDir).map(filename => {
      const filepath = path.join(uploadDir, filename);
      const stats = fs.statSync(filepath);
      return {
        filename,
        path: '/uploads/' + filename,
        size: stats.size,
        uploadedAt: stats.birthtime
      };
    });
    
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read files' });
  }
});

// Delete uploaded file
app.delete('/api/uploads/:filename', authenticate, requireAdmin, (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, 'public', 'uploads', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlinkSync(filepath);
    
    logAudit('file_delete', req.user.id, { filename });
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// ============================================================================
// API ROUTES
// ============================================================================

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const supportRoutes = require('./routes/support');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payment');
const bookingRoutes = require('./routes/booking');
const notificationController = require('./controllers/notificationController');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/sessions', bookingRoutes);

// Notifications
app.get('/api/notifications', authenticate, notificationController.getNotifications);
app.put('/api/notifications/:id/read', authenticate, notificationController.markAsRead);
app.put('/api/notifications/read-all', authenticate, notificationController.markAllAsRead);
app.delete('/api/notifications/:id', authenticate, notificationController.deleteNotification);

// Contact form
app.post('/api/contact', validateContact, (req, res) => {
  try {
    const db = require('./database');
    const { createNotification } = require('./controllers/notificationController');
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    safeRun(
      'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject || '', message]
    );
    
    createNotification(1, 'message', 'New Contact Message', `${name}: ${subject || 'No subject'}`, '/panel');
    
    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get services
app.get('/api/services', (req, res) => {
  try {
    const db = require('./database');
    const services = safeQuery('SELECT * FROM services ORDER BY created_at DESC');
    res.json({ services });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
// PAGE ROUTES WITH SECURITY
// ============================================================================

// Public pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/3', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'products.html'));
});

app.get('/4', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

app.get('/5', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Auth pages
app.get('/6', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/7', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Protected pages
function checkAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  
  if (!token) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  req.user = decoded;
  next();
}

function checkAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  
  if (!token) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  const decoded = verifyAccessToken(token);
  if (!decoded || decoded.role !== 'admin') {
    return res.redirect('/dashboard?error=admin_only');
  }
  
  req.user = decoded;
  next();
}

app.get('/dashboard', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Direct admin to panel with admin check - no double redirect
app.get('/admin', checkAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'index.html'));
});

// Admin panel with obfuscated path
app.get(getAdminPath(), checkAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'index.html'));
});

// Alternative admin path
app.get('/panel', checkAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'index.html'));
});

app.get('/verified', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verified.html'));
});

app.get('/sessions', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// ============================================================================
// DOWNLOAD ENDPOINT WITH SECURITY
// ============================================================================

app.get('/api/products/:id/download', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = require('./database');
    
    const product = safeGet('SELECT * FROM products WHERE id = ?', [id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    if (!product.download_url) {
      return res.status(404).json({ error: 'No download available' });
    }
    
    // Check purchase for paid products
    if (product.is_paid && !product.is_free) {
      const purchase = safeGet(
        'SELECT id FROM purchases WHERE user_id = ? AND product_id = ? AND status = ?',
        [req.user.id, id, 'completed']
      );
      
      if (!purchase) {
        return res.status(403).json({ error: 'Purchase required' });
      }
    }
    
    const filename = product.download_url.replace('/uploads/', '');
    const filepath = path.join(__dirname, 'public', 'uploads', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    const downloadFilename = product.original_filename || path.basename(filepath);
    
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
    
    logAudit('product_download', req.user.id, { productId: id });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ============================================================================
// 404 & ERROR HANDLERS
// ============================================================================

app.use((req, res) => {
  res.status(404).json({ error: 'Page not found' });
});

app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

function startServer() {
  // Add HTTPS redirect
  createHTTPSRedirect(app);
  addSecurityHeaders(app);
  
  // Check SSL certificates
  const sslStatus = checkSSLCertificates();
  if (sslStatus.available) {
    console.log(`✅ SSL Certificate valid until: ${sslStatus.validTo}`);
    if (sslStatus.warning) {
      console.warn(`⚠️  SSL Certificate expires in ${sslStatus.daysUntilExpiry} days`);
    }
  }
  
  // Create HTTP server
  const server = http.createServer(app);
  
  // Initialize Socket.IO with security
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Socket.IO authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return next(new Error('Invalid token'));
    }
    
    socket.user = decoded;
    next();
  });
  
  // Socket event handlers
  require('./middleware/socket')(io);
  
  // Start server
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║          ELECTRON VISION - SECURE SERVER                   ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on port: ${PORT}                            ║
║  Environment: ${process.env.NODE_ENV || 'development'}                           ║
║  HTTPS: ${sslStatus.available ? '✅ Enabled' : '⚠️  Disabled'}                           ║
║  Admin path: ${getAdminPath()}                    ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
  
  return server;
}

// Export for testing
module.exports = { app, startServer };

// Start server if run directly
if (require.main === module) {
  startServer();
}

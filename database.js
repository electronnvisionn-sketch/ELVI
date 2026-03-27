/**
 * ELECTRON VISION - Database Configuration
 * SQLite Database with full schema for SaaS Platform
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'app.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'moderator', 'user')),
    permissions TEXT DEFAULT '[]',
    is_verified INTEGER DEFAULT 0,
    verification_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Products table
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    description TEXT,
    description_ar TEXT,
    price REAL DEFAULT 0,
    is_free INTEGER DEFAULT 0,
    is_paid INTEGER DEFAULT 0,
    image_url TEXT,
    download_url TEXT,
    original_filename TEXT,
    version TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Services table
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    description TEXT,
    description_ar TEXT,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Support tickets table
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'open', 'in_progress', 'closed')),
    is_approved INTEGER DEFAULT 0,
    approved_by INTEGER,
    approved_at DATETIME,
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Ticket replies table
  CREATE TABLE IF NOT EXISTS ticket_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    attachments TEXT,
    is_admin_reply INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Contact messages table
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Activity logs table
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Website content table
  CREATE TABLE IF NOT EXISTS website_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section, key)
  );

  -- App config table (for storing app settings/flags)
  CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Email OTP table
  CREATE TABLE IF NOT EXISTS email_otp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Password Reset table
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Login history table
  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- IP block table
  CREATE TABLE IF NOT EXISTS blocked_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT,
    blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    permanent INTEGER DEFAULT 0
  );

  -- Purchases table
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    stripe_payment_id TEXT,
    stripe_session_id TEXT,
    amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    coupon_code TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_date DATETIME,
    download_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  -- Coupon codes table
  CREATE TABLE IF NOT EXISTS coupon_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL,
    min_purchase_amount REAL DEFAULT 0,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_single_use INTEGER DEFAULT 0,
    used_by INTEGER,
    used_at DATETIME,
    product_ids TEXT,
    is_active INTEGER DEFAULT 1,
    starts_at DATETIME,
    expires_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Orders table (for cart and purchase tracking)
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'cart' CHECK(status IN ('cart', 'pending', 'paid', 'cancelled', 'refunded')),
    coupon_code TEXT,
    discount_amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'usd',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Order items table
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );

  -- Payments table
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
    stripe_payment_id TEXT,
    stripe_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  -- Admin sessions for IP tracking
  CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    last_ip TEXT,
    last_login DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Two-factor authentication secrets
  CREATE TABLE IF NOT EXISTS two_factor_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    backup_codes TEXT,
    enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- API keys for programmatic access
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    permissions TEXT,
    last_used DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Push notification subscriptions
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    endpoint TEXT NOT NULL,
    keys TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Sessions table for bookings
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    guest_name TEXT,
    guest_email TEXT,
    guest_phone TEXT,
    session_type TEXT NOT NULL,
    session_title TEXT NOT NULL,
    session_description TEXT,
    preferred_date TEXT NOT NULL,
    preferred_time TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 60,
    price REAL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
    admin_notes TEXT,
    meeting_link TEXT,
    chat_room_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (chat_room_id) REFERENCES chat_rooms(id) ON DELETE SET NULL
  );

  -- Chat rooms for sessions
  CREATE TABLE IF NOT EXISTS chat_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    name TEXT NOT NULL,
    room_type TEXT DEFAULT 'session' CHECK(room_type IN ('session', 'support', 'general')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );

  -- Chat participants
  CREATE TABLE IF NOT EXISTS chat_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(room_id, user_id)
  );

  -- Chat messages
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    attachments TEXT,
    message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'voice', 'file')),
    reply_to INTEGER,
    is_read INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to) REFERENCES chat_messages(id) ON DELETE SET NULL
  );
`);

// Database migrations - add missing columns to existing tables
function runMigrations() {
  // Migration: Update users table role CHECK constraint
  try {
    const userInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (userInfo && userInfo.sql && !userInfo.sql.includes("'manager'")) {
      console.log('Updating users table role constraint...');
      db.exec('PRAGMA foreign_keys=off');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'moderator', 'user')),
          permissions TEXT DEFAULT '[]',
          is_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`INSERT INTO users_new SELECT * FROM users`);
      db.exec(`DROP TABLE users`);
      db.exec(`ALTER TABLE users_new RENAME TO users`);
      // Migrate old role names
      db.exec(`UPDATE users SET role = 'manager' WHERE role = 'user_manager'`);
      db.exec(`UPDATE users SET role = 'admin' WHERE role = 'super_admin'`);
      db.exec('PRAGMA foreign_keys=on');
      console.log('Users table role constraint updated');
    }
  } catch(e) { console.log('Users table migration:', e.message); }
  // Migration for messages table - add missing columns
  try {
    const msgInfo = db.prepare('PRAGMA table_info(messages)').all();
    const msgColumns = msgInfo.map(col => col.name);
    
    if (!msgColumns.includes('phone')) {
      db.exec(`ALTER TABLE messages ADD COLUMN phone TEXT`);
      console.log('Added phone column to messages');
    }
    if (!msgColumns.includes('email')) {
      db.exec(`ALTER TABLE messages ADD COLUMN email TEXT`);
      console.log('Added email column to messages');
    }
    if (!msgColumns.includes('subject')) {
      db.exec(`ALTER TABLE messages ADD COLUMN subject TEXT`);
      console.log('Added subject column to messages');
    }
  } catch(e) { console.log('Messages table migration:', e.message); }
  
  // Get list of columns in tickets table
  try {
    const ticketInfo = db.prepare('PRAGMA table_info(tickets)').all();
    const ticketColumns = ticketInfo.map(col => col.name);
    
    if (!ticketColumns.includes('is_approved')) {
      db.exec(`ALTER TABLE tickets ADD COLUMN is_approved INTEGER DEFAULT 0`);
      console.log('Added is_approved column to tickets');
    }
    if (!ticketColumns.includes('approved_by')) {
      db.exec(`ALTER TABLE tickets ADD COLUMN approved_by INTEGER`);
      console.log('Added approved_by column to tickets');
    }
    if (!ticketColumns.includes('approved_at')) {
      db.exec(`ALTER TABLE tickets ADD COLUMN approved_at DATETIME`);
      console.log('Added approved_at column to tickets');
    }
    if (!ticketColumns.includes('attachments')) {
      db.exec(`ALTER TABLE tickets ADD COLUMN attachments TEXT`);
      console.log('Added attachments column to tickets');
    }
    
    // Get list of columns in ticket_replies table
    const replyInfo = db.prepare('PRAGMA table_info(ticket_replies)').all();
    const replyColumns = replyInfo.map(col => col.name);
    
    if (!replyColumns.includes('attachments')) {
      db.exec(`ALTER TABLE ticket_replies ADD COLUMN attachments TEXT`);
      console.log('Added attachments column to ticket_replies');
    }
    
    // Create room_messages table if it doesn't exist
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS room_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          message_type TEXT DEFAULT 'text',
          reply_to INTEGER,
          is_deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reply_to) REFERENCES room_messages(id) ON DELETE SET NULL
        )
      `);
    } catch(e) { console.log('Room messages table:', e.message); }
    
    // Get list of columns in coupon_codes table
    const couponInfo = db.prepare('PRAGMA table_info(coupon_codes)').all();
    const couponColumns = couponInfo.map(col => col.name);
    
    if (!couponColumns.includes('is_single_use')) {
      db.exec(`ALTER TABLE coupon_codes ADD COLUMN is_single_use INTEGER DEFAULT 0`);
      console.log('Added is_single_use column to coupon_codes');
    }
    if (!couponColumns.includes('used_by')) {
      db.exec(`ALTER TABLE coupon_codes ADD COLUMN used_by INTEGER`);
      console.log('Added used_by column to coupon_codes');
    }
    if (!couponColumns.includes('used_at')) {
      db.exec(`ALTER TABLE coupon_codes ADD COLUMN used_at DATETIME`);
      console.log('Added used_at column to coupon_codes');
    }
    if (!couponColumns.includes('product_ids')) {
      db.exec(`ALTER TABLE coupon_codes ADD COLUMN product_ids TEXT`);
      console.log('Added product_ids column to coupon_codes');
    }
    
    // Add inventory tracking to products
    try {
      const productInfo = db.prepare('PRAGMA table_info(products)').all();
      const productColumns = productInfo.map(col => col.name);
      
      if (!productColumns.includes('stock_quantity')) {
        db.exec(`ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT 0`);
        console.log('Added stock_quantity column to products');
      }
      if (!productColumns.includes('sku')) {
        db.exec(`ALTER TABLE products ADD COLUMN sku TEXT`);
        console.log('Added sku column to products');
      }
      if (!productColumns.includes('is_featured')) {
        db.exec(`ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0`);
        console.log('Added is_featured column to products');
      }
      if (!productColumns.includes('gallery_images')) {
        db.exec(`ALTER TABLE products ADD COLUMN gallery_images TEXT`);
        console.log('Added gallery_images column to products');
      }
      if (!productColumns.includes('cost_price')) {
        db.exec(`ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0`);
        console.log('Added cost_price column to products');
      }
    } catch(e) { console.log('Products migration:', e.message); }

    // Sessions table migration - add chat_room_id column
    try {
      const sessionTableInfo = db.prepare("PRAGMA table_info(sessions)").all();
      const sessionColumns = sessionTableInfo.map(c => c.name);
      if (!sessionColumns.includes('chat_room_id')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN chat_room_id INTEGER`);
        console.log('Added chat_room_id column to sessions');
      }
    } catch(e) { console.log('Sessions migration:', e.message); }

    // Tickets table migration - add 'pending' to status
    try {
      // Recreate tickets table to fix status constraint (SQLite doesn't support ALTER TABLE for CHECK)
      const ticketCount = db.prepare("SELECT COUNT(*) as count FROM tickets").get();
      if (ticketCount.count === 0) {
        // No tickets, just update the constraint (won't work in SQLite but table is empty)
        console.log('Tickets table is empty, will use new constraint');
      }
      // For existing databases, we'll need to handle the error in the controller
    } catch(e) { console.log('Tickets migration:', e.message); }

    // Notifications table migration - add broadcast type
    try {
      const notifTableInfo = db.prepare("PRAGMA table_info(notifications)").all();
      const notifColumns = notifTableInfo.map(c => c.name);
      // Recreate table if needed (SQLite doesn't support ALTER COLUMN for CHECK)
      if (notifColumns.length > 0) {
        console.log('Notifications table exists');
      }
    } catch(e) { console.log('Notifications migration:', e.message); }

    // Create product categories table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          name_ar TEXT,
          description TEXT,
          parent_id INTEGER,
          image_url TEXT,
          is_active INTEGER DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('Categories table:', e.message); }

    // Create API usage logs table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          user_id INTEGER,
          ip_address TEXT,
          status_code INTEGER,
          response_time INTEGER,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('API usage logs:', e.message); }

    // Create error logs table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          endpoint TEXT,
          user_id INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          is_resolved INTEGER DEFAULT 0,
          resolved_by INTEGER,
          resolved_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('Error logs:', e.message); }

    // Create auto-responses table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auto_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trigger_keyword TEXT NOT NULL,
          response_text TEXT NOT NULL,
          response_type TEXT DEFAULT 'text' CHECK(response_type IN ('text', 'image', 'file')),
          is_active INTEGER DEFAULT 1,
          priority INTEGER DEFAULT 0,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('Auto responses:', e.message); }

    // Create broadcasts table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS broadcasts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          target_type TEXT DEFAULT 'all' CHECK(target_type IN ('all', 'users', 'admins', 'role', 'segment')),
          target_role TEXT,
          target_segment TEXT,
          scheduled_at DATETIME,
          sent_at DATETIME,
          total_recipients INTEGER DEFAULT 0,
          successful_deliveries INTEGER DEFAULT 0,
          failed_deliveries INTEGER DEFAULT 0,
          created_by INTEGER,
          status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('Broadcasts:', e.message); }

    // Create payment methods table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('stripe', 'paypal', 'telegram', 'custom')),
          is_active INTEGER DEFAULT 1,
          config TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.log('Payment methods:', e.message); }

    console.log('Database migrations completed successfully');
  } catch (e) {
    console.error('Migration error:', e.message);
  }
}

runMigrations();

// Initialize default data
function initializeDefaultData() {
  // Check if admin exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (!adminExists) {
    const bcrypt = require('bcrypt');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    db.prepare(`
      INSERT INTO users (username, email, password, role, is_verified)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', 'admin@electronvision.com', hashedPassword, 'admin', 1);
    
    console.log('✓ Default admin created: admin@electronvision.com / admin123');
  }

  // Check if services exist (only create default services on first ever run)
  const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services').get();
  
  if (servicesCount.count === 0) {
    let servicesCreated = false;
    try {
      const config = db.prepare('SELECT value FROM app_config WHERE key = ?').get('services_created');
      servicesCreated = config && config.value === 'true';
    } catch (e) {
      // Ignore
    }
    
    if (!servicesCreated) {
      const insertService = db.prepare(`
        INSERT INTO services (name, name_ar, description, description_ar, icon)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const defaultServices = [
        ['Software Development', 'تطوير البرمجيات', 'Custom software solutions tailored to your business needs', 'حلول برمجية مخصصة تناسب احتياجات عملك', 'code'],
        ['Cloud Solutions', 'حلول السحابة', 'Scalable cloud infrastructure and services', 'بنية تحتية سحابية قابلة للتوسع وخدمات', 'cloud'],
        ['Cybersecurity', 'الأمن السيبراني', 'Advanced security systems to protect your data', 'أنظمة أمان متقدمة لحماية بياناتك', 'shield'],
        ['AI & Machine Learning', 'الذكاء الاصطناعي', 'Smart AI solutions for modern businesses', 'حلول ذكية الذكاء الاصطناعي للشركات الحديثة', 'brain'],
        ['Technical Support', 'الدعم الفني', '24/7 professional technical assistance', 'مساعدة تقنية احترافية على مدار الساعة', 'headset'],
        ['Consulting Services', 'الاستشارات', 'Expert advice for digital transformation', 'نصائح الخبراء للتحول الرقمي', 'lightbulb']
      ];
      
      defaultServices.forEach(service => {
        insertService.run(...service);
      });
      
      try {
        db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('services_created', 'true');
      } catch (e) {
        // Ignore
      }
      
      console.log('✓ Default services created');
    } else {
      console.log('Services table is empty - not creating defaults (previously deleted)');
    }
  }

  // Check if products exist (only create default products on first ever run)
  // Note: Products will NOT be recreated after deletion - this is intentional
  const productsCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
  
  if (productsCount.count === 0) {
    // Check if this is first run by checking for flag in app_config table
    // Use try-catch to handle case where table doesn't exist in old databases
    let config = null;
    try {
      config = db.prepare('SELECT value FROM app_config WHERE key = ?').get('products_created');
    } catch (e) {
      // Table doesn't exist, that's fine - this is first run
    }
    
    // Only create products if never created before (no config flag)
    if (!config) {
      console.log('First run detected - creating default products...');
      const insertProduct = db.prepare(`
        INSERT INTO products (name, name_ar, description, description_ar, price, is_free, is_paid, version, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      // Free products
      insertProduct.run(
        'Electron Core', 
        'إلكترون كور',
        'Core library for Electron applications',
        'مكتبة أساسية لتطبيقات إلكترون',
        0, 1, 0, '1.0.0', 'development'
      );
      
      insertProduct.run(
        'Vision Toolkit', 
        'فيجن تولkits',
        'Essential tools for developers',
        'أدوات أساسية للمطورين',
        0, 1, 0, '2.1.0', 'tools'
      );
      
      // Paid products
      insertProduct.run(
        'Electron Pro', 
        'إلكترون برو',
        'Professional version with advanced features',
        'الإصدار الاحترافي مع الميزات المتقدمة',
        99.99, 0, 1, '3.0.0', 'development'
      );
      
      insertProduct.run(
        'Enterprise Suite', 
        'حزمة المؤسسات',
        'Complete enterprise solution',
        'حلول متكاملة للمؤسسات',
        299.99, 0, 1, '1.0.0', 'enterprise'
      );
      
      // Mark as created
      try {
        db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('products_created', 'true');
      } catch (e) {
        // Ignore if table doesn't exist
      }
      
      console.log('✓ Default products created');
    } else {
      console.log('Products table is empty - not creating defaults (previously deleted)');
    }
  }

  // Check if website content exists
  const contentCount = db.prepare('SELECT COUNT(*) as count FROM website_content').get();
  
  if (contentCount.count === 0) {
    const insertContent = db.prepare(`
      INSERT INTO website_content (section, key, value)
      VALUES (?, ?, ?)
    `);
    
    const defaultContent = [
      ['hero', 'title', 'ELECTRON VISION'],
      ['hero', 'subtitle', 'شركة ELECTRON VISION'],
      ['hero', 'description', 'نقدم حلول تقنية متقدمة للمؤسسات والأفراد'],
      ['about', 'title', 'من نحن'],
      ['about', 'description', 'شركة رائدة في مجال التكنولوجيا والابتكار'],
      ['footer', 'company_name', 'ELECTRON VISION'],
      ['footer', 'copyright', 'جميع الحقوق محفوظة © 2024']
    ];
    
    defaultContent.forEach(content => {
      insertContent.run(...content);
    });
    
    console.log('✓ Default website content created');
  }
}

// Initialize on module load
initializeDefaultData();

module.exports = db;

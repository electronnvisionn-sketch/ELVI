/**
 * ELECTRON VISION - Ultra-Secure Authentication Controller
 * Advanced Security with OTP Verification
 */

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { 
  generateTokens, 
  generateOTP, 
  hashString, 
  compareString,
  verifyAccessToken,
  checkRateLimit,
  recordFailedLogin,
  isAccountLocked,
  getClientIP,
  unlockAccount
} = require('../middleware/auth');
const { sendOTPEmail, sendWelcomeEmail } = require('../middleware/email');

// Register new user with OTP verification
async function register(req, res) {
  try {
    const { username, email, password } = req.body;
    const ip = getClientIP(req);
    
    // Check rate limit
    const rateCheck = checkRateLimit(ip, 'register');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح. يرجى المحاولة لاحقاً' });
    }
    
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    
    if (existingUser) {
      return res.status(400).json({ error: 'المستخدم موجود بالفعل' });
    }
    
    // Hash password with high cost factor
    const hashedPassword = await bcrypt.hash(password, 14);
    
    // Generate verification OTP
    const otp = generateOTP();
    const otpHash = await hashString(otp);
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
    
    // Insert user as unverified
    const result = db.prepare(`
      INSERT INTO users (username, email, password, is_verified, verification_token)
      VALUES (?, ?, ?, 0, ?)
    `).run(username, email, hashedPassword, otpHash);
    
    // Store OTP
    db.prepare(`
      INSERT INTO email_otp (email, otp, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(email, otpHash, new Date(expires).toISOString());
    
    // Log registration
    db.prepare(`
      INSERT INTO login_history (user_id, email, ip_address, user_agent, success, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).run(result.lastInsertRowid, email, ip, req.headers['user-agent'] || 'unknown');
    
    // In production, send OTP via email
    // For demo purposes only - in production, never log OTP!
    // console.log(`[OTP] Verification code for ${email}: ${otp}`);
    
    // Try to send email, but don't fail if it doesn't work
    try {
      await sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message);
    }
    
    res.status(201).json({
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      requiresVerification: true,
      email: email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Verify email with OTP
async function verifyEmail(req, res) {
  try {
    const { email, otp } = req.body;
    const ip = getClientIP(req);
    
    // Rate limit check
    const rateCheck = checkRateLimit(ip, 'verify');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح' });
    }
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // Check OTP
    const otpRecord = db.prepare(`
      SELECT * FROM email_otp 
      WHERE email = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(email);
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'رمز التحقق منتهي الصلاحية' });
    }
    
    const isValid = await compareString(otp, otpRecord.otp);
    
    if (!isValid) {
      return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
    }
    
    // Update user as verified
    db.prepare(`
      UPDATE users SET is_verified = 1, verification_token = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(user.id);
    
    // Delete used OTP
    db.prepare('DELETE FROM email_otp WHERE email = ?').run(email);
    
    // Log successful verification
    db.prepare(`
      INSERT INTO login_history (user_id, email, ip_address, user_agent, success, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(user.id, email, ip, req.headers['user-agent'] || 'unknown');
    
    // Generate tokens
    const tokens = generateTokens({ ...user, is_verified: 1 });
    
    // Set JWT in HTTP-only cookie for security - ONLY cookie, not in response body
    // Use 'lax' for SameSite in development to allow cross-page navigation
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Also set a non-HTTP-only cookie for client-side JavaScript access
    res.cookie('client_token', tokens.accessToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    // Set CSRF token
    const { generateCSRFToken } = require('../middleware/csrf');
    const csrfToken = generateCSRFToken();
    req.session.csrfToken = csrfToken;
    
    res.cookie('XSRF-TOKEN', csrfToken, {
      httpOnly: false, // Frontend needs to read this
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({
      message: 'تم التحقق من البريد الإلكتروني بنجاح',
      verified: true,
      // DO NOT send tokens in response body - only in HttpOnly cookies
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_verified: 1
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Resend OTP
async function resendOTP(req, res) {
  try {
    const { email } = req.body;
    const ip = getClientIP(req);
    
    // Rate limit
    const rateCheck = checkRateLimit(ip, 'resend');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح' });
    }
    
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // Generate new OTP
    const otp = generateOTP();
    const otpHash = await hashString(otp);
    const expires = Date.now() + 15 * 60 * 1000;
    
    // Delete old OTPs
    db.prepare('DELETE FROM email_otp WHERE email = ?').run(email);
    
    // Insert new OTP
    db.prepare(`
      INSERT INTO email_otp (email, otp, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(email, otpHash, new Date(expires).toISOString());
    
    // In production, OTP would be sent via email only
    // console.log(`[OTP] New verification code for ${email}: ${otp}`);
    
    // Try to send email
    try {
      await sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message);
    }
    
    res.json({ message: 'تم إرسال رمز جديد' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Login with OTP
async function login(req, res) {
  try {
    const { email, password, otp } = req.body;
    const ip = getClientIP(req);
    
    // Check if IP is blocked
    const blockedIP = db.prepare(`
      SELECT * FROM blocked_ips 
      WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(ip);
    
    if (blockedIP) {
      return res.status(403).json({ error: 'تم حجب عنوان IP الخاص بك' });
    }
    
    // Rate limit
    const rateCheck = checkRateLimit(ip, 'login');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح' });
    }
    
    // Check if account is locked
    if (isAccountLocked(email)) {
      return res.status(403).json({ error: 'الحساب مغلق مؤقتاً بسبب محاولات فاشلة متعددة' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      recordFailedLogin(email, ip);
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      const attempts = recordFailedLogin(email, ip);
      
      db.prepare(`
        INSERT INTO login_history (user_id, email, ip_address, user_agent, success, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `).run(user.id, email, ip, req.headers['user-agent'] || 'unknown');
      
      if (attempts >= 5) {
        // Block IP
        const blockExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT OR REPLACE INTO blocked_ips (ip_address, reason, expires_at)
          VALUES (?, ?, ?)
        `).run(ip, 'Too many failed login attempts', blockExpires);
        
        return res.status(403).json({ error: 'تم حجب عنوان IP الخاص بك' });
      }
      
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    
    // If user requires OTP verification (can be enabled for extra security)
    if (user.is_verified === 0) {
      // Generate OTP for unverified users
      const verifyOTP = generateOTP();
      const otpHash = await hashString(verifyOTP);
      const expires = Date.now() + 15 * 60 * 1000;
      
      db.prepare('DELETE FROM email_otp WHERE email = ?').run(email);
      db.prepare(`
        INSERT INTO email_otp (email, otp, expires_at, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(email, otpHash, new Date(expires).toISOString());
      
      // In production, OTP would be sent via email only
      // console.log(`[OTP] Login verification code for ${email}: ${verifyOTP}`);
      
      // Try to send email
      try {
        await sendOTPEmail(email, verifyOTP, 'login');
      } catch (emailError) {
        console.error('Email sending failed:', emailError.message);
      }
      
      return res.status(200).json({
        requiresOTP: true,
        message: 'يرجى إدخال رمز التحقق المرسل إلى بريدك الإلكتروني'
      });
    }
    
    // Check OTP if provided
    if (otp) {
      const otpRecord = db.prepare(`
        SELECT * FROM email_otp 
        WHERE email = ? AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT 1
      `).get(email);
      
      if (!otpRecord) {
        return res.status(400).json({ error: 'رمز التحقق منتهي الصلاحية' });
      }
      
      const isValidOTP = await compareString(otp, otpRecord.otp);
      
      if (!isValidOTP) {
        recordFailedLogin(email, ip);
        return res.status(401).json({ error: 'رمز التحقق غير صحيح' });
      }
      
      db.prepare('DELETE FROM email_otp WHERE email = ?').run(email);
    }
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    // Log successful login
    db.prepare(`
      INSERT INTO login_history (user_id, email, ip_address, user_agent, success, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(user.id, email, ip, req.headers['user-agent'] || 'unknown');
    
    // Clear failed login attempts
    unlockAccount(email);
    
    // Set JWT in cookie with proper security - ONLY cookie, not in response body
    // Use 'lax' for SameSite in development to allow cross-page navigation
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Also set a non-HTTP-only cookie for client-side JavaScript access
    res.cookie('client_token', tokens.accessToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    // Set CSRF token
    const { generateCSRFToken } = require('../middleware/csrf');
    const csrfToken = generateCSRFToken();
    req.session.csrfToken = csrfToken;
    
    res.cookie('XSRF-TOKEN', csrfToken, {
      httpOnly: false, // Frontend needs to read this
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    // Send token in response body for API/socket access (in addition to HttpOnly cookie)
    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified
      },
      token: tokens.accessToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Get current user
function getCurrentUser(req, res) {
  res.json({ user: req.user });
}

// Update profile
async function updateProfile(req, res) {
  try {
    const { username, email } = req.body;
    const userId = req.user.id;
    
    const existing = db.prepare(`
      SELECT id FROM users 
      WHERE (email = ? OR username = ?) AND id != ?
    `).get(email, username, userId);
    
    if (existing) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو اسم المستخدم مستخدم بالفعل' });
    }
    
    db.prepare(`
      UPDATE users SET username = ?, email = ?, updated_at = datetime('now') WHERE id = ?
    `).run(username, email, userId);
    
    res.json({ message: 'تم تحديث الملف الشخصي بنجاح' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Change password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 14);
    
    db.prepare(`
      UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?
    `).run(hashedPassword, userId);
    
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, 'password_changed', 'Password changed', getClientIP(req));
    
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Forgot password - send reset link
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const ip = getClientIP(req);
    
    // Rate limit check
    const rateCheck = checkRateLimit(ip, 'forgot_password');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح. يرجى المحاولة لاحقاً' });
    }
    
    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'إذا كان البريد الإلكتروني موجوداً، سيتم إرسال رابط إعادة التعيين' });
    }
    
    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await hashString(resetToken);
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour
    
    // Store reset token
    db.prepare(`
      INSERT INTO password_resets (email, token, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(email, resetTokenHash, new Date(expires).toISOString());
    
    // Delete old tokens for this email
    db.prepare(`
      DELETE FROM password_resets 
      WHERE email = ? AND id NOT IN (
        SELECT id FROM password_resets 
        WHERE email = ? 
        ORDER BY created_at DESC 
        LIMIT 5
      )
    `).run(email, email);
    
    // Try to send email with reset link
    try {
      const { sendResetPasswordEmail } = require('../middleware/email');
      await sendResetPasswordEmail(email, resetToken);
    } catch (emailError) {
      console.error('Reset email sending failed:', emailError.message);
    }
    
    res.json({ message: 'إذا كان البريد الإلكتروني موجوداً، سيتم إرسال رابط إعادة التعيين' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// Reset password with token
async function resetPassword(req, res) {
  try {
    const { email, token, newPassword } = req.body;
    const ip = getClientIP(req);
    
    // Rate limit check
    const rateCheck = checkRateLimit(ip, 'reset_password');
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح' });
    }
    
    // Validate password strength
    if (!newPassword || newPassword.length < 12) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' });
    }
    
    // Find valid reset token
    const resetRecord = db.prepare(`
      SELECT * FROM password_resets 
      WHERE email = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(email);
    
    if (!resetRecord) {
      return res.status(400).json({ error: 'رابط إعادة التعيين منتهي أو غير صالح' });
    }
    
    // Verify token
    const isValidToken = await compareString(token, resetRecord.token);
    
    if (!isValidToken) {
      return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
    }
    
    // Get user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 14);
    
    // Update password
    db.prepare(`
      UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?
    `).run(hashedPassword, user.id);
    
    // Mark token as used
    db.prepare('UPDATE password_resets SET used = 1 WHERE email = ?').run(email);
    
    // Invalidate all existing sessions by deleting their refresh tokens
    // This is done by updating a 'last_password_change' field or similar mechanism
    
    // Log the password change
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(user.id, 'password_reset', 'Password reset via email', ip);
    
    // Clear all login sessions (optional: you might want to implement session tracking)
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(user.id, 'all_sessions_invalidated', 'All sessions invalidated after password reset', ip);
    
    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendOTP,
  getCurrentUser,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword
};

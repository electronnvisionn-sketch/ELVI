/**
 * ELECTRON VISION - Authentication Routes
 * Ultra-Secure with OTP
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validators');

// POST /api/auth/register - Register new user
router.post('/register', validateRegistration, authController.register);

// POST /api/auth/login - Login user
router.post('/login', validateLogin, authController.login);

// POST /api/auth/verify - Verify email with OTP
router.post('/verify', authController.verifyEmail);

// POST /api/auth/resend-otp - Resend OTP
router.post('/resend-otp', authController.resendOTP);

// GET /api/auth/me - Get current user
router.get('/me', authenticate, authController.getCurrentUser);

// PUT /api/auth/profile - Update profile
router.put('/profile', authenticate, authController.updateProfile);

// PUT /api/auth/password - Change password
router.put('/password', authenticate, authController.changePassword);

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', authController.resetPassword);

// POST /api/auth/logout - Logout user
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('client_token');
  res.clearCookie('refreshToken');
  res.json({ message: 'تم تسجيل الخروج بنجاح' });
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const { REFRESH_SECRET } = require('../middleware/auth');
    const { generateCSRFToken } = require('../middleware/csrf');
    
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    // Get user info
    const db = require('../database');
    const user = db.prepare('SELECT id, username, email, role, is_verified FROM users WHERE id = ?').get(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Generate new tokens
    const { generateTokens } = require('../middleware/auth');
    const tokens = generateTokens(user);
    
    // Use 'lax' for SameSite in development to allow cross-page navigation
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set new cookies with enhanced security
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
    
    // Regenerate CSRF token
    const csrfToken = generateCSRFToken();
    req.session.csrfToken = csrfToken;
    
    res.cookie('XSRF-TOKEN', csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

module.exports = router;

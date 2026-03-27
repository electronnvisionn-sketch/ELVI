/**
 * ELECTRON VISION - CSRF Protection Middleware
 * Prevents Cross-Site Request Forgery attacks
 */

const crypto = require('crypto');

// Generate CSRF token
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

// CSRF middleware - generates and validates tokens
function csrfMiddleware(req, res, next) {
  // Skip for GET requests (safe methods) and API endpoints that don't need CSRF
  if (req.method === 'GET' || req.path.startsWith('/api/') === false) {
    // For GET requests, generate a new token if not exists and store in session
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateCSRFToken();
    }
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }
  
  // For state-changing operations (POST, PUT, DELETE), validate CSRF token
  // Skip for API endpoints that use their own authentication
  if (req.path.startsWith('/api/')) {
    // API endpoints validate CSRF via header
    const clientToken = req.headers['x-csrf-token'] || req.body._csrf;
    const serverToken = req.session.csrfToken;
    
    // Skip CSRF for API endpoints that use JWT auth
    // The API uses HttpOnly cookies which are protected by SameSite
    if (req.headers['authorization'] || req.cookies?.token) {
      return next();
    }
    
    // Allow if no session token exists yet (first request)
    if (!serverToken) {
      return next();
    }
    
    // Validate token
    if (clientToken && clientToken === serverToken) {
      return next();
    }
    
    // For same-origin requests, we can be more lenient
    const referer = req.headers['referer'];
    const origin = req.headers['origin'];
    const host = req.headers['host'];
    
    if (referer && (referer.includes(host) || referer.includes('localhost'))) {
      return next();
    }
    
    if (origin && (origin.includes(host) || origin.includes('localhost'))) {
      return next();
    }
    
    // Log potential CSRF attempt
    console.warn('⚠️  Potential CSRF attempt detected:', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
}

// Middleware to attach CSRF token to all renderings
function csrfTokenMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

module.exports = {
  generateCSRFToken,
  csrfMiddleware,
  csrfTokenMiddleware
};

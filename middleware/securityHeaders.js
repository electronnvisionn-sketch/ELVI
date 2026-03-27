/**
 * ELECTRON VISION - Enhanced Security Headers
 * Comprehensive HTTP Security Headers Middleware
 */

require('dotenv').config();

const helmet = require('helmet');

const SECURITY_HEADERS_CONFIG = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      connectSrc: ["'self'", "wss:", "ws:", "https:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  originAgentCluster: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xFrameOptions: "DENY",
  xPermittedCrossDomainPolicies: "none",
  permittedNavDirectives: []
};

function createSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: SECURITY_HEADERS_CONFIG.contentSecurityPolicy,
    crossOriginEmbedderPolicy: SECURITY_HEADERS_CONFIG.crossOriginEmbedderPolicy,
    crossOriginResourcePolicy: SECURITY_HEADERS_CONFIG.crossOriginResourcePolicy,
    crossOriginOpenerPolicy: SECURITY_HEADERS_CONFIG.crossOriginOpenerPolicy,
    originAgentCluster: SECURITY_HEADERS_CONFIG.originAgentCluster,
    referrerPolicy: SECURITY_HEADERS_CONFIG.referrerPolicy,
    strictTransportSecurity: SECURITY_HEADERS_CONFIG.strictTransportSecurity,
    xFrameOptions: SECURITY_HEADERS_CONFIG.xFrameOptions,
    xPermittedCrossDomainPolicies: SECURITY_HEADERS_CONFIG.xPermittedCrossDomainPolicies,
    permittedNavDirectives: SECURITY_HEADERS_CONFIG.permittedNavDirectives,
    permissionsPolicy: {
      features: {
        accelerometer: [],
        camera: [],
        geolocation: [],
        gyroscope: [],
        magnetometer: [],
        microphone: [],
        payment: [],
        usb: []
      }
    }
  });
}

function additionalSecurityHeaders(req, res, next) {
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

function disableCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

function securityHeadersAdmin() {
  return (req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    next();
  };
}

module.exports = {
  createSecurityHeaders,
  additionalSecurityHeaders,
  disableCache,
  securityHeadersAdmin,
  SECURITY_HEADERS_CONFIG
};

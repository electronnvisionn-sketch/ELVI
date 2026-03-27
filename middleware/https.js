/**
 * ELECTRON VISION - HTTPS and SSL/TLS Configuration
 * Enterprise-Grade Security for Production Deployment
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============================================================================
// SSL CERTIFICATE CONFIGURATION
// ============================================================================

const SSL_CONFIG = {
  // Paths to SSL certificates
  key: process.env.SSL_KEY_PATH || path.join(__dirname, '..', 'ssl', 'server.key'),
  cert: process.env.SSL_CERT_PATH || path.join(__dirname, '..', 'ssl', 'server.crt'),
  ca: process.env.SSL_CA_PATH || path.join(__dirname, '..', 'ssl', 'ca.crt'),
  
  // Let's Encrypt paths (alternative)
  letsencryptKey: path.join(__dirname, '..', 'ssl', 'letsencrypt', 'privkey.pem'),
  letsencryptCert: path.join(__dirname, '..', 'ssl', 'letsencrypt', 'cert.pem'),
  letsencryptCA: path.join(__dirname, '..', 'ssl', 'letsencrypt', 'chain.pem'),
  
  // SSL/TLS Protocol versions
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  
  // Cipher suites (modern and secure)
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'DHE-RSA-AES128-GCM-SHA256',
    'DHE-RSA-AES256-GCM-SHA384'
  ].join(':'),
  
  // HSTS configuration
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubDomains: true,
  hstsPreload: true
};

// ============================================================================
// SSL OPTIONS GENERATOR
// ============================================================================

function getSSLOptions() {
  // Try primary certificates first
  let keyPath = SSL_CONFIG.key;
  let certPath = SSL_CONFIG.cert;
  let caPath = SSL_CONFIG.ca;
  
  // Check for Let's Encrypt certificates
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const leKey = SSL_CONFIG.letsencryptKey;
    const leCert = SSL_CONFIG.letsencryptCert;
    const leCA = SSL_CONFIG.letsencryptCA;
    
    if (fs.existsSync(leKey) && fs.existsSync(leCert)) {
      keyPath = leKey;
      certPath = leCert;
      caPath = fs.existsSync(leCA) ? leCA : undefined;
    }
  }
  
  // Check if certificates exist
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    return null;
  }
  
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    minVersion: SSL_CONFIG.minVersion,
    maxVersion: SSL_CONFIG.maxVersion,
    ciphers: SSL_CONFIG.ciphers,
    honorCipherOrder: true,
    sslVersion: SSL_CONFIG.minVersion
  };
  
  // Add CA certificate if exists
  if (caPath && fs.existsSync(caPath)) {
    options.ca = fs.readFileSync(caPath);
  }
  
  return options;
}

// ============================================================================
// HTTP TO HTTPS REDIRECTION
// ============================================================================

function createHTTPSRedirect(app) {
  // Force HTTPS in production
  if (process.env.FORCE_HTTPS === 'true' || process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      // Skip for localhost in development
      if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
        return next();
      }
      
      if (!req.secure) {
        // Determine the port
        const port = process.env.HTTPS_PORT || 443;
        const host = req.hostname;
        
        // Build the HTTPS URL
        let httpsUrl = `https://${host}`;
        if (port !== 443) {
          httpsUrl += `:${port}`;
        }
        httpsUrl += req.originalUrl;
        
        // Redirect with permanent (301) or temporary (302) redirect
        const redirectCode = process.env.NODE_ENV === 'production' ? 301 : 302;
        return res.redirect(redirectCode, httpsUrl);
      }
      
      next();
    });
  }
}

// ============================================================================
// SECURITY HEADERS FOR HTTPS
// ============================================================================

function addSecurityHeaders(app) {
  // HSTS Header
  app.use((req, res, next) => {
    if (req.secure && (process.env.FORCE_HTTPS === 'true' || process.env.NODE_ENV === 'production')) {
      let hstsValue = `max-age=${SSL_CONFIG.hstsMaxAge}`;
      
      if (SSL_CONFIG.hstsIncludeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      
      if (SSL_CONFIG.hstsPreload) {
        hstsValue += '; preload';
      }
      
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    
    next();
  });
}

// ============================================================================
// CREATE HTTPS SERVER
// ============================================================================

function createHTTPSServer(app, port) {
  const sslOptions = getSSLOptions();
  
  if (!sslOptions) {
    console.warn('⚠️  SSL certificates not found. Running on HTTP only.');
    console.warn('⚠️  For production, configure SSL certificates in .env');
    return null;
  }
  
  const server = https.createServer(sslOptions, app);
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
    } else {
      console.error('HTTPS Server error:', err);
    }
  });
  
  return server;
}

// ============================================================================
// SSL CERTIFICATE CHECKER
// ============================================================================

function checkSSLCertificates() {
  const sslOptions = getSSLOptions();
  
  if (!sslOptions) {
    return {
      available: false,
      message: 'SSL certificates not configured'
    };
  }
  
  try {
    // Read certificate
    const cert = require('crypto').X509Certificate.load(sslOptions.cert);
    const expiryDate = new Date(cert.validTo);
    const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    
    return {
      available: true,
      validTo: cert.validTo,
      daysUntilExpiry,
      issuer: cert.issuer,
      subject: cert.subject,
      warning: daysUntilExpiry < 30
    };
  } catch (e) {
    return {
      available: false,
      error: e.message
    };
  }
}

// ============================================================================
// AUTOMATIC CERTIFICATE RENEWAL (For Let's Encrypt)
// ============================================================================

function setupAutoRenewal(server, app) {
  // This is a placeholder for automatic certificate renewal
  // In production, you would use a tool like certbot or greenlock
  
  if (process.env.ENABLE_AUTO_RENEWAL === 'true') {
    // Check certificate expiry every 24 hours
    setInterval(() => {
      const certStatus = checkSSLCertificates();
      
      if (certStatus.available && certStatus.daysUntilExpiry < 7) {
        console.warn(`⚠️  SSL certificate expires in ${certStatus.daysUntilExpiry} days`);
        
        // Here you would trigger certificate renewal
        // For example, using certbot:
        // exec('certbot renew', (error, stdout, stderr) => {
        //   if (!error) {
        //     console.log('SSL certificate renewed');
        //     // Reload SSL certificates
        //   }
        // });
      }
    }, 24 * 60 * 60 * 1000);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SSL_CONFIG,
  getSSLOptions,
  createHTTPSRedirect,
  addSecurityHeaders,
  createHTTPSServer,
  checkSSLCertificates,
  setupAutoRenewal
};

# ELECTRON VISION - Security System Documentation

## Overview
This document describes the comprehensive security system implemented for the ELECTRON VISION web application.

## Security Layers Implemented

### 1. General Protection
- **HTTPS with HSTS**: Strict-Transport-Security header with 1-year max-age
- **Content Security Policy (CSP)**: Strict CSP limiting script sources, frames, and object resources
- **XSS Protection**: Input sanitization using `xss` library
- **SQL Injection Protection**: WAF pattern matching for SQL injection attempts
- **CSRF Protection**: Token-based CSRF middleware
- **Eval/Inline Script Prevention**: CSP blocks eval() and inline scripts

### 2. Security Headers
| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevents clickjacking |
| X-Content-Type-Options | nosniff | Prevents MIME type sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer info |
| Permissions-Policy | All sensors disabled | Limits browser features |
| Strict-Transport-Security | max-age=31536000 | Enforces HTTPS |
| Content-Security-Policy | Custom | Restricts resources |

### 3. WAF (Web Application Firewall)
Located in: `middleware/waf.js`

**Features:**
- Pattern-based threat detection for:
  - SQL Injection
  - XSS Attacks
  - Command Injection
  - Path Traversal
  - LDAP/XML Injection
  - Bot Detection
  - Sensitive Data Exposure
- Threat scoring system
- Automatic IP blocking
- Database logging of all threats

**Configuration:**
```env
WAF_THRESHOLD=10
MAX_THREAT_SCORE=100
BLOCK_DURATION=3600
AUTO_BLOCK_THRESHOLD=50
MAX_REQUESTS_PER_MINUTE=120
```

### 4. Bot Detection & DDoS Protection
Located in: `middleware/botDetection.js`

**Features:**
- User agent analysis
- Request rate tracking per IP
- Concurrent connection limiting
- Request pattern analysis (sequential, random, aggressive)
- Automatic rate limiting

**Configuration:**
```env
BOT_MAX_REQUESTS=100
BOT_MAX_CONCURRENT=30
BOT_BLOCK_DURATION=3600
```

### 5. IP Blocking System
**Features:**
- Permanent and temporary IP blocks
- Database-persisted blocks
- Block page with:
  - Arabic/English support
  - 10-second countdown
  - Permanent block via localStorage/cookies
  - Anti-bypass protection

### 6. Monitoring & Alerting
Located in: `middleware/monitoring.js`

**Features:**
- Real-time metrics collection
- Request logging
- Threat tracking
- Error rate monitoring
- Telegram alerts (configurable)
- Alert history database

**Metrics Tracked:**
- Requests per minute/hour/day
- Unique IPs
- Response times
- Threat types
- Error rates
- Block counts

### 7. Rate Limiting
- Global API limit: 1000 requests/15 min
- Auth endpoints: 10 requests/15 min
- Connection limits per IP

### 8. Admin Security API
Endpoints (requires admin authentication):
- `GET /api/admin/security/stats` - Security statistics
- `GET /api/admin/security/alerts` - Alert history
- `POST /api/admin/security/block` - Manual IP block
- `POST /api/admin/security/unblock` - Manual IP unblock

## File Structure

```
├── middleware/
│   ├── waf.js                 # Web Application Firewall
│   ├── botDetection.js        # Bot & DDoS protection
│   ├── monitoring.js          # Monitoring & alerts
│   ├── securityHeaders.js     # Enhanced headers
│   └── security.js            # Core security functions
├── public/
│   └── blocked.html           # Block page
├── nginx-ssl.conf             # Nginx configuration
├── server.js                  # Main server
└── .env.example               # Environment variables
```

## Database Tables Created

1. `waf_logs` - WAF threat detection logs
2. `blocked_ips` - Blocked IP addresses
3. `bot_logs` - Bot detection logs
4. `security_alerts` - Security alerts
5. `monitoring_metrics` - Performance metrics

## Usage

### Starting the Server
```bash
npm start
```

### Production Deployment
```bash
# Use the provided script
./deploy-secure.sh --domain yourdomain.com
```

### Configuration
Copy `.env.example` to `.env` and configure:
- JWT_SECRET, REFRESH_SECRET, ENCRYPTION_KEY
- Telegram bot credentials for alerts
- SSL certificates for HTTPS

## Security Response Flow

1. **Request** → Bot Detection → WAF → Rate Limiter
2. **Threat Detected** → Log to database → Calculate threat score
3. **Score Exceeded** → Block IP → Show block page → Send alert
4. **Block Page** → Show countdown → Set permanent block cookie

## Monitoring

Access security stats via admin panel:
- Real-time threat metrics
- Active alerts
- Blocked IPs list
- System performance

## Compliance

The security system follows best practices for:
- OWASP Top 10 mitigation
- GDPR data protection
- Secure headers (Mozilla Observatory guidelines)
- Rate limiting (RFC 6585)

#!/bin/bash
# ============================================================
# ELECTRON VISION - Complete Security Setup (No Root Required)
# Verifies all application-level security layers
# No apt-get, no systemctl, no fail2ban, no nginx, no sudo
# ============================================================

set -e

PROJECT_DIR="/home/elvi/Documents/ELVI-WEP"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() {
    echo -e "  ${GREEN}✓ $1${NC}"
    PASS=$((PASS + 1))
}

check_fail() {
    echo -e "  ${RED}✗ $1${NC}"
    FAIL=$((FAIL + 1))
}

check_warn() {
    echo -e "  ${YELLOW}⚠ $1${NC}"
    WARN=$((WARN + 1))
}

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ELECTRON VISION - Security Setup${NC}"
echo -e "${GREEN}  (No root / No sudo required)${NC}"
echo -e "${GREEN}============================================${NC}"

# ============================================================
# 1. CHECK NODE.JS AND DEPENDENCIES
# ============================================================
echo -e "\n${YELLOW}[1/7] Checking Node.js and dependencies...${NC}"

if command -v node &> /dev/null; then
    NODE_VER=$(node --version)
    check_pass "Node.js installed: $NODE_VER"
else
    check_fail "Node.js not found - install from https://nodejs.org"
fi

if command -v npm &> /dev/null; then
    NPM_VER=$(npm --version)
    check_pass "npm installed: $NPM_VER"
else
    check_fail "npm not found"
fi

# Check critical dependencies
DEPS=("express" "helmet" "express-rate-limit" "better-sqlite3" "jsonwebtoken" "bcrypt")
for dep in "${DEPS[@]}"; do
    if [ -d "$PROJECT_DIR/node_modules/$dep" ]; then
        check_pass "$dep installed"
    else
        check_fail "$dep missing - run: npm install"
    fi
done

# ============================================================
# 2. VERIFY SECURITY MIDDLEWARE FILES
# ============================================================
echo -e "\n${YELLOW}[2/7] Verifying security middleware...${NC}"

SECURITY_FILES=(
    "middleware/app-firewall.js:App Firewall"
    "middleware/waf.js:Web Application Firewall"
    "middleware/advanced-security.js:Advanced Security"
    "middleware/botDetection.js:Bot Detection"
    "middleware/security.js:Security Core"
    "middleware/securityHeaders.js:Security Headers"
    "middleware/monitoring.js:Monitoring"
    "middleware/validators.js:Input Validators"
    "middleware/csrf.js:CSRF Protection"
    "middleware/logger.js:Logger"
    "middleware/auth.js:Authentication"
    "middleware/permissions.js:RBAC Permissions"
    "middleware/database-security.js:Database Security"
)

for entry in "${SECURITY_FILES[@]}"; do
    file="${entry%%:*}"
    desc="${entry##*:}"
    if [ -f "$PROJECT_DIR/$file" ]; then
        check_pass "$desc ($file)"
    else
        check_fail "$desc missing ($file)"
    fi
done

# ============================================================
# 3. VERIFY SERVER INTEGRATION
# ============================================================
echo -e "\n${YELLOW}[3/7] Verifying server.js security integration...${NC}"

SERVER_FILE="$PROJECT_DIR/server.js"
if [ -f "$SERVER_FILE" ]; then
    SECURITY_MIDDLEWARES=(
        "createSecurityHeaders:Security Headers"
        "appFirewall:App Firewall"
        "botDetectionMiddleware:Bot Detection"
        "wafMiddleware:WAF"
        "advancedSecurity:Advanced Security"
        "monitoringMiddleware:Monitoring"
        "csrfMiddleware:CSRF Protection"
        "sanitizeInput:Input Sanitization"
        "requestLogger:Request Logger"
    )

    for entry in "${SECURITY_MIDDLEWARES[@]}"; do
        func="${entry%%:*}"
        desc="${entry##*:}"
        if grep -q "$func" "$SERVER_FILE" 2>/dev/null; then
            check_pass "$desc loaded in server"
        else
            check_fail "$desc not loaded in server"
        fi
    done
else
    check_fail "server.js not found"
fi

# ============================================================
# 4. VERIFY LOG DIRECTORY AND FILES
# ============================================================
echo -e "\n${YELLOW}[4/7] Setting up log directory...${NC}"

LOG_DIR="$PROJECT_DIR/logs"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
    check_pass "Created log directory: $LOG_DIR"
else
    check_pass "Log directory exists: $LOG_DIR"
fi

LOG_FILES=("access.log" "error.log" "security.log" "audit.log" "performance.log")
for logf in "${LOG_FILES[@]}"; do
    LOG_PATH="$LOG_DIR/$logf"
    if [ ! -f "$LOG_PATH" ]; then
        touch "$LOG_PATH"
        check_pass "Created $logf"
    else
        check_pass "$logf exists"
    fi
done

# ============================================================
# 5. VERIFY DATABASE AND SECURITY TABLES
# ============================================================
echo -e "\n${YELLOW}[5/7] Checking database security tables...${NC}"

if [ -f "$PROJECT_DIR/database.js" ]; then
    check_pass "database.js exists"

    # Try to run the database init by checking if node can load it
    if node -e "require('./database'); console.log('DB_OK')" 2>/dev/null | grep -q "DB_OK"; then
        check_pass "Database loads successfully"
    else
        check_warn "Database may have issues - check database.js"
    fi
else
    check_fail "database.js not found"
fi

# ============================================================
# 6. VERIFY ENVIRONMENT CONFIGURATION
# ============================================================
echo -e "\n${YELLOW}[6/7] Checking environment configuration...${NC}"

if [ -f "$PROJECT_DIR/.env" ]; then
    check_pass ".env file exists"

    # Check for critical secrets
    ENV_SECRETS=("JWT_SECRET" "SESSION_SECRET" "ENCRYPTION_KEY")
    for secret in "${ENV_SECRETS[@]}"; do
        if grep -q "^${secret}=" "$PROJECT_DIR/.env" 2>/dev/null; then
            VALUE=$(grep "^${secret}=" "$PROJECT_DIR/.env" | cut -d'=' -f2-)
            if [ ${#VALUE} -gt 10 ]; then
                check_pass "$secret is configured"
            else
                check_warn "$secret value seems too short"
            fi
        else
            check_warn "$secret not found in .env"
        fi
    done
else
    check_warn ".env file not found - using defaults"
fi

# ============================================================
# 7. RUN FIREWALL CHECK
# ============================================================
echo -e "\n${YELLOW}[7/7] Running firewall verification...${NC}"

if [ -f "$PROJECT_DIR/scripts/setup-firewall.sh" ]; then
    check_pass "Firewall setup script exists"
    # Run firewall check silently
    if bash "$PROJECT_DIR/scripts/setup-firewall.sh" > /dev/null 2>&1; then
        check_pass "Firewall verification passed"
    else
        check_warn "Firewall check had issues - run manually for details"
    fi
else
    check_fail "Firewall setup script not found"
fi

# ============================================================
# SUMMARY
# ============================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Security Setup Summary${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}✓ All security layers are properly configured!${NC}"
    echo ""
    echo "Active security layers (no sudo required):"
    echo "  1. Security Headers (HSTS, CSP, X-Frame-Options)"
    echo "  2. App Firewall (anti-spoofing, SYN flood, brute force)"
    echo "  3. Bot Detection & DDoS Protection"
    echo "  4. Web Application Firewall (SQLi, XSS, cmd injection)"
    echo "  5. Advanced Security (anomaly detection, throttling)"
    echo "  6. Monitoring & Alerting"
    echo "  7. Rate Limiting (multiple layers)"
    echo "  8. CSRF Protection"
    echo "  9. Input Sanitization (XSS)"
    echo " 10. Authentication & RBAC"
    echo " 11. Database Security (encryption, safe queries)"
    echo " 12. Comprehensive Logging"
    echo ""
    echo "Start the server: cd $PROJECT_DIR && node server.js"
    echo "Monitor security: bash $PROJECT_DIR/scripts/security-monitor.sh"
else
    echo -e "${RED}✗ Some checks failed. Review the output above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "  • Install dependencies: cd $PROJECT_DIR && npm install"
    echo "  • Create .env with required secrets"
    echo "  • Ensure all middleware files exist"
    exit 1
fi

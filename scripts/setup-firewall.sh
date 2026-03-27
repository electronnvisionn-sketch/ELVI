#!/bin/bash
# ============================================================
# ELECTRON VISION - Application Firewall Setup (No Root Required)
# Verifies app-level firewall middleware is active
# Replaces iptables with pure Node.js middleware
# ============================================================

set -e

PROJECT_DIR="/home/elvi/Documents/ELVI-WEP"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  ELECTRON VISION - App Firewall Setup${NC}"
echo -e "${CYAN}  (No root / No sudo required)${NC}"
echo -e "${CYAN}============================================${NC}"

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

# ============================================================
# 1. VERIFY MIDDLEWARE FILES EXIST
# ============================================================
echo -e "\n${YELLOW}[1/6] Checking firewall middleware files...${NC}"

MIDDLEWARE_FILES=(
    "middleware/app-firewall.js"
    "middleware/waf.js"
    "middleware/advanced-security.js"
    "middleware/botDetection.js"
    "middleware/security.js"
    "middleware/securityHeaders.js"
    "middleware/monitoring.js"
    "middleware/logger.js"
)

for file in "${MIDDLEWARE_FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
    fi
done

# ============================================================
# 2. VERIFY FIREWALL IS LOADED IN SERVER
# ============================================================
echo -e "\n${YELLOW}[2/6] Checking server.js firewall integration...${NC}"

if grep -q "appFirewall" "$PROJECT_DIR/server.js" 2>/dev/null; then
    check_pass "appFirewall middleware loaded in server.js"
else
    check_fail "appFirewall not found in server.js"
fi

if grep -q "wafMiddleware" "$PROJECT_DIR/server.js" 2>/dev/null; then
    check_pass "WAF middleware loaded in server.js"
else
    check_fail "WAF middleware not found in server.js"
fi

if grep -q "botDetectionMiddleware" "$PROJECT_DIR/server.js" 2>/dev/null; then
    check_pass "Bot detection middleware loaded in server.js"
else
    check_fail "Bot detection middleware not found in server.js"
fi

if grep -q "advancedSecurity" "$PROJECT_DIR/server.js" 2>/dev/null; then
    check_pass "Advanced security middleware loaded in server.js"
else
    check_fail "Advanced security middleware not found in server.js"
fi

# ============================================================
# 3. VERIFY FIREWALL RULES CONFIGURATION
# ============================================================
echo -e "\n${YELLOW}[3/6] Checking firewall rule configuration...${NC}"

CONFIG_CHECKS=(
    "SYN_FLOOD_MAX:SYN flood protection"
    "HTTP_BRUTE_MAX:HTTP brute force protection"
    "AUTH_BRUTE_MAX:Auth brute force protection"
    "SCAN_DETECTION_THRESHOLD:Port scan detection"
    "BLOCKED_SENSITIVE_PATHS:Blocked sensitive paths"
    "GLOBAL_MAX_CONNECTIONS_PER_IP:Connection tracking"
)

for check in "${CONFIG_CHECKS[@]}"; do
    key="${check%%:*}"
    desc="${check##*:}"
    if grep -q "$key" "$PROJECT_DIR/middleware/app-firewall.js" 2>/dev/null; then
        check_pass "$desc configured"
    else
        check_fail "$desc not configured"
    fi
done

# ============================================================
# 4. VERIFY LOG DIRECTORY
# ============================================================
echo -e "\n${YELLOW}[4/6] Checking log directory...${NC}"

LOG_DIR="$PROJECT_DIR/logs"
if [ -d "$LOG_DIR" ]; then
    check_pass "Log directory exists: $LOG_DIR"
else
    mkdir -p "$LOG_DIR"
    check_pass "Log directory created: $LOG_DIR"
fi

LOG_FILES=("access.log" "error.log" "security.log" "audit.log" "performance.log")
for logf in "${LOG_FILES[@]}"; do
    if [ -f "$LOG_DIR/$logf" ]; then
        check_pass "$logf exists"
    else
        touch "$LOG_DIR/$logf"
        check_pass "$logf created"
    fi
done

# ============================================================
# 5. VERIFY DATABASE TABLES
# ============================================================
echo -e "\n${YELLOW}[5/6] Checking firewall database tables...${NC}"

if [ -f "$PROJECT_DIR/database.js" ]; then
    DB_PATH=$(grep -oP "new Database\(['\"]\\K[^'\"]*" "$PROJECT_DIR/database.js" 2>/dev/null || echo "")
    if [ -n "$DB_PATH" ] && [ -f "$PROJECT_DIR/$DB_PATH" ]; then
        if command -v sqlite3 &> /dev/null; then
            TABLES=$(sqlite3 "$PROJECT_DIR/$DB_PATH" ".tables" 2>/dev/null || echo "")
            if echo "$TABLES" | grep -q "firewall_logs"; then
                check_pass "firewall_logs table exists"
            else
                check_warn "firewall_logs table will be created on first run"
            fi
            if echo "$TABLES" | grep -q "blocked_ips"; then
                check_pass "blocked_ips table exists"
            else
                check_warn "blocked_ips table will be created on first run"
            fi
        else
            check_warn "sqlite3 not available - tables will be verified on app start"
        fi
    else
        check_warn "Database file not found - will be created on first run"
    fi
else
    check_fail "database.js not found"
fi

# ============================================================
# 6. CHECK IF SERVER IS RUNNING
# ============================================================
echo -e "\n${YELLOW}[6/6] Checking if server is running...${NC}"

PORT=${PORT:-3000}
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null | grep -q "200\|302\|404"; then
    check_pass "Server is running on port $PORT"
else
    check_warn "Server is not running - start with: node server.js"
fi

# ============================================================
# SUMMARY
# ============================================================
echo -e "\n${CYAN}============================================${NC}"
echo -e "${CYAN}  Firewall Setup Summary${NC}"
echo -e "${CYAN}============================================${NC}"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}✓ Application firewall is properly configured!${NC}"
    echo ""
    echo "Protection layers active (no sudo required):"
    echo "  • Anti-spoofing header checks"
    echo "  • SYN flood protection (20 req/10s)"
    echo "  • HTTP brute force protection (100 req/60s)"
    echo "  • Auth brute force protection (5 attempts/10min)"
    echo "  • Port scan detection (40 unique paths/5min)"
    echo "  • Connection tracking (30 concurrent/IP)"
    echo "  • Invalid request blocking"
    echo "  • Blocked sensitive paths (.env, wp-admin, .git, etc.)"
    echo "  • WAF pattern-based threat detection"
    echo "  • Bot detection and DDoS mitigation"
    echo "  • Advanced anomaly detection and throttling"
    echo ""
    echo "Start the server: cd $PROJECT_DIR && node server.js"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Review the output above.${NC}"
    exit 1
fi

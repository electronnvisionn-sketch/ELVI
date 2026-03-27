#!/bin/bash
# ============================================================
# ELECTRON VISION - Security Monitor (No Root Required)
# Reads local JSON logs and queries app API for security stats
# No iptables, no fail2ban-client, no sudo
# ============================================================

PROJECT_DIR="/home/elvi/Documents/ELVI-WEP"
LOG_DIR="$PROJECT_DIR/logs"
ACCESS_LOG="$LOG_DIR/access.log"
ERROR_LOG="$LOG_DIR/error.log"
SECURITY_LOG="$LOG_DIR/security.log"
AUDIT_LOG="$LOG_DIR/audit.log"

# API config (optional - for live stats from running server)
API_URL="http://localhost:${PORT:-3000}"
API_TOKEN=""

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --token) API_TOKEN="$2"; shift 2 ;;
        --port) API_URL="http://localhost:$2"; shift 2 ;;
        *) shift ;;
    esac
done

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  ELECTRON VISION Security Monitor${NC}"
echo -e "${CYAN}  (No root / No sudo required)${NC}"
echo -e "${CYAN}  $(date)${NC}"
echo -e "${CYAN}============================================${NC}"

# ============================================================
# CHECK 1: Failed login attempts
# ============================================================
echo -e "\n${YELLOW}[CHECK] Failed login attempts:${NC}"
if [ -f "$ACCESS_LOG" ] && [ -s "$ACCESS_LOG" ]; then
    FAILED_LOGINS=$(grep '"status":40[13]' "$ACCESS_LOG" 2>/dev/null | wc -l)
    FAILED_LOGINS=${FAILED_LOGINS:-0}
    LOGIN_FAILURES=$(grep '"status":40[13]' "$ACCESS_LOG" 2>/dev/null | grep -ci "login\|auth" || echo "0")
    LOGIN_FAILURES=${LOGIN_FAILURES:-0}
    echo "  401/403 responses: $FAILED_LOGINS"
    echo "  Auth endpoint failures: $LOGIN_FAILURES"
    if [ "$LOGIN_FAILURES" -gt 20 ]; then
        echo -e "  ${RED}HIGH: Possible brute force attack!${NC}"
    elif [ "$LOGIN_FAILURES" -gt 5 ]; then
        echo -e "  ${YELLOW}WARNING: Elevated failed login count${NC}"
    else
        echo -e "  ${GREEN}Normal${NC}"
    fi
else
    echo "  No access log found"
fi

# ============================================================
# CHECK 2: Rate limit violations (429 responses)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Rate limit violations:${NC}"
if [ -f "$ACCESS_LOG" ] && [ -s "$ACCESS_LOG" ]; then
    RATE_HITS=$(grep '"status":429' "$ACCESS_LOG" 2>/dev/null | wc -l)
    RATE_HITS=${RATE_HITS:-0}
    echo "  429 responses (total): $RATE_HITS"
    if [ "$RATE_HITS" -gt 50 ]; then
        echo -e "  ${RED}HIGH: Excessive rate limiting!${NC}"
    elif [ "$RATE_HITS" -gt 10 ]; then
        echo -e "  ${YELLOW}WARNING: Elevated rate limit hits${NC}"
    else
        echo -e "  ${GREEN}Normal${NC}"
    fi
else
    echo "  No access log found"
fi

# ============================================================
# CHECK 3: Error responses (4xx, 5xx)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Error responses:${NC}"
if [ -f "$ACCESS_LOG" ] && [ -s "$ACCESS_LOG" ]; then
    TOTAL_4XX=$(grep -E '"status":4[0-9][0-9]' "$ACCESS_LOG" 2>/dev/null | wc -l)
    TOTAL_4XX=${TOTAL_4XX:-0}
    TOTAL_5XX=$(grep -E '"status":5[0-9][0-9]' "$ACCESS_LOG" 2>/dev/null | wc -l)
    TOTAL_5XX=${TOTAL_5XX:-0}
    echo "  4xx errors: $TOTAL_4XX"
    echo "  5xx errors: $TOTAL_5XX"
    if [ "$TOTAL_5XX" -gt 10 ]; then
        echo -e "  ${RED}WARNING: High server error rate${NC}"
    elif [ "$TOTAL_5XX" -gt 0 ]; then
        echo -e "  ${YELLOW}Some server errors detected${NC}"
    else
        echo -e "  ${GREEN}Normal${NC}"
    fi
else
    echo "  No access log found"
fi

# ============================================================
# CHECK 4: Security events from security log
# ============================================================
echo -e "\n${YELLOW}[CHECK] Security events:${NC}"
if [ -f "$SECURITY_LOG" ] && [ -s "$SECURITY_LOG" ]; then
    SECURITY_TOTAL=$(wc -l < "$SECURITY_LOG" 2>/dev/null || echo "0")
    SECURITY_TOTAL=${SECURITY_TOTAL// /}
    echo "  Total security events: $SECURITY_TOTAL"

    if [ "$SECURITY_TOTAL" -gt 0 ]; then
        echo "  Recent security events:"
        tail -5 "$SECURITY_LOG" 2>/dev/null | while read -r line; do
            # Extract level and message from JSON
            LEVEL=$(echo "$line" | grep -oP '"level":"[^"]*"' | head -1 | cut -d'"' -f4)
            MSG=$(echo "$line" | grep -oP '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$MSG" ]; then
                echo "    [$LEVEL] $MSG"
            fi
        done
    fi
else
    echo "  No security log found"
fi

# ============================================================
# CHECK 5: Top IPs by request count
# ============================================================
echo -e "\n${YELLOW}[CHECK] Top IPs by request count:${NC}"
if [ -f "$ACCESS_LOG" ] && [ -s "$ACCESS_LOG" ]; then
    grep -oP '"ip":"[^"]*"' "$ACCESS_LOG" 2>/dev/null | cut -d'"' -f4 | sort | uniq -c | sort -rn | head -10 | while read -r count ip; do
        echo "  $ip: $count requests"
    done
else
    echo "  No access log found"
fi

# ============================================================
# CHECK 6: Top requested endpoints
# ============================================================
echo -e "\n${YELLOW}[CHECK] Most requested endpoints:${NC}"
if [ -f "$ACCESS_LOG" ] && [ -s "$ACCESS_LOG" ]; then
    grep -oP '"url":"[^"]*"' "$ACCESS_LOG" 2>/dev/null | cut -d'"' -f4 | sort | uniq -c | sort -rn | head -10 | while read -r count url; do
        echo "  $url: $count"
    done
else
    echo "  No access log found"
fi

# ============================================================
# CHECK 7: Blocked path scanners (from security log)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Scanner/bot detection:${NC}"
if [ -f "$SECURITY_LOG" ] && [ -s "$SECURITY_LOG" ]; then
    BLOCKED_PATHS=$(grep -i "BLOCKED_PATH\|blocked.path\|scan\|scanner" "$SECURITY_LOG" 2>/dev/null | wc -l)
    BLOCKED_PATHS=${BLOCKED_PATHS:-0}
    echo "  Blocked/scan events: $BLOCKED_PATHS"
    if [ "$BLOCKED_PATHS" -gt 10 ]; then
        echo -e "  ${RED}WARNING: Multiple scanner attempts blocked${NC}"
    elif [ "$BLOCKED_PATHS" -gt 0 ]; then
        echo -e "  ${YELLOW}Some scanner activity detected${NC}"
    else
        echo -e "  ${GREEN}Normal${NC}"
    fi
else
    echo "  No security log found"
fi

# ============================================================
# CHECK 8: Error log analysis
# ============================================================
echo -e "\n${YELLOW}[CHECK] Error log:${NC}"
if [ -f "$ERROR_LOG" ] && [ -s "$ERROR_LOG" ]; then
    ERROR_COUNT=$(wc -l < "$ERROR_LOG" 2>/dev/null || echo "0")
    ERROR_COUNT=${ERROR_COUNT// /}
    echo "  Total error entries: $ERROR_COUNT"
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "  Recent errors:"
        tail -3 "$ERROR_LOG" 2>/dev/null | while read -r line; do
            MSG=$(echo "$line" | grep -oP '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$MSG" ]; then
                echo "    $MSG"
            fi
        done
    fi
else
    echo "  No error log found"
fi

# ============================================================
# CHECK 9: Active connections (using ss, no sudo needed)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Active connections:${NC}"
if command -v ss &> /dev/null; then
    PORT_NUM=${PORT:-3000}
    ESTABLISHED=$(ss -t state established 2>/dev/null | tail -n +2 | wc -l)
    TIME_WAIT=$(ss -t state time-wait 2>/dev/null | tail -n +2 | wc -l)
    LISTEN=$(ss -tln 2>/dev/null | grep -c ":${PORT_NUM}" || true)
    LISTEN=${LISTEN:-0}
    echo "  Established: $ESTABLISHED"
    echo "  Time-wait: $TIME_WAIT"
    if [ "$LISTEN" -gt 0 ]; then
        echo -e "  ${GREEN}Server listening on port $PORT_NUM${NC}"
    else
        echo -e "  ${RED}Server not listening on port $PORT_NUM${NC}"
    fi
else
    echo "  ss command not available"
fi

# ============================================================
# CHECK 10: Live API stats (if server is running and token provided)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Live server status:${NC}"
SERVER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$API_URL/" 2>/dev/null)
SERVER_RESPONSE=${SERVER_RESPONSE:-000}
if [ "$SERVER_RESPONSE" != "000" ] && [ "$SERVER_RESPONSE" != "000000" ]; then
    echo -e "  ${GREEN}Server is running (HTTP $SERVER_RESPONSE)${NC}"

    if [ -n "$API_TOKEN" ]; then
        echo "  Querying security API..."
        STATS=$(curl -s -H "Authorization: Bearer $API_TOKEN" --connect-timeout 5 "$API_URL/api/admin/security/stats" 2>/dev/null)
        if [ -n "$STATS" ] && echo "$STATS" | grep -q "firewall"; then
            echo "  Firewall stats:"
            echo "$STATS" | node -e "
                const data = require('fs').readFileSync('/dev/stdin','utf8');
                try {
                    const d = JSON.parse(data);
                    if(d.firewall) {
                        console.log('    Total blocks: ' + (d.firewall.totalBlocks||0));
                        console.log('    Today blocks: ' + (d.firewall.todayBlocks||0));
                        console.log('    Active blocked IPs: ' + (d.firewall.activeBlockedIPs||0));
                        console.log('    Tracked IPs: ' + (d.firewall.trackedIPs||0));
                    }
                    if(d.blockedCount !== undefined) {
                        console.log('    WAF blocked IPs: ' + d.blockedCount);
                    }
                    if(d.alerts && d.alerts.length > 0) {
                        console.log('    Active alerts: ' + d.alerts.length);
                    }
                } catch(e) { console.log('    Could not parse stats'); }
            " 2>/dev/null || echo "    Could not parse API response"
        fi
    else
        echo "  Pass --token <admin_token> for live security stats"
    fi
else
    echo -e "  ${YELLOW}Server is not running - start with: node server.js${NC}"
fi

# ============================================================
# CHECK 11: Recent audit log
# ============================================================
echo -e "\n${YELLOW}[CHECK] Recent audit events:${NC}"
if [ -f "$AUDIT_LOG" ] && [ -s "$AUDIT_LOG" ]; then
    AUDIT_COUNT=$(wc -l < "$AUDIT_LOG" 2>/dev/null || echo "0")
    AUDIT_COUNT=${AUDIT_COUNT// /}
    echo "  Total audit entries: $AUDIT_COUNT"
    if [ "$AUDIT_COUNT" -gt 0 ]; then
        echo "  Recent events:"
        tail -3 "$AUDIT_LOG" 2>/dev/null | while read -r line; do
            MSG=$(echo "$line" | grep -oP '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$MSG" ]; then
                echo "    $MSG"
            fi
        done
    fi
else
    echo "  No audit log found"
fi

# ============================================================
# CHECK 12: Log file sizes (disk usage)
# ============================================================
echo -e "\n${YELLOW}[CHECK] Log file sizes:${NC}"
if [ -d "$LOG_DIR" ]; then
    for logf in "$LOG_DIR"/*.log; do
        if [ -f "$logf" ]; then
            SIZE=$(du -h "$logf" 2>/dev/null | cut -f1)
            NAME=$(basename "$logf")
            echo "  $NAME: $SIZE"
        fi
    done
    TOTAL_SIZE=$(du -sh "$LOG_DIR" 2>/dev/null | cut -f1)
    echo "  Total: $TOTAL_SIZE"
fi

# ============================================================
# SUMMARY
# ============================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "  Monitor complete: $(date)"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Security layers active (application-level):"
echo "  App Firewall | WAF | Bot Detection | Advanced Security"
echo "  Rate Limiting | CSRF | Input Sanitization | Monitoring"
echo ""
echo "Useful commands:"
echo "  View logs:     tail -f $LOG_DIR/security.log"
echo "  Start server:  cd $PROJECT_DIR && node server.js"
echo "  Live stats:    bash $0 --token <admin_jwt_token>"

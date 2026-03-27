#!/bin/bash
# ============================================================
# ELECTRON VISION - Production Server Setup
# Ubuntu 22.04/20.04 | Node.js + PM2 + Nginx + SSL + Firewall
# ============================================================
set -euo pipefail
IFS=$'\n\t'

# ---- Configuration ----
APP_NAME="electron-vision"
APP_DIR="/home/elvi/Documents/ELVI-WEP"
APP_PORT=3000
DOMAIN="${1:-localhost}"
EMAIL="${2:-admin@${DOMAIN}}"
NODE_VERSION="20"
PM2_INSTANCES="max"
LOG_DIR="/var/log/${APP_NAME}"
BACKUP_DIR="/var/backups/${APP_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}==== $1 ====${NC}"; }

# ---- Root Check ----
if [[ $EUID -ne 0 ]]; then
   err "Run as root: sudo bash $0 domain email"
   exit 1
fi

step "1/12  SYSTEM UPDATE & BASE PACKAGES"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  software-properties-common apt-transport-https \
  ca-certificates gnupg lsb-release \
  htop iotop sysstat nload \
  logrotate cron \
  ufw fail2ban \
  nginx libnginx-mod-http-headers-more-filter libnginx-mod-http-brotli-filter \
  certbot python3-certbot-nginx
log "Base packages installed"

step "2/12  NODE.JS ${NODE_VERSION}"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node.js $(node -v) | npm $(npm -v)"

step "3/12  PM2 GLOBALLY"
npm install -g pm2@latest 2>/dev/null
log "PM2 $(pm2 -v)"

step "4/12  APP DEPENDENCIES"
cd "$APP_DIR"
npm ci --production 2>/dev/null || npm install --production
log "Dependencies installed"

step "5/12  PM2 ECOSYSTEM CONFIG"
cat > "${APP_DIR}/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'electron-vision',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=2048 --optimize-for-size',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      UV_THREADPOOL_SIZE: 128
    },
    error_file: '/var/log/electron-vision/error.log',
    out_file: '/var/log/electron-vision/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    kill_timeout: 5000,
    listen_timeout: 10000,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    combine_logs: true,
    // Graceful shutdown
    shutdown_with_message: true,
    // Cluster balancing
    instance_var: 'INSTANCE_ID',
  }]
};
PM2EOF
log "ecosystem.config.js created"

step "6/12  SYSTEM LIMITS & KERNEL TUNING"
cat > /etc/sysctl.d/99-electron-vision.conf << 'SYSEOF'
# Network performance
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216

# File descriptors
fs.file-max = 2097152
fs.nr_open = 2097152

# Security
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_tw_buckets = 2000000
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_timestamps = 0
SYSEOF
sysctl --system >/dev/null 2>&1
log "Kernel tuned"

cat > /etc/security/limits.d/99-electron-vision.conf << 'LIMEOF'
*    soft    nofile    1048576
*    hard    nofile    1048576
root soft    nofile    1048576
root hard    nofile    1048576
*    soft    nproc     65535
*    hard    nproc     65535
LIMEOF
log "File descriptor limits set"

step "7/12  NGINX CONFIGURATION"
mkdir -p /etc/nginx/snippets

# Gzip snippet
cat > /etc/nginx/snippets/gzip.conf << 'NGEOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types
  text/plain text/css text/xml text/javascript
  application/json application/javascript application/xml
  application/rss+xml application/atom+xml
  application/x-javascript application/xhtml+xml
  image/svg+xml font/woff2;
gzip_disable "msie6";
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml application/rss+xml application/atom+xml application/x-javascript image/svg+xml font/woff2;
NGEOF

# Rate limit snippet
cat > /etc/nginx/snippets/rate-limits.conf << 'NGEOF'
limit_req_zone $binary_remote_addr zone=general:20m rate=30r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=15r/s;
limit_req_zone $binary_remote_addr zone=auth:5m rate=3r/s;
limit_req_zone $binary_remote_addr zone=upload:5m rate=2r/s;
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
NGEOF

# Main site config
cat > /etc/nginx/sites-available/${APP_NAME} << NGEOF
# Rate limits
include /etc/nginx/snippets/rate-limits.conf;

# Upstream
upstream ${APP_NAME}_cluster {
    least_conn;
    server 127.0.0.1:${APP_PORT};
    keepalive 256;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Certbot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # SSL (managed by certbot)
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security headers
    server_tokens off;
    more_clear_headers Server;
    more_set_headers 'Server: EV-Server';
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Request limits
    client_max_body_size 20G;
    client_body_buffer_size 128k;
    client_body_timeout 300s;
    client_header_timeout 30s;
    send_timeout 300s;

    # Timeouts
    proxy_connect_timeout 30s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;

    # Block scanners
    location ~* /\.(env|git|svn|htaccess) { access_log /var/log/nginx/blocked.log; return 404; }
    location ~* /(wp-admin|wp-login|xmlrpc|phpmyadmin|admin\.php|config\.php|cgi-bin|setup\.cgi|boaform) { access_log /var/log/nginx/blocked.log; return 404; }
    location ~* /(actuator|debug|console|shell|server-status) { access_log /var/log/nginx/blocked.log; return 404; }

    # Static files with caching
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp3|mp4|webm|webp)$ {
        proxy_pass http://${APP_NAME}_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Uploads
    location /uploads {
        proxy_pass http://${APP_NAME}_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        limit_req zone=upload burst=5 nodelay;
        proxy_max_temp_file_size 0;
        proxy_buffering off;
    }

    # Auth endpoints (strict)
    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        limit_conn conn_per_ip 5;
        proxy_pass http://${APP_NAME}_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_conn conn_per_ip 20;
        proxy_pass http://${APP_NAME}_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Socket.io
    location /socket.io/ {
        proxy_pass http://${APP_NAME}_cluster;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # Everything else
    location / {
        limit_req zone=general burst=50 nodelay;
        limit_conn conn_per_ip 30;
        proxy_pass http://${APP_NAME}_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Logging
    access_log /var/log/nginx/${APP_NAME}-access.log combined buffer=512k flush=5s;
    error_log  /var/log/nginx/${APP_NAME}-error.log warn;
}
NGEOF

# Create empty blocked log
touch /var/log/nginx/blocked.log

# Enable site
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>/dev/null && log "Nginx config valid" || err "Nginx config invalid"
NGEOF

step "8/12  SSL CERTIFICATE"
if [[ "$DOMAIN" != "localhost" ]]; then
  # Temporarily start nginx for certbot
  systemctl start nginx 2>/dev/null || true
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect 2>/dev/null && log "SSL obtained" || warn "SSL failed - run: certbot --nginx -d $DOMAIN"
else
  # Self-signed for localhost
  mkdir -p /etc/letsencrypt/live/localhost
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/localhost/privkey.pem \
    -out /etc/letsencrypt/live/localhost/fullchain.pem \
    -subj "/CN=localhost" 2>/dev/null
  log "Self-signed SSL created"
fi

step "9/12  FIREWALL (UFW)"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
# Rate limit SSH
ufw limit 22/tcp
# Block everything else
ufw --force enable
log "Firewall active"

# iptables SYN flood protection
iptables -A INPUT -p tcp --syn -m limit --limit 10/s --limit-burst 20 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP
iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
# Save
iptables-save > /etc/iptables.rules 2>/dev/null
log "iptables rules applied"

step "10/12  FAIL2BAN"
cat > /etc/fail2ban/jail.local << 'F2BEOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
port     = http,https
filter   = nginx-http-auth
logpath  = /var/log/nginx/*error.log
maxretry = 5

[nginx-botsearch]
enabled  = true
port     = http,https
filter   = nginx-botsearch
logpath  = /var/log/nginx/*access.log
maxretry = 3
bantime  = 86400

[nginx-limit-req]
enabled  = true
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/*error.log
maxretry = 5
bantime  = 1800

[nginx-badbots]
enabled  = true
port     = http,https
filter   = nginx-badbots
logpath  = /var/log/nginx/*access.log
maxretry = 10
bantime  = 7200
F2BEOF

systemctl enable fail2ban
systemctl restart fail2ban
log "Fail2Ban configured"

step "11/12  LOGS & DIRECTORIES"
mkdir -p "$LOG_DIR" /var/log/nginx /etc/letsencrypt
touch /var/log/nginx/blocked.log

cat > /etc/logrotate.d/${APP_NAME} << LREOF
${LOG_DIR}/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
/var/log/nginx/${APP_NAME}-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 \$(cat /var/run/nginx.pid) || true
    endscript
}
LREOF
log "Log rotation configured"

step "12/12  PM2 STARTUP & LAUNCH"
# PM2 startup
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Stop existing
pm2 delete all 2>/dev/null || true

# Start app
cd "$APP_DIR"
NODE_ENV=production pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Install PM2 log rotation
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

log "PM2 started with cluster mode"

# Start/restart services
systemctl enable nginx
systemctl restart nginx
log "Nginx started"

# ============================================================
# MONITORING CRON JOBS
# ============================================================
step "BONUS: MONITORING & ALERTS"

# System monitor script
cat > /usr/local/bin/server-monitor << 'MONEOF'
#!/bin/bash
# Quick system health check
echo "=== $(date) ==="
echo "--- CPU ---"
uptime
echo "--- MEMORY ---"
free -h
echo "--- DISK ---"
df -h /
echo "--- CONNECTIONS ---"
ss -s
echo "--- PM2 ---"
pm2 list 2>/dev/null | head -20
echo "--- NGINX ---"
systemctl is-active nginx
echo "--- FAIL2BAN ---"
fail2ban-client status 2>/dev/null | grep "Jail list" || echo "not running"
echo "--- TOP IPs (last hour) ---"
tail -1000 /var/log/nginx/*access.log 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -5
echo "--- 429/403 hits ---"
grep -c " 429 \| 403 " /var/log/nginx/*access.log 2>/dev/null || echo 0
echo "========================"
MONEOF
chmod +x /usr/local/bin/server-monitor

# Daily report cron
cat > /etc/cron.daily/${APP_NAME}-report << 'CRONEOF'
#!/bin/bash
REPORT="/var/log/electron-vision/daily-$(date +%Y%m%d).log"
{
  echo "=== DAILY REPORT $(date) ==="
  echo "--- UPTIME ---"
  uptime
  echo "--- MEMORY ---"
  free -h
  echo "--- DISK ---"
  df -h /
  echo "--- PM2 STATUS ---"
  pm2 list 2>/dev/null
  echo "--- TOP 10 IPs (24h) ---"
  cat /var/log/nginx/*access.log 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10
  echo "--- BLOCKED REQUESTS ---"
  wc -l /var/log/nginx/blocked.log 2>/dev/null
  echo "--- FAIL2BAN ---"
  fail2ban-client status 2>/dev/null
  echo "--- FAILED LOGINS ---"
  grep -c "401\|403" /var/log/nginx/*access.log 2>/dev/null || echo 0
  echo "=== END REPORT ==="
} > "$REPORT" 2>&1
CRONEOF
chmod +x /etc/cron.daily/${APP_NAME}-report
log "Monitoring cron installed"

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}${BOLD}============================================${NC}"
echo ""
echo -e "  Domain:      ${CYAN}${DOMAIN}${NC}"
echo -e "  App Port:    ${CYAN}${APP_PORT}${NC}"
echo -e "  App Dir:     ${CYAN}${APP_DIR}${NC}"
echo -e "  Logs:        ${CYAN}${LOG_DIR}${NC}"
echo -e "  Node:        ${CYAN}$(node -v)${NC}"
echo -e "  PM2 Mode:    ${CYAN}Cluster (all cores)${NC}"
echo -e "  SSL:         ${CYAN}$(ls /etc/letsencrypt/live/${DOMAIN}/fullchain.pem 2>/dev/null && echo 'Active' || echo 'Pending')${NC}"
echo ""
echo -e "${YELLOW}Services:${NC}"
echo -e "  $(systemctl is-active nginx 2>/dev/null | grep -q active && echo '✓' || echo '✗') Nginx"
echo -e "  $(systemctl is-active fail2ban 2>/dev/null | grep -q active && echo '✓' || echo '✗') Fail2Ban"
echo -e "  $(pm2 list 2>/dev/null | grep -q online && echo '✓' || echo '✗') PM2 Cluster"
echo ""
echo -e "${YELLOW}Commands:${NC}"
echo -e "  Monitor:     ${CYAN}server-monitor${NC}"
echo -e "  PM2 logs:    ${CYAN}pm2 logs${NC}"
echo -e "  PM2 monit:   ${CYAN}pm2 monit${NC}"
echo -e "  Nginx logs:  ${CYAN}tail -f /var/log/nginx/${APP_NAME}-error.log${NC}"
echo -e "  Fail2Ban:    ${CYAN}fail2ban-client status${NC}"
echo -e "  Restart app: ${CYAN}pm2 restart all${NC}"
echo -e "  Firewall:    ${CYAN}ufw status${NC}"
echo ""

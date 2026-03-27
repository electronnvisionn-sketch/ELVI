#!/bin/bash
# ============================================================
# ELECTRON VISION - Full Security Setup
# Run with: sudo bash scripts/setup-full.sh
# ============================================================
set -e

APP_DIR="/home/elvi/Documents/ELVI-WEP"
APP_USER="elvi"
APP_PORT=3000
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ELECTRON VISION - Full Security Setup${NC}"
echo -e "${GREEN}============================================${NC}"

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Run as root: sudo bash $0${NC}"
  exit 1
fi

# ============================================================
# 1. SUDO PERMISSIONS FOR FIREWALL COMMANDS
# ============================================================
echo -e "\n${YELLOW}[1/8] Setting up sudo permissions...${NC}"

cat > /etc/sudoers.d/electron-vision << 'SUDOERS'
# Allow elvi to run firewall commands without password
elvi ALL=(ALL) NOPASSWD: /usr/sbin/iptables
elvi ALL=(ALL) NOPASSWD: /usr/sbin/iptables-restore
elvi ALL=(ALL) NOPASSWD: /usr/sbin/iptables-save
elvi ALL=(ALL) NOPASSWD: /usr/sbin/ufw
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl start fail2ban
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop fail2ban
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart fail2ban
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl status fail2ban
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl start nginx
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop nginx
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
elvi ALL=(ALL) NOPASSWD: /usr/bin/systemctl status nginx
elvi ALL=(ALL) NOPASSWD: /usr/sbin/fail2ban-client
elvi ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
SUDOERS
chmod 0440 /etc/sudoers.d/electron-vision
visudo -c 2>/dev/null && echo -e "  ${GREEN}✓ Sudoers valid${NC}" || echo -e "  ${RED}✗ Sudoers error${NC}"

# ============================================================
# 2. INSTALL PACKAGES
# ============================================================
echo -e "\n${YELLOW}[2/8] Installing packages...${NC}"
apt-get update -qq
apt-get install -y -qq nginx fail2ban iptables-persistent conntrack ss lsof sysstat iotop nload jq

# ============================================================
# 3. NGINX CONFIG
# ============================================================
echo -e "\n${YELLOW}[3/8] Configuring Nginx...${NC}"

mkdir -p /etc/nginx/snippets /var/log/nginx
touch /var/log/nginx/blocked.log

cat > /etc/nginx/snippets/rate-limits.conf << 'NGEOF'
limit_req_zone $binary_remote_addr zone=general:20m rate=30r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=15r/s;
limit_req_zone $binary_remote_addr zone=auth:5m rate=3r/s;
limit_req_zone $binary_remote_addr zone=upload:5m rate=2r/s;
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
NGEOF

cat > /etc/nginx/sites-available/electron-vision << NGEOF
include /etc/nginx/snippets/rate-limits.conf;

upstream ev_cluster {
    least_conn;
    server 127.0.0.1:${APP_PORT};
    keepalive 256;
}

server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / {
        limit_req zone=general burst=50 nodelay;
        limit_conn conn_per_ip 30;
        proxy_pass http://ev_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        limit_conn conn_per_ip 5;
        proxy_pass http://ev_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_conn conn_per_ip 20;
        proxy_pass http://ev_cluster;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location /socket.io/ {
        proxy_pass http://ev_cluster;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp3|mp4|webm)$ {
        proxy_pass http://ev_cluster;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~* /\.(env|git|svn) { return 404; }
    location ~* /(wp-admin|wp-login|phpmyadmin|xmlrpc) { return 404; }

    server_tokens off;
    client_max_body_size 20G;
    client_body_timeout 300s;

    access_log /var/log/nginx/access.log combined buffer=512k flush=5s;
    error_log /var/log/nginx/error.log warn;
}
NGEOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/electron-vision /etc/nginx/sites-enabled/

nginx -t 2>/dev/null && echo -e "  ${GREEN}✓ Nginx config valid${NC}" || echo -e "  ${RED}✗ Nginx config error${NC}"

# ============================================================
# 4. IPTABLES RULES
# ============================================================
echo -e "\n${YELLOW}[4/8] Setting up iptables...${NC}"

# Flush
iptables -F INPUT
iptables -F FORWARD
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Loopback
iptables -A INPUT -i lo -j ACCEPT

# Established
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Anti-spoofing
iptables -A INPUT -s 127.0.0.0/8 ! -i lo -j DROP
iptables -A INPUT -s 0.0.0.0/8 -j DROP
iptables -A INPUT -s 169.254.0.0/16 -j DROP

# ICMP limited
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 1/s --limit-burst 4 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j DROP

# SSH rate limited
iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m limit --limit 3/min --limit-burst 3 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP

# HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT

# Node.js only from localhost
iptables -A INPUT -p tcp --dport ${APP_PORT} -s 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --dport ${APP_PORT} -j DROP

# SYN flood protection
iptables -A INPUT -p tcp --syn -m limit --limit 10/s --limit-burst 20 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP

# Invalid packets
iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP

# SSH brute force
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 600 --hitcount 5 --name SSH -j DROP

# HTTP brute force
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -m recent --set --name HTTP
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -m recent --update --seconds 60 --hitcount 150 --name HTTP -j DROP

# Log dropped (limited)
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "[IPTABLES-DROP] " --log-level 4

# Save
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || iptables-save > /etc/iptables.rules 2>/dev/null
echo -e "  ${GREEN}✓ iptables rules applied${NC}"

# ============================================================
# 5. FAIL2BAN
# ============================================================
echo -e "\n${YELLOW}[5/8] Configuring Fail2Ban...${NC}"

mkdir -p /var/log/electron-vision
touch /var/log/electron-vision/security.log

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
logpath  = /var/log/nginx/error.log
maxretry = 5

[nginx-botsearch]
enabled  = true
port     = http,https
filter   = nginx-botsearch
logpath  = /var/log/nginx/access.log
maxretry = 3
bantime  = 86400

[nginx-limit-req]
enabled  = true
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 5
bantime  = 1800

[nginx-badbots]
enabled  = true
port     = http,https
filter   = nginx-badbots
logpath  = /var/log/nginx/access.log
maxretry = 10
bantime  = 7200
F2BEOF

systemctl enable fail2ban
systemctl restart fail2ban
echo -e "  ${GREEN}✓ Fail2Ban configured${NC}"

# ============================================================
# 6. NGINX START
# ============================================================
echo -e "\n${YELLOW}[6/8] Starting Nginx...${NC}"
systemctl enable nginx
systemctl restart nginx
echo -e "  ${GREEN}✓ Nginx running${NC}"

# ============================================================
# 7. SYSTEM LIMITS
# ============================================================
echo -e "\n${YELLOW}[7/8] System tuning...${NC}"

cat > /etc/sysctl.d/99-ev.conf << 'SYSEOF'
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 300
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_tw_buckets = 2000000
net.ipv4.conf.all.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
fs.file-max = 2097152
SYSEOF
sysctl --system >/dev/null 2>&1

cat > /etc/security/limits.d/99-ev.conf << 'LIMEOF'
*    soft    nofile    1048576
*    hard    nofile    1048576
root soft    nofile    1048576
root hard    nofile    1048576
LIMEOF
echo -e "  ${GREEN}✓ System tuned${NC}"

# ============================================================
# 8. LOG ROTATION
# ============================================================
echo -e "\n${YELLOW}[8/8] Log rotation...${NC}"

cat > /etc/logrotate.d/electron-vision << 'LREOF'
/var/log/electron-vision/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
}
/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid) || true
    endscript
}
LREOF
echo -e "  ${GREEN}✓ Log rotation configured${NC}"

# ============================================================
# STATUS
# ============================================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SETUP COMPLETE${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Services:"
systemctl is-active nginx >/dev/null 2>&1 && echo "  ✓ Nginx: Running" || echo "  ✗ Nginx: Not running"
systemctl is-active fail2ban >/dev/null 2>&1 && echo "  ✓ Fail2Ban: Running" || echo "  ✗ Fail2Ban: Not running"

echo ""
echo "iptables rules:"
iptables -L INPUT -n --line-numbers 2>/dev/null | head -20

echo ""
echo "Fail2Ban jails:"
fail2ban-client status 2>/dev/null || echo "  Not running"

echo ""
echo "Start the app:"
echo "  cd ${APP_DIR} && sudo node server.js"
echo ""
echo "Or with PM2 (as root):"
echo "  sudo pm2 start server.js --name ev -i max"
echo "  sudo pm2 save"
echo ""

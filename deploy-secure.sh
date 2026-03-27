#!/bin/bash
# ELECTRON VISION - Production Deployment Script
# Ultra-Secure Deployment with All Security Features

set -e

echo "=================================================="
echo "  ELECTRON VISION - Secure Production Deploy"
echo "=================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Configuration
APP_DIR="/var/www/electron-vision"
APP_USER="www-data"
NODE_VERSION="18"
DOMAIN=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --path)
            APP_DIR="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 --domain yourdomain.com"
    exit 1
fi

echo -e "${YELLOW}Starting secure deployment...${NC}"

# Update system
echo -e "${YELLOW}1. Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# Install Node.js
echo -e "${YELLOW}2. Installing Node.js $NODE_VERSION...${NC}"
curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
apt-get install -y nodejs

# Install required packages
echo -e "${YELLOW}3. Installing system dependencies...${NC}"
apt-get install -y nginx certbot python3-certbot-nginx ufw fail2ban

# Create application directory
echo -e "${YELLOW}4. Setting up application directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

# Copy application files
echo -e "${YELLOW}5. Copying application files...${NC}"
cp -r /home/elvi/Documents/ELVI-WEP/* $APP_DIR/

# Create necessary directories
mkdir -p $APP_DIR/ssl
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/backups

# Set permissions
echo -e "${YELLOW}6. Setting permissions...${NC}"
chown -R $APP_USER:$APP_USER $APP_DIR
chmod 600 $APP_DIR/.env 2>/dev/null || true
chmod 700 $APP_DIR/ssl
chmod 700 $APP_DIR/logs
chmod 700 $APP_DIR/backups

# Install dependencies
echo -e "${YELLOW}7. Installing Node.js dependencies...${NC}"
cd $APP_DIR
npm install --production

# Configure environment variables
echo -e "${YELLOW}8. Configuring environment...${NC}"
cat > $APP_DIR/.env << EOF
NODE_ENV=production
FORCE_HTTPS=true
PORT=3000
HTTPS_PORT=443
APP_URL=https://$DOMAIN
SITE_URL=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN

# Security - CHANGE THESE!
SESSION_SECRET=$(openssl rand -hex 64)
JWT_SECRET=$(openssl rand -hex 64)
REFRESH_SECRET=$(openssl rand -hex 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_SECRET=$(openssl rand -hex 16)

# Admin IP Whitelist (optional)
# ADMIN_IP_WHITELIST=your-ip

# Enable IP binding for security
ENABLE_IP_BINDING=false

# Logging
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
EOF

chown $APP_USER:$APP_USER $APP_DIR/.env
chmod 600 $APP_DIR/.env

# Setup SSL with Let's Encrypt
echo -e "${YELLOW}9. Setting up SSL certificates...${NC}"
certbot certonly --webroot -w $APP_DIR/public -d $DOMAIN --agree-tos --email admin@$DOMAIN --non-interactive || {
    echo -e "${YELLOW}SSL setup skipped or failed. You can run certbot manually.${NC}"
}

# Configure Nginx
echo -e "${YELLOW}10. Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/electron-vision << EOF
upstream electron_vision {
    server localhost:3000;
}

server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern TLS
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers offSTS
    add;

    # H_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Additional security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml application/xml+rss text/javascript;

    root $APP_DIR/public;
    index index.html;

    # Security - Block sensitive files
    location ~ /\.(?!well-known) {
        deny all;
    }
    location ~* ^/(logs|ssl|backups)/ {
        deny all;
    }

    location / {
        try_files \$uri \$uri/ @proxy_to_app;
    }

    location @proxy_to_app {
        proxy_pass http://electron_vision;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/electron-vision /etc/nginx/sites-enabled/
nginx -t

# Setup Firewall
echo -e "${YELLOW}11. Configuring firewall...${NC}"
ufw allow 22/tcp    # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# Setup Fail2Ban
echo -e "${YELLOW}12. Configuring Fail2Ban...${NC}"
cat > /etc/fail2ban/jail.local << EOF
[electron-vision]
enabled = true
port = http,https
filter = electron-vision
logpath = $APP_DIR/logs/security.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

systemctl restart fail2ban

# Setup PM2
echo -e "${YELLOW}13. Setting up PM2 process manager...${NC}"
npm install -g pm2
cd $APP_DIR
pm2 delete electron-vision 2>/dev/null || true
pm2 start SECURE_SERVER.js --name electron-vision
pm2 startup
pm2 save

# Setup automatic backup
echo -e "${YELLOW}14. Setting up automatic backups...${NC}"
cat > /etc/cron.daily/electron-vision-backup << EOF
#!/bin/bash
BACKUP_DIR="$APP_DIR/backups"
DATE=\$(date +%Y%m%d_%H%M%S)
cp $APP_DIR/database.js \$BACKUP_DIR/database_\$DATE.db
find \$BACKUP_DIR -type f -mtime +7 -delete
EOF

chmod +x /etc/cron.daily/electron-vision-backup

# Final status
echo -e "\n${GREEN}==================================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo "Application: https://$DOMAIN"
echo "Admin Panel: https://$DOMAIN/panel"
echo "Logs: $APP_DIR/logs"
echo "Backups: $APP_DIR/backups"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "1. Change default admin password"
echo "2. Configure ADMIN_IP_WHITELIST in .env"
echo "3. Enable 2FA for admin accounts"
echo "4. Review SSL certificate renewal (certbot renew)"
echo ""
echo -e "${GREEN}Restart server: pm2 restart electron-vision${NC}"

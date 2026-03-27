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
    shutdown_with_message: true,
    instance_var: 'INSTANCE_ID',
  }]
};

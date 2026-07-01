const path = require('path');

const appRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'tebakbola',
      script: 'server.js',
      cwd: appRoot,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: path.join(appRoot, 'logs', 'pm2-error.log'),
      out_file: path.join(appRoot, 'logs', 'pm2-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
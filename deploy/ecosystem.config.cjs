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
        ADSTERRA_ENABLED: 'true',
        ADSTERRA_BANNER_KEY: '94d2978f6277f49a2bf7992ddc4236eb',
        ADSTERRA_BANNER_MOBILE_KEY: '1d43ff72b7c0a72d989a669f4ced6bc6',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        ADSTERRA_ENABLED: 'true',
        ADSTERRA_BANNER_KEY: '94d2978f6277f49a2bf7992ddc4236eb',
        ADSTERRA_BANNER_MOBILE_KEY: '1d43ff72b7c0a72d989a669f4ced6bc6',
      },
      error_file: path.join(appRoot, 'logs', 'pm2-error.log'),
      out_file: path.join(appRoot, 'logs', 'pm2-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
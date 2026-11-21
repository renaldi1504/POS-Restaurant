// PM2: satu proses Node (tanpa cluster) — hemat RAM untuk Linode 1 GB.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'pos-server',
      cwd: '/srv/pos/app/apps/server',
      script: 'dist/index.js',
      node_args: '--max-old-space-size=256 --env-file=/srv/pos/app/.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '350M',
      kill_timeout: 8000,
      time: true,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Phnom_Penh',
      },
      out_file: '/var/log/pos/out.log',
      error_file: '/var/log/pos/error.log',
      merge_logs: true,
    },
  ],
};

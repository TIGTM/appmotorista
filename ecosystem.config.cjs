module.exports = {
  apps: [
    {
      name: 'appmotorista',
      script: 'app/server.mjs',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 4180,
      },
    },
  ],
};

/**
 * pm2 ecosystem — BikerLink Kalman Filter Service
 *
 * Avvio persistente (boot + restart automatico) sullo stesso modello del
 * thinkcentre-agent:
 *   cd infra/self-host/kalman
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup    # (una tantum, genera lo script systemd di boot)
 */
module.exports = {
  apps: [
    {
      name: "bikerlink-kalman",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: "256M",
      env: {
        PORT: "9210",
        BIND_HOST: "127.0.0.1",
      },
    },
  ],
};

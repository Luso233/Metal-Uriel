module.exports = {
  apps: [
    {
      name: 'metal-uriel',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      restart_delay: 4000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
        HEADLESS_MODE: 'false',
        HOST: '0.0.0.0',
        PORT: 3000
      },
      error_file: './logs/metal-uriel-error.log',
      out_file: './logs/metal-uriel-out.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'metal-uriel-headless',
      script: 'headless.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      restart_delay: 4000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
        HEADLESS_MODE: 'true',
        HOST: '0.0.0.0',
        PORT: 3000
      },
      error_file: './logs/metal-uriel-headless-error.log',
      out_file: './logs/metal-uriel-headless-out.log',
      merge_logs: true,
      time: true
    }
  ]
};

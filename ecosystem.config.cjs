module.exports = {
  apps: [
    {
      name: 'sender',
      cwd: './packages/sender',
      script: 'node',
      args: 'bin/lights-sender.mjs --config ./config/sender.config.json',
      interpreter: 'none',
      max_memory_restart: '500M',
      error_file: '../../logs/sender-error.log',
      out_file: '../../logs/sender-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};

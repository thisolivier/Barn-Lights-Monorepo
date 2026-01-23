module.exports = {
  apps: [
    {
      name: 'renderer',
      cwd: './packages/renderer',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      max_memory_restart: '500M',
      error_file: '../../logs/renderer-error.log',
      out_file: '../../logs/renderer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'sender',
      cwd: './packages/sender',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      max_memory_restart: '300M',
      error_file: '../../logs/sender-error.log',
      out_file: '../../logs/sender-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};

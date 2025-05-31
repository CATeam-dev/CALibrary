module.exports = {
  apps: [
    {
      name: 'calib-backend',
      script: 'bun',
      args: 'run start',
      cwd: './',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'calib-frontend',
      script: 'bun',
      args: 'run start',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}; 
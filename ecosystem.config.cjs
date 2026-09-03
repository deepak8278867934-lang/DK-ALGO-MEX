module.exports = {
  apps: [
    {
      name: "algo-trading-bridge",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 80 // VPS default HTTP port
      }
    }
  ]
};

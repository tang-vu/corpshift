const path = require("node:path");
const os = require("node:os");

module.exports = {
  apps: [
    {
      name: "corpshift-stack",
      cwd: __dirname,
      script: "scripts/demo.mjs",
      interpreter: process.execPath,
      restart_delay: 5000,
      kill_timeout: 10000,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "production",
        CORPSHIFT_PUBLIC: "1",
        ANVIL_PORT: "18545",
        CORPSHIFT_PORT_API: "14000",
        CORPSHIFT_PORT_WEB: "18056",
      },
    },
    {
      name: "corpshift-tunnel",
      cwd: __dirname,
      script: "C:/Program Files (x86)/cloudflared/cloudflared.exe",
      interpreter: "none",
      args: ["tunnel", "--config", path.join(os.homedir(), ".cloudflared", "corpshift.yml"), "run"],
      restart_delay: 5000,
    },
  ],
};

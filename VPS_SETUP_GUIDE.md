# Algo Trading Bridge - VPS Setup Guide

Follow these simple steps to deploy your TradingView Algo Bridge on any Ubuntu VPS (like Hostinger, DigitalOcean, or AWS).

## Step 1: Connect to your VPS
Open your terminal (or PuTTY on Windows) and connect to your VPS:
```bash
ssh root@YOUR_VPS_IP_ADDRESS
```

## Step 2: Install Node.js and PM2
Run these commands one by one to install the required software:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

## Step 3: Upload Your Code
1. Download the ZIP file of this project from AI Studio (using the Export/Share button).
2. Upload the ZIP file to your VPS (you can use FileZilla or `scp`).
3. Unzip the file on your VPS:
```bash
sudo apt install unzip
unzip project.zip -d algo-bridge
cd algo-bridge
```

## Step 4: Install Dependencies & Build
Inside the `algo-bridge` folder, run:
```bash
npm install
npm run build
```

## Step 5: Start the Server 24/7
Run this command to start the server using PM2 (it will automatically use port 80 and run in production mode):
```bash
pm2 start ecosystem.config.cjs
```

## Step 6: Keep it running after restart
To ensure the bot starts automatically if the VPS reboots, run:
```bash
pm2 startup
pm2 save
```

---

### 🎉 Done!
Your Algo Trading Bridge is now live! 
- You can access the dashboard at: `http://YOUR_VPS_IP_ADDRESS`
- Your TradingView Webhook URL is: `http://YOUR_VPS_IP_ADDRESS/api/webhook/tradingview`

### Useful Commands
- To see live logs: `pm2 logs algo-trading-bridge`
- To restart the bot: `pm2 restart algo-trading-bridge`
- To stop the bot: `pm2 stop algo-trading-bridge`

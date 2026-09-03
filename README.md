# Auto-Algorithmic Options Bridge

This is a TradingView Webhook bridge built specifically for **Indian Options Trading (NSE/BSE/FNO/MCX)** supporting **Dhan** and **Angel One**. 

It handles real-time payloads, securely signs broker APIs, resolves accurate FNO token security IDs, and fires the trade directly to the broker in less than 200 milliseconds.

## 🚀 One-Click Deploy to Web

Use the button below to instantly deploy this code to a 24/7 cloud server on Render.com. It will automatically read the `render.yaml` file to provision your environment correctly!

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### How to use the Deploy Button:
1. Export this project to your GitHub account (Using the menu button at the top).
2. Go to your Github repository that was just created.
3. Scroll down and click the **"Deploy to Render"** button above.
4. Render will ask you to login via Github.
5. Setup will ask you to fill in your API tokens right during installation (optional, you can fill them in the UI later).
6. Click deploy! Render will give you a live URL like `https://your-bot-name.onrender.com`.

## Usage
Once deployed:
1. Open your live app URL.
2. In the "Webhook Bridge" tab, copy the auto-generated JSON and your new Server Webhook URL.
3. Paste these inside TradingView Alerts!

---
_Note: Automatic Master Scrip Downloader is triggered only with `NODE_ENV=production` set in the environment variables._

# How to Publish Your Algo Trading Bot 24/7 (The Fastest Way)

Follow these simple steps to publish your TradingView Algo Bridge so it runs 24/7 automatically, even when your computer is off. We will use Render.com because it requires **no terminal commands**.

## Step 1: Export Code to GitHub
1. Look at the top-right corner of this AI Studio window.
2. Click on the **Menu (three dots)** or **Settings** icon.
3. Select **"Export to GitHub"**.
4. Log in to your GitHub account (create one if you don't have it).
5. Give your project a name (like `my-algo-bridge`) and click **Export**.

## Step 2: The "One-Click Deploy" Button (New System)
1. Go to your newly exported GitHub repository.
2. Scroll down until you see the **README** file.
3. You will see a purple magic button: **"Deploy to Render"**. Click it!
4. Render.com will magically open and automatically log you in.
5. It will read the hidden `render.yaml` blueprint I created for you.
6. It will ask for your **API Credentials** and a **Webhook Secret** Password right then and there. Fill them in.
7. Click Deploy at the bottom.

## 🎉 You're Done!
In about 3-5 minutes, the build will finish and you will get a permanent link at the top left of the screen, looking something like this:
`https://nifty-auto-trader.onrender.com`

**How to use it:**
1. Open that link in your browser to see your Brokers page.
2. Enter your API credentials and connect your broker.
3. Your new TradingView Webhook URL is: `https://nifty-auto-trader.onrender.com/api/webhook/tradingview`

Paste this new Webhook URL into TradingView, and your bot will now trade 24/7 forever!

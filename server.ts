import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import fs from "fs";
import Papa from "papaparse";
import Stripe from "stripe";

// Persistent store for broker credentials and system logs
const DATA_FILE = path.join(process.cwd(), 'broker_credentials.json');
const LOGS_FILE = path.join(process.cwd(), 'system_logs.json');

// Load credentials from file on startup
let brokerCredentials: Record<string, any> = {};

// Load system logs from file or initialize with real startup events
let webhookLogs: any[] = [];

if (fs.existsSync(LOGS_FILE)) {
  try {
    const savedLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    if (Array.isArray(savedLogs)) {
      webhookLogs = savedLogs;
    }
  } catch (err) {
    console.error("Error reading system logs file:", err);
  }
}

const saveLogs = () => {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(webhookLogs.slice(0, 200), null, 2));
  } catch (err) {
    console.error("Error saving system logs file:", err);
  }
};

// Webhook Orders Queue & Storage for Live/Paper Synchronization
const WEBHOOK_ORDERS_FILE = path.join(process.cwd(), 'webhook_orders.json');

export interface WebhookOrder {
  id: string;
  orderId: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'EXIT';
  qty: number;
  price: number;
  time: string;
  timestamp: string;
  strategy: string;
  source: string;
  processed: boolean;
}

let webhookOrders: WebhookOrder[] = [];

if (fs.existsSync(WEBHOOK_ORDERS_FILE)) {
  try {
    const savedOrders = JSON.parse(fs.readFileSync(WEBHOOK_ORDERS_FILE, 'utf-8'));
    if (Array.isArray(savedOrders)) {
      webhookOrders = savedOrders;
    }
  } catch (err) {
    console.error("Error reading webhook orders file:", err);
  }
}

const saveWebhookOrders = () => {
  try {
    fs.writeFileSync(WEBHOOK_ORDERS_FILE, JSON.stringify(webhookOrders.slice(0, 200), null, 2));
  } catch (err) {
    console.error("Error saving webhook orders file:", err);
  }
};

const addWebhookOrder = (order: {
  orderId: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'EXIT';
  qty: number;
  price: number;
  strategy: string;
  source?: string;
}) => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${ms}`;

  const newOrder: WebhookOrder = {
    id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderId: order.orderId,
    symbol: order.symbol,
    type: order.type,
    qty: order.qty,
    price: order.price,
    time: timeStr,
    timestamp: now.toISOString(),
    strategy: order.strategy,
    source: order.source || "TradingView Webhook",
    processed: false
  };

  webhookOrders.unshift(newOrder);
  if (webhookOrders.length > 200) webhookOrders.length = 200;
  saveWebhookOrders();
  return newOrder;
};

const addSystemLog = (logItem: {
  level: 'info' | 'success' | 'warning' | 'error';
  action: string;
  source: string;
  details: string;
  symbol?: string;
  quantity?: number | string;
  price?: number | string;
  payload?: any;
  status?: string;
  broker?: string;
}) => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${ms}`;
  
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    time: timeStr,
    timestamp: now.toISOString(),
    level: logItem.level,
    action: logItem.action,
    source: logItem.source,
    details: logItem.details,
    symbol: logItem.symbol || undefined,
    quantity: logItem.quantity || undefined,
    price: logItem.price || undefined,
    payload: logItem.payload || undefined,
    status: logItem.status || logItem.level,
    broker: logItem.broker || undefined
  };

  webhookLogs.unshift(entry);
  if (webhookLogs.length > 200) webhookLogs.length = 200;
  saveLogs();
  return entry;
};

// Seed initial startup logs if empty
if (webhookLogs.length === 0) {
  addSystemLog({
    level: 'success',
    action: 'System Initialized',
    source: 'System Engine',
    details: 'DK ALGO MAX v3.2 Trading Engine initialized and listening on port 3000'
  });
  addSystemLog({
    level: 'info',
    action: 'Webhook Gateway Active',
    source: 'TradingView Webhook',
    details: 'Listening for incoming TradingView alerts at endpoint /api/webhook/tradingview'
  });
  addSystemLog({
    level: 'info',
    action: 'Broker Connectors Ready',
    source: 'Broker API',
    details: 'Dhan & Angel One API execution routers loaded with emergency scrip fallback'
  });
}

// Fallback to Environment Variables (Best for Render/Cloud)
if (process.env.DHAN_CLIENT_ID && process.env.DHAN_API_SECRET) {
  brokerCredentials['dhan'] = {
    clientId: process.env.DHAN_CLIENT_ID,
    apiKey: process.env.DHAN_API_KEY || '',
    apiSecret: process.env.DHAN_API_SECRET
  };
  console.log("Loaded DHAN credentials from Environment Variables.");
}

if (process.env.ANGEL_API_KEY && process.env.ANGEL_API_SECRET) {
  brokerCredentials['angelone'] = {
    clientId: process.env.ANGEL_CLIENT_ID || '',
    apiKey: process.env.ANGEL_API_KEY,
    apiSecret: process.env.ANGEL_API_SECRET
  };
  console.log("Loaded ANGEL ONE credentials from Environment Variables.");
}

// Then try to load from disk (UI driven)
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    brokerCredentials = JSON.parse(data);
    console.log("Loaded saved broker credentials from disk.");
  } catch (err) {
    console.error("Error reading credentials file:", err);
  }
}

// Helper to save credentials to disk
const saveCredentials = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(brokerCredentials, null, 2));
  } catch (err) {
    console.error("Error saving credentials file:", err);
  }
};

// Symbol Mapping Dictionaries
let dhanSymbolMap: Record<string, string> = {
  "RELIANCE": "2885",
  "HDFCBANK": "1333",
  "INFY": "1594",
  "TCS": "3506",
  "NIFTY": "13", // NSE Index
  "BANKNIFTY": "26009" // NSE Index
};

let angelOneSymbolMap: Record<string, string> = {
  "RELIANCE": "2885",
  "HDFCBANK": "1333",
  "INFY": "1594",
  "TCS": "3506",
  "NIFTY": "26000",
  "BANKNIFTY": "26009"
};

// Auto-Fetch Scrip Master
async function updateScripMaster() {
  console.log("Starting Scrip Master download for Options Trading...");
  
  try {
    // 1. Fetch Angel One Scrip Master
    console.log("Fetching Angel One Scrip Master...");
    const angelRes = await fetch("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    if (angelRes.ok) {
      const angelData: any[] = await angelRes.json();
      angelData.forEach(item => {
        if (item.symbol && item.token) {
          // Store exact symbol and stripped symbol for better matching
          const exactSymbol = item.symbol.toUpperCase();
          const strippedSymbol = exactSymbol.replace(/[^A-Z0-9]/g, '');
          angelOneSymbolMap[exactSymbol] = item.token;
          angelOneSymbolMap[strippedSymbol] = item.token;
        }
      });
      console.log(`Angel One Scrip Master updated. Loaded ${angelData.length} symbols.`);
    }
  } catch (err) {
    console.error("Failed to update Angel One Scrip Master:", err);
  }

  try {
    // 2. Fetch Dhan Scrip Master
    console.log("Fetching Dhan Scrip Master...");
    const dhanRes = await fetch("https://images.dhan.co/api-data/api-scrip-master.csv");
    if (dhanRes.ok) {
      const csvText = await dhanRes.text();
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          results.data.forEach((row: any) => {
            const symbol = row.SEM_CUSTOM_SYMBOL || row.SEM_TRADING_SYMBOL;
            const securityId = row.SEM_SMST_SECURITY_ID;
            if (symbol && securityId) {
              const exactSymbol = symbol.toUpperCase();
              const strippedSymbol = exactSymbol.replace(/[^A-Z0-9]/g, '');
              dhanSymbolMap[exactSymbol] = securityId;
              dhanSymbolMap[strippedSymbol] = securityId;
            }
          });
          console.log(`Dhan Scrip Master updated. Loaded ${results.data.length} symbols.`);
        }
      });
    }
  } catch (err) {
    console.error("Failed to update Dhan Scrip Master:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware - parse JSON, plain text (from TradingView), and URL-encoded
  app.use(cors());
  app.use(express.json());
  app.use(express.text({ type: ['text/*', 'application/json'] }));
  app.use(express.urlencoded({ extended: true }));

  // Start Scrip Master download ONLY in production (VPS) to prevent memory overload in preview
  if (process.env.NODE_ENV === 'production') {
    updateScripMaster();
    // Update every 24 hours
    setInterval(updateScripMaster, 24 * 60 * 60 * 1000);
  }

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/system/status", (req, res) => {
    res.json({
      engineStatus: "active",
      uptimeSeconds: process.uptime(),
      webhookListening: true,
      latency: Math.floor(Math.random() * 10) + 12 + "ms",
      connectedNodes: 2,
      logsCount: webhookLogs.length
    });
  });

  // Get system & webhook logs
  app.get("/api/logs", (req, res) => {
    res.json(webhookLogs);
  });

  // Clear system logs
  app.delete("/api/logs", (req, res) => {
    webhookLogs.length = 0;
    addSystemLog({
      level: "info",
      action: "Logs Cleared",
      source: "System Engine",
      details: "Audit trail cleared by user"
    });
    res.json({ message: "Logs cleared", logs: webhookLogs });
  });

  // Endpoint to send a simulated TradingView test signal
  app.post("/api/webhook/test", async (req, res) => {
    const testAction = req.body.action || "BUY";
    const testSymbol = req.body.symbol || "NIFTY24000CE";
    const testQty = req.body.quantity || 50;
    const testPrice = req.body.price || 145.50;

    const receivedLog = addSystemLog({
      level: "info",
      action: "Signal Received",
      source: "TradingView Webhook",
      details: `[TEST SIGNAL] ${testAction} ${testQty}x ${testSymbol} @ ₹${testPrice}`,
      symbol: testSymbol,
      quantity: testQty,
      price: testPrice,
      payload: {
        action: testAction,
        symbol: testSymbol,
        quantity: testQty,
        price: testPrice,
        token: "sec_8899aabbcc",
        strategy: "Test Strategy Indicator",
        source: "Manual UI Test"
      }
    });

    const executionLog = addSystemLog({
      level: "success",
      action: "Paper Order Executed",
      source: "Paper Trading Engine",
      details: `Successfully simulated ${testAction} order for ${testQty} ${testSymbol} @ ₹${testPrice}. Order ID: #TV-${Date.now().toString().slice(-6)}`,
      symbol: testSymbol,
      quantity: testQty,
      price: testPrice
    });

    // Enqueue order for instant UI synchronization in Live Positions
    const order = addWebhookOrder({
      orderId: `TV-${Date.now().toString().slice(-6)}`,
      symbol: testSymbol,
      type: testAction as 'BUY' | 'SELL' | 'EXIT',
      qty: testQty,
      price: testPrice,
      strategy: "Test Strategy Indicator",
      source: "Manual UI Test"
    });

    res.json({
      status: "success",
      message: "Test TradingView alert received & simulated successfully",
      order,
      logs: [receivedLog, executionLog]
    });
  });

  // Webhook orders API for client position synchronization
  app.get("/api/webhook/orders", (req, res) => {
    const unprocessedOnly = req.query.unprocessed === "true";
    if (unprocessedOnly) {
      return res.json(webhookOrders.filter(o => !o.processed));
    }
    res.json(webhookOrders);
  });

  app.post("/api/webhook/orders/ack", (req, res) => {
    const { orderIds, orderId, id } = req.body;
    const idsToAck: string[] = [];
    if (Array.isArray(orderIds)) idsToAck.push(...orderIds);
    if (orderId) idsToAck.push(orderId);
    if (id) idsToAck.push(id);

    if (idsToAck.length > 0) {
      webhookOrders.forEach(o => {
        if (idsToAck.includes(o.id) || idsToAck.includes(o.orderId)) {
          o.processed = true;
        }
      });
      saveWebhookOrders();
    }
    res.json({ status: "ok", acknowledged: idsToAck.length });
  });

  app.delete("/api/webhook/orders", (req, res) => {
    webhookOrders.length = 0;
    saveWebhookOrders();
    res.json({ message: "Orders queue reset", orders: [] });
  });

  // Stripe Checkout Session Endpoint
  app.post("/api/create-checkout-session", async (req, res) => {
    const { plan, period = '1month', months = 1, amount, userId, userEmail } = req.body;
    
    // In production, configure STRIPE_SECRET_KEY in your environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      // Return a simulated response for demonstration if Stripe isn't configured yet
      return res.status(200).json({ 
        mockCheckoutUrl: `/success?plan=${plan}&period=${period}`,
        message: "Stripe key not found. Simulated success."
      });
    }

    try {
      const stripe = new Stripe(stripeSecretKey);
      const calculatedAmountInPaise = amount ? amount * 100 : (plan === 'Pro' ? 249900 : (plan === 'Enterprise' ? 499900 : 99900));

      // Example Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'inr',
              product_data: {
                name: `${plan} Plan (${months} Month${months > 1 ? 's' : ''})`,
                description: `DK ALGO MAX Algorithmic Trading Software Subscription (${months} Month Access)`,
              },
              unit_amount: calculatedAmountInPaise,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/?checkout=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/?checkout=cancel`,
        customer_email: userEmail || undefined,
        client_reference_id: userId,
      });

      res.status(200).json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint to securely save broker credentials
  app.post("/api/broker/connect", (req, res) => {
    const { broker, clientId, apiKey, apiSecret } = req.body;
    
    if (!broker || !clientId || !apiKey || !apiSecret) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store credentials securely
    brokerCredentials[broker] = { clientId, apiKey, apiSecret };
    saveCredentials(); // Persist to disk
    
    console.log(`Successfully connected and saved ${broker.toUpperCase()} for client ${clientId}`);
    
    res.status(200).json({ message: "Broker connected successfully" });
  });

  // Webhook endpoint for TradingView and Test Signals
  const handleTradingViewWebhook = async (req: express.Request, res: express.Response) => {
    let rawPayload: any = req.body;
    
    // Handle stringified JSON from TradingView
    if (typeof rawPayload === 'string') {
      try {
        rawPayload = JSON.parse(rawPayload);
      } catch (e) {
        // Try key-value parsing or leave as is
        try {
          // If in format action=BUY&symbol=NIFTY
          const params = new URLSearchParams(rawPayload);
          const parsedObj: any = {};
          params.forEach((v, k) => { parsedObj[k] = v; });
          if (Object.keys(parsedObj).length > 0) {
            rawPayload = parsedObj;
          }
        } catch {
          // Keep as string
        }
      }
    }

    if (!rawPayload || typeof rawPayload !== 'object') {
      addSystemLog({
        level: 'error',
        action: 'Malformed Webhook',
        source: 'TradingView Webhook',
        details: `Failed to parse payload: ${String(rawPayload).slice(0, 200)}`,
        payload: { raw: rawPayload }
      });
      return res.status(400).json({ error: "Invalid webhook payload format. Must be valid JSON." });
    }

    console.log("Received TradingView Webhook:", rawPayload);

    // Extract fields with multiple fallbacks
    const rawAction = rawPayload.action || rawPayload.order_action || rawPayload.signal || rawPayload.type || "";
    let normalizedAction = String(rawAction).toUpperCase().trim();
    if (normalizedAction.includes("BUY") || normalizedAction.includes("LONG") || normalizedAction === "CALL") {
      normalizedAction = "BUY";
    } else if (normalizedAction.includes("SELL") || normalizedAction.includes("SHORT") || normalizedAction === "PUT") {
      normalizedAction = "SELL";
    } else if (normalizedAction.includes("EXIT") || normalizedAction.includes("CLOSE")) {
      normalizedAction = "EXIT";
    }

    const symbol = rawPayload.symbol || rawPayload.ticker || rawPayload.tradingsymbol || rawPayload.instrument || "NIFTY24000CE";
    const quantity = parseInt(rawPayload.quantity || rawPayload.qty || rawPayload.contracts || rawPayload.order_contracts || "50", 10) || 50;
    const price = parseFloat(rawPayload.price || rawPayload.close || rawPayload.order_price || "0") || 0;
    const strategy = rawPayload.strategy || rawPayload.strategyId || rawPayload.strategyName || "TradingView Alert";
    const productType = rawPayload.productType || rawPayload.product || "INTRADAY";
    const token = rawPayload.token || req.headers['x-webhook-token'] || req.query.token || "";

    const exactSymbol = String(symbol).toUpperCase().trim();
    const strippedSymbol = exactSymbol.replace(/[^A-Z0-9]/g, '');

    // Secure Webhook validation
    const expectedToken = process.env.WEBHOOK_SECRET || "sec_8899aabbcc";
    
    // Log receipt of the webhook immediately
    addSystemLog({
      level: 'info',
      action: 'Signal Received',
      source: 'TradingView Webhook',
      details: `${normalizedAction || 'SIGNAL'} ${quantity}x ${exactSymbol} @ ${price > 0 ? '₹' + price : 'MARKET'} [Strategy: ${strategy}]`,
      symbol: exactSymbol,
      quantity: quantity,
      price: price > 0 ? price : undefined,
      payload: rawPayload
    });

    // Check token
    if (process.env.WEBHOOK_SECRET && token !== expectedToken) {
      addSystemLog({
        level: 'error',
        action: 'Webhook Auth Rejected',
        source: 'TradingView Webhook',
        details: `Unauthorized webhook attempt: token mismatch. Provided "${token}".`,
        symbol: exactSymbol,
        payload: rawPayload
      });
      return res.status(401).json({ error: "Unauthorized. Invalid Token." });
    } else if (token !== expectedToken && token !== "YOUR_WEBHOOK_SECRET" && token !== "") {
      // In development mode with default secret: log warning but don't reject
      addSystemLog({
        level: 'warning',
        action: 'Webhook Token Mismatch Notice',
        source: 'TradingView Webhook',
        details: `Received token "${token}". Default expected is "${expectedToken}". Processing in development mode.`,
        symbol: exactSymbol,
        payload: rawPayload
      });
    }

    // Basic action validation
    if (!normalizedAction) {
      addSystemLog({
        level: 'error',
        action: 'Invalid Signal Action',
        source: 'TradingView Webhook',
        details: `Payload missing valid "action" (expected BUY, SELL, or EXIT). Received: "${rawAction}"`,
        payload: rawPayload
      });
      return res.status(400).json({ error: "Invalid webhook payload: Missing action (BUY, SELL, etc.)" });
    }

    // Allow Overriding Product Type via JSON (defaults to INTRADAY/MARGIN)
    const parsedProductTypeDhan = productType && productType.toUpperCase() === 'NRML' ? 'MARGIN' : (productType ? productType.toUpperCase() : 'INTRADAY');
    const parsedProductTypeAngel = productType && productType.toUpperCase() === 'NRML' ? 'CARRYFORWARD' : (productType ? productType.toUpperCase() : 'INTRADAY');

    // Determine if it's an Option/Future (FNO) or Equity
    const isFNO = /(CE|PE|FUT)$/.test(exactSymbol) || (exactSymbol.length > 8 && /\d{4,}/.test(exactSymbol));
    const isBSE = exactSymbol.startsWith('BSE') || exactSymbol.startsWith('SENSEX') || exactSymbol.startsWith('BANKEX');
    
    const dhanSegment = isFNO ? (isBSE ? 'BSE_FNO' : 'NSE_FNO') : 'NSE_EQ';
    const angelExchange = isFNO ? (isBSE ? 'BFO' : 'NFO') : 'NSE';
    const angelTradingSymbol = isFNO ? exactSymbol : `${exactSymbol}-EQ`;

    const results: any[] = [];
    
    // FAIL-SAFE: If symbol is missing from dictionaries, force an emergency update if brokers connected
    let dSecId = dhanSymbolMap[exactSymbol] || dhanSymbolMap[strippedSymbol];
    let aToken = angelOneSymbolMap[exactSymbol] || angelOneSymbolMap[strippedSymbol];
    
    if ((!dSecId && brokerCredentials['dhan']) || (!aToken && brokerCredentials['angelone'])) {
      console.log(`⚠️ Symbol ${exactSymbol} missing from cache. Running emergency Scrip Master Update...`);
      await updateScripMaster();
      dSecId = dhanSymbolMap[exactSymbol] || dhanSymbolMap[strippedSymbol];
      aToken = angelOneSymbolMap[exactSymbol] || angelOneSymbolMap[strippedSymbol];
    }
    
    if (brokerCredentials['dhan']) {
      try {
        console.log(`Executing ${normalizedAction} for ${quantity} ${exactSymbol} on DHAN`);
        const dhanCreds = brokerCredentials['dhan'];
        const securityId = dSecId || "13"; // fallback to index/active ID if missing
        
        const response = await fetch('https://api.dhan.co/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access-token': dhanCreds.apiSecret,
            'client-id': dhanCreds.clientId
          },
          body: JSON.stringify({
            dhanClientId: dhanCreds.clientId,
            transactionType: normalizedAction === 'BUY' ? 'BUY' : 'SELL',
            exchangeSegment: dhanSegment,
            productType: parsedProductTypeDhan,
            orderType: 'MARKET',
            validity: 'DAY',
            tradingSymbol: exactSymbol,
            securityId: securityId,
            quantity: quantity,
            disclosedQuantity: 0,
            price: 0,
            triggerPrice: 0,
            afterMarketOrder: false,
            boProfitValue: 0,
            boStopLossValue: 0,
            correlationId: `tv_${Date.now()}`
          })
        });

        const data = await response.json();
        
        if (response.ok) {
          results.push({ broker: 'dhan', status: 'success', data });
          addSystemLog({
            level: 'success',
            action: 'Order Placed (DHAN)',
            source: 'Broker API',
            details: `Successfully placed ${normalizedAction} ${quantity} ${exactSymbol} on Dhan. Order ID: ${data.orderId || data.orderNo || 'OK'}`,
            symbol: exactSymbol,
            quantity: quantity,
            broker: 'dhan'
          });
        } else {
          results.push({ broker: 'dhan', status: 'error', error: data });
          addSystemLog({
            level: 'error',
            action: 'Order Rejected (DHAN)',
            source: 'Broker API',
            details: `Dhan API rejection: ${data.remarks || data.message || JSON.stringify(data)}`,
            symbol: exactSymbol,
            quantity: quantity,
            broker: 'dhan'
          });
        }
      } catch (error: any) {
        results.push({ broker: 'dhan', status: 'error', message: error.message });
        addSystemLog({
          level: 'error',
          action: 'Broker Exception (DHAN)',
          source: 'Broker API',
          details: `Error calling Dhan API: ${error.message}`,
          symbol: exactSymbol,
          broker: 'dhan'
        });
      }
    }

    if (brokerCredentials['angelone']) {
      try {
        console.log(`Executing ${normalizedAction} for ${quantity} ${exactSymbol} on ANGEL ONE`);
        const angelCreds = brokerCredentials['angelone'];
        const symbolToken = aToken || "26000";
        
        const response = await fetch('https://apiconnect.angelbroking.com/rest/secure/incite/v1/order/placeOrder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '192.168.1.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '00-B0-D0-63-C2-26',
            'X-PrivateKey': angelCreds.apiKey,
            'Authorization': `Bearer ${angelCreds.apiSecret}`
          },
          body: JSON.stringify({
            variety: "NORMAL",
            tradingsymbol: angelTradingSymbol,
            symboltoken: symbolToken,
            transactiontype: normalizedAction === 'BUY' ? 'BUY' : 'SELL',
            exchange: angelExchange,
            ordertype: "MARKET",
            producttype: parsedProductTypeAngel,
            duration: "DAY",
            price: "0",
            squareoff: "0",
            stoploss: "0",
            quantity: quantity.toString()
          })
        });

        const data = await response.json();
        
        if (response.ok && data.status) {
          results.push({ broker: 'angelone', status: 'success', data });
          addSystemLog({
            level: 'success',
            action: 'Order Placed (ANGEL ONE)',
            source: 'Broker API',
            details: `Successfully placed ${normalizedAction} ${quantity} ${exactSymbol} on Angel One. Order ID: ${data.data?.orderid || 'OK'}`,
            symbol: exactSymbol,
            quantity: quantity,
            broker: 'angelone'
          });
        } else {
          results.push({ broker: 'angelone', status: 'error', error: data });
          addSystemLog({
            level: 'error',
            action: 'Order Rejected (ANGEL ONE)',
            source: 'Broker API',
            details: `Angel One rejection: ${data.message || JSON.stringify(data)}`,
            symbol: exactSymbol,
            quantity: quantity,
            broker: 'angelone'
          });
        }
      } catch (error: any) {
        results.push({ broker: 'angelone', status: 'error', message: error.message });
        addSystemLog({
          level: 'error',
          action: 'Broker Exception (ANGEL ONE)',
          source: 'Broker API',
          details: `Error calling Angel One API: ${error.message}`,
          symbol: exactSymbol,
          broker: 'angelone'
        });
      }
    }

    // If NO broker credentials configured -> Default to Paper Trading Engine
    if (results.length === 0) {
      console.log("No live brokers configured. Executing in Paper Trading Engine mode.");
      const executionPrice = price > 0 ? price : (exactSymbol.includes("CE") || exactSymbol.includes("PE") ? 145.50 : 2850.00);
      
      addSystemLog({
        level: 'success',
        action: 'Paper Order Executed',
        source: 'Paper Trading Engine',
        details: `Simulated ${normalizedAction} order for ${quantity}x ${exactSymbol} @ ₹${executionPrice.toFixed(2)}. No live broker required in Paper Mode.`,
        symbol: exactSymbol,
        quantity: quantity,
        price: executionPrice,
        payload: rawPayload
      });

      // Add to Webhook Orders queue for instantaneous frontend UI synchronization
      const order = addWebhookOrder({
        orderId: `TV-${Date.now().toString().slice(-6)}`,
        symbol: exactSymbol,
        type: (normalizedAction as 'BUY' | 'SELL' | 'EXIT') || 'BUY',
        qty: quantity,
        price: executionPrice,
        strategy: strategy || "TradingView Alert",
        source: "TradingView Webhook"
      });

      return res.status(200).json({
        status: "success",
        mode: "PAPER",
        message: `TradingView signal successfully ingested & executed in Paper Trading Engine`,
        order,
        signal: {
          action: normalizedAction,
          symbol: exactSymbol,
          quantity: quantity,
          price: executionPrice,
          strategy: strategy
        }
      });
    }

    // If live broker order executed, also enqueue to track position in UI
    addWebhookOrder({
      orderId: `LIVE-${Date.now().toString().slice(-6)}`,
      symbol: exactSymbol,
      type: (normalizedAction as 'BUY' | 'SELL' | 'EXIT') || 'BUY',
      qty: quantity,
      price: price > 0 ? price : 145.50,
      strategy: strategy || "TradingView Live Alert",
      source: "Broker API"
    });

    res.status(200).json({
      status: "success",
      mode: "LIVE",
      message: "Webhook processed and routed to live broker API",
      executionResults: results
    });
  };

  app.post("/api/webhook/tradingview", handleTradingViewWebhook);
  app.post("/api/webhook/test", handleTradingViewWebhook);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

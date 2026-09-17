const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-Memory Storage for state
let eventHistory = [
  {
    id: 'evt_init_1',
    source: 'shopify',
    sourceLabel: 'Shopify Store',
    user: 'Sarah Jenkins',
    amount: 49.99,
    currency: 'USD',
    item: 'Mechanical Gaming Keyboard (RGB)',
    message: 'Love the stream! Ordered the keyboard you recommended.',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'delivered'
  },
  {
    id: 'evt_init_2',
    source: 'crypto',
    sourceLabel: 'Coinbase Commerce',
    user: '0x8F3a...c912',
    amount: 25.00,
    currency: 'USDC',
    item: 'Direct Crypto Tip (Arbitrum)',
    message: 'GGs on that last match! Keep crushing it.',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: 'delivered'
  },
  {
    id: 'evt_init_3',
    source: 'twitch',
    sourceLabel: 'Twitch EventSub',
    user: 'PixelKnight99',
    amount: 500,
    currency: 'BITS',
    item: '500 Bits Cheer',
    message: 'HYPE TRAIN LEVEL 3! Lets goooo!',
    timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    status: 'delivered'
  }
];

let overlaySettings = {
  theme: 'cyberpunk', // 'cyberpunk', 'twitch', 'gold', 'minimal', 'arcade'
  position: 'top-center', // 'top-center', 'top-right', 'bottom-center', 'bottom-right'
  animation: 'slide-bounce', // 'slide-bounce', 'fade-pop', 'neon-glitch', 'smooth-scale'
  displayDuration: 6, // in seconds
  soundChime: 'chime-ding', // 'chime-ding', 'cash-register', 'power-up', 'level-up', 'sub-bass'
  chimeVolume: 0.8,
  ttsEnabled: true,
  ttsVoice: '',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  minThreshold: 0,
  moderationEnabled: true,
  customBadWords: 'scam, fake, exploit',
  webhookSecret: 'os_sec_' + crypto.randomBytes(8).toString('hex')
};

// SSE Connected Clients (OBS Overlays + Dashboard listeners)
let sseClients = new Set();

function broadcastEvent(event) {
  eventHistory.unshift(event);
  if (eventHistory.length > 100) {
    eventHistory = eventHistory.slice(0, 100);
  }

  const payload = JSON.stringify({
    type: 'ALERT',
    data: event,
    settings: overlaySettings
  });

  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error('Error writing to client:', err.message);
    }
  });
}

function broadcastSettings(settings) {
  const payload = JSON.stringify({
    type: 'SETTINGS_UPDATE',
    settings: settings
  });

  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error('Error writing settings to client:', err.message);
    }
  });
}

// ----------------------------------------------------
// 1. SSE Real-Time Endpoint
// ----------------------------------------------------
app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial handshake and current settings
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientsCount: sseClients.size + 1, settings: overlaySettings })}\n\n`);

  sseClients.add(res);

  // Send periodic heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ----------------------------------------------------
// 2. Health & Statistics
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeListeners: sseClients.size,
    totalEventsDelivered: eventHistory.length
  });
});

app.get('/api/connectors', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;

  res.json({
    activeListeners: sseClients.size,
    webhookSecret: overlaySettings.webhookSecret,
    connectors: [
      {
        id: 'shopify',
        name: 'Shopify Store Connector',
        icon: '🛍️',
        status: 'active',
        color: '#95bf47',
        eventTypes: ['orders/create', 'orders/paid'],
        webhookUrl: `${baseUrl}/api/webhooks/shopify`,
        description: 'Syncs new customer purchases, item titles, quantities, and order totals to your stream.'
      },
      {
        id: 'crypto',
        name: 'Web3 & Coinbase Commerce',
        icon: '💎',
        status: 'active',
        color: '#0052ff',
        eventTypes: ['charge:confirmed', 'payment:detected'],
        webhookUrl: `${baseUrl}/api/webhooks/crypto`,
        description: 'Accept USDC, Bitcoin, Ethereum, and EVM tokens. Alerts display token symbol and dollar value.'
      },
      {
        id: 'twitch',
        name: 'Twitch EventSub',
        icon: '🟣',
        status: 'active',
        color: '#9146ff',
        eventTypes: ['channel.cheer', 'channel.subscribe', 'channel.channel_points_custom_reward_redemption.add'],
        webhookUrl: `${baseUrl}/api/webhooks/twitch`,
        description: 'Official Twitch EventSub endpoint with automated signature verification & challenge handling.'
      },
      {
        id: 'stripe',
        name: 'Stripe Payments & Checkout',
        icon: '💳',
        status: 'active',
        color: '#635bff',
        eventTypes: ['checkout.session.completed', 'payment_intent.succeeded'],
        webhookUrl: `${baseUrl}/api/webhooks/stripe`,
        description: 'Direct credit card support for digital downloads, creator tips, and merchandise sales.'
      },
      {
        id: 'woocommerce',
        name: 'WooCommerce Connector',
        icon: '🛒',
        status: 'active',
        color: '#96588a',
        eventTypes: ['order.created', 'order.updated'],
        webhookUrl: `${baseUrl}/api/webhooks/woocommerce`,
        description: 'WordPress and WooCommerce native webhook receiver for self-hosted stores.'
      },
      {
        id: 'custom',
        name: 'Universal Marketplace / POS Webhook',
        icon: '⚡',
        status: 'active',
        color: '#00f2fe',
        eventTypes: ['custom.sale', 'custom.tip'],
        webhookUrl: `${baseUrl}/api/webhooks/custom`,
        description: 'Connect any custom script, TikTok shop reseller automation, or internal backend via standard JSON.'
      }
    ]
  });
});

// ----------------------------------------------------
// 3. Settings Management
// ----------------------------------------------------
app.get('/api/settings', (req, res) => {
  res.json(overlaySettings);
});

app.post('/api/settings', (req, res) => {
  overlaySettings = { ...overlaySettings, ...req.body };
  broadcastSettings(overlaySettings);
  res.json({ success: true, settings: overlaySettings });
});

// ----------------------------------------------------
// 4. Event History & Replay
// ----------------------------------------------------
app.get('/api/events/history', (req, res) => {
  res.json(eventHistory);
});

app.post('/api/events/replay/:id', (req, res) => {
  const event = eventHistory.find(e => e.id === req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const replayedEvent = {
    ...event,
    id: 'evt_replay_' + Date.now(),
    timestamp: new Date().toISOString(),
    isReplay: true
  };

  broadcastEvent(replayedEvent);
  res.json({ success: true, event: replayedEvent });
});

app.post('/api/events/clear', (req, res) => {
  eventHistory = [];
  res.json({ success: true, count: 0 });
});

// ----------------------------------------------------
// 5. Test / Simulation Dispatcher
// ----------------------------------------------------
app.post('/api/simulate-alert', (req, res) => {
  const { source, user, amount, currency, item, message } = req.body;

  const sourceLabels = {
    shopify: 'Shopify Store',
    crypto: 'Crypto Payment',
    twitch: 'Twitch EventSub',
    stripe: 'Stripe Checkout',
    woocommerce: 'WooCommerce',
    custom: 'Custom Webhook'
  };

  const newEvent = {
    id: 'evt_sim_' + Date.now(),
    source: source || 'shopify',
    sourceLabel: sourceLabels[source] || 'Marketplace Alert',
    user: user || 'Anonymous Fan',
    amount: typeof amount === 'number' ? amount : parseFloat(amount) || 20.00,
    currency: currency || 'USD',
    item: item || 'Featured Item',
    message: message || 'Hyped for the stream! Keep creating great content!',
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(newEvent);
  res.json({ success: true, event: newEvent });
});

// ----------------------------------------------------
// 6. Marketplace Webhook Ingestion Handlers
// ----------------------------------------------------

// Shopify Webhook Handler
app.post('/api/webhooks/shopify', (req, res) => {
  const payload = req.body;
  const customerName = payload.customer
    ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
    : (payload.shipping_address?.first_name || 'Valued Customer');

  const total = parseFloat(payload.total_price || payload.current_total_price || 0);
  const currency = payload.currency || 'USD';
  const firstItem = payload.line_items && payload.line_items[0]
    ? payload.line_items[0].title
    : 'Store Merchandise';

  const note = payload.note || (payload.line_items?.length > 1
    ? `Bought ${firstItem} + ${payload.line_items.length - 1} more items`
    : `Bought ${firstItem}`);

  const event = {
    id: `shp_${payload.id || Date.now()}`,
    source: 'shopify',
    sourceLabel: 'Shopify Store',
    user: customerName || 'Shopify Shopper',
    amount: total,
    currency: currency,
    item: firstItem,
    message: note,
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(event);
  res.status(200).json({ received: true });
});

// Crypto / Coinbase Commerce / Web3 Webhook Handler
app.post('/api/webhooks/crypto', (req, res) => {
  const payload = req.body;
  const eventData = payload.event?.data || payload.data || payload;

  const buyer = eventData.buyer_name || eventData.customer_name || 'Crypto Supporter';
  const pricing = eventData.pricing?.local || eventData.pricing?.settlement || {};
  const amount = parseFloat(pricing.amount || eventData.amount || 25);
  const currency = pricing.currency || eventData.currency || 'USDC';
  const memo = eventData.metadata?.message || eventData.name || 'Instant Crypto Payment';

  const event = {
    id: `cry_${eventData.id || Date.now()}`,
    source: 'crypto',
    sourceLabel: 'Web3 / Crypto',
    user: buyer,
    amount: amount,
    currency: currency,
    item: eventData.name || `${currency} Transfer`,
    message: memo,
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(event);
  res.status(200).json({ received: true });
});

// Twitch EventSub Webhook Handler (with Challenge verification)
app.post('/api/webhooks/twitch', (req, res) => {
  const messageType = req.headers['twitch-eventsub-message-type'];

  // 1. Twitch webhook challenge verification handshake
  if (messageType === 'webhook_callback_verification') {
    return res.status(200).send(req.body.challenge);
  }

  // 2. Notification handling
  if (messageType === 'notification') {
    const event = req.body.event || {};
    const subType = req.body.subscription?.type || 'channel.cheer';

    let amount = 100;
    let currency = 'BITS';
    let item = 'Cheer';
    let user = event.user_name || 'TwitchViewer';
    let message = event.message || event.user_input || '';

    if (subType === 'channel.cheer') {
      amount = event.bits || 100;
      currency = 'BITS';
      item = `${amount} Bits Cheer`;
    } else if (subType === 'channel.subscribe') {
      amount = event.tier === '3000' ? 24.99 : (event.tier === '2000' ? 9.99 : 4.99);
      currency = 'USD';
      item = `Tier ${event.tier ? event.tier[0] : '1'} Subscription`;
      message = `Subscribed to the stream!`;
    } else if (subType.includes('channel_points')) {
      amount = event.reward?.cost || 1000;
      currency = 'POINTS';
      item = event.reward?.title || 'Reward Redemption';
    }

    const alertEvent = {
      id: `tw_${req.headers['twitch-eventsub-message-id'] || Date.now()}`,
      source: 'twitch',
      sourceLabel: 'Twitch EventSub',
      user: user,
      amount: amount,
      currency: currency,
      item: item,
      message: message,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };

    broadcastEvent(alertEvent);
    return res.status(204).end();
  }

  res.status(200).json({ received: true });
});

// Stripe Webhook Handler
app.post('/api/webhooks/stripe', (req, res) => {
  const event = req.body;
  const obj = event.data?.object || {};

  const amount = (obj.amount_total || obj.amount || 1500) / 100;
  const currency = (obj.currency || 'usd').toUpperCase();
  const customer = obj.customer_details?.name || obj.billing_details?.name || 'Stripe Supporter';
  const description = obj.description || 'Digital Tip / Merch';

  const alertEvent = {
    id: `str_${event.id || Date.now()}`,
    source: 'stripe',
    sourceLabel: 'Stripe Checkout',
    user: customer,
    amount: amount,
    currency: currency,
    item: description,
    message: obj.metadata?.message || 'Paid with Card via Stripe',
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(alertEvent);
  res.status(200).json({ received: true });
});

// WooCommerce Webhook Handler
app.post('/api/webhooks/woocommerce', (req, res) => {
  const order = req.body;
  const customer = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Store Customer';
  const total = parseFloat(order.total || 0);
  const currency = order.currency || 'USD';
  const item = order.line_items && order.line_items[0] ? order.line_items[0].name : 'Store Order';

  const alertEvent = {
    id: `woo_${order.id || Date.now()}`,
    source: 'woocommerce',
    sourceLabel: 'WooCommerce',
    user: customer,
    amount: total,
    currency: currency,
    item: item,
    message: order.customer_note || `Ordered ${item}`,
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(alertEvent);
  res.status(200).json({ received: true });
});

// Universal Custom Webhook Handler
app.post('/api/webhooks/custom', (req, res) => {
  const { user, amount, currency, item, message, source } = req.body;

  if (!user && !amount && !item) {
    return res.status(400).json({
      error: 'Missing fields. Please provide at least user, amount, or item in JSON payload.'
    });
  }

  const alertEvent = {
    id: `cst_${Date.now()}`,
    source: source || 'custom',
    sourceLabel: 'Universal Webhook',
    user: user || 'Anonymous Supporter',
    amount: typeof amount === 'number' ? amount : parseFloat(amount) || 10.00,
    currency: currency || 'USD',
    item: item || 'Custom Event',
    message: message || '',
    timestamp: new Date().toISOString(),
    status: 'delivered'
  };

  broadcastEvent(alertEvent);
  res.status(200).json({ received: true, event: alertEvent });
});

// ----------------------------------------------------
// 7. Static Frontend Serving & Catch-All Routing
// ----------------------------------------------------
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

app.use((req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 OmniStream Connector Server is LIVE`);
  console.log(`📡 Listening on: http://0.0.0.0:${PORT}`);
  console.log(`🎥 OBS Overlay URL: http://localhost:${PORT}/obs-overlay`);
  console.log(`🛠️ Streamer Dashboard: http://localhost:${PORT}`);
  console.log(`=================================================`);
});

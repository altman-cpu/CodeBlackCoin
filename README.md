# ⚡ OmniStream Connector
### Universal Marketplace & Crypto Bridge for Live Streams & OBS Overlays

A full-stack application connecting e-commerce platforms, payment processors, and Web3 crypto checkouts directly to live stream broadcasts (OBS Studio, Streamlabs, Twitch).

Whenever a sale occurs on **Shopify**, **WooCommerce**, **Stripe**, **Web3 / Coinbase Commerce**, or **Twitch EventSub**, OmniStream captures the event, formats the notification, and instantly broadcasts an animated alert with crystal chime audio and AI Text-to-Speech (TTS) onto your stream.

---

## 🌟 Key Features

- 🔌 **Universal Marketplace Webhooks:**
  - **Shopify:** Captures orders, line items, customer names, and dollar totals.
  - **WooCommerce:** WordPress/WooCommerce webhook listener.
  - **Stripe:** Direct credit card tips, merchandise purchases, and checkout sessions.
  - **Web3 / Crypto Commerce:** Ingests confirmations for USDC, Bitcoin, Ethereum, and EVM transfers.
  - **Twitch EventSub:** Handles Bits/cheers, subscriptions, and channel point redemptions.
  - **Universal Custom Webhook:** JSON-based API for any POS, TikTok Shop, or reseller script.

- 🎥 **OBS Studio & Streamlabs Ready:**
  - Dedicated transparent browser source overlay at `/obs-overlay`.
  - Sequential Alert Queue to ensure no alert is missed during high-volume sales.
  - Customizable theme presets: *Cyberpunk Neon, Twitch Violet, Gold Royalty, Minimal Sleek, Retro Arcade*.
  - Real-time Server-Sent Events (SSE) synchronization.

- 🗣️ **React Text-to-Speech (TTS) Engine:**
  - Integrated browser-native SpeechSynthesis with customizable voice models, speech rate, and pitch.
  - Built-in **Streamer Safety & AI Moderation Guard** (auto-censors vulgarity and limits spam length).

- 🔊 **Web Audio Synthesized Alert Chimes:**
  - 100% reliable zero-dependency sound generator (Crystal Bell, Ka-Ching Cash Register, 8-Bit Arcade Power-Up, Victory Fanfare, Sub-Bass Impact).

---

## 🛠️ Architecture

```
[ Shopify / Stripe / Crypto / Twitch ]
                 │
                 ▼ (HTTP POST Webhooks)
     ┌───────────────────────┐
     │  Express Server:3000  │
     │  /api/webhooks/*      │
     └───────────┬───────────┘
                 │
                 ▼ (Server-Sent Events / SSE)
   ┌───────────────────────────┬───────────────────────────┐
   │                           │                           │
   ▼                           ▼                           ▼
[ OBS Studio Browser Source ] [ Streamlabs Desktop ]    [ Streamer Dashboard ]
(Transparent /obs-overlay)     (Live Alerts)            (Control & Analytics)
```

---

## 🚀 Quickstart & Setup

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Start the Server

```bash
npm start
# or: node server.js
```

The application runs on `http://0.0.0.0:3000`.

---

## 🎥 Setting Up in OBS Studio

1. In OBS Studio, go to your **Sources** panel, click **+**, and select **Browser**.
2. Name it `OmniStream Overlay`.
3. Set the **URL** to:
   ```
   http://localhost:3000/obs-overlay
   ```
4. Set **Width**: `1920` and **Height**: `1080`.
5. Check **Control audio via OBS** to mix alert chimes and TTS in your stream audio.
6. Click **OK**.

---

## 📡 Webhook Endpoints & Payloads

| Platform | Webhook Endpoint | Supported Events |
|---|---|---|
| **Shopify** | `POST /api/webhooks/shopify` | `orders/create`, `orders/paid` |
| **Crypto** | `POST /api/webhooks/crypto` | `charge:confirmed`, `payment:detected` |
| **Twitch** | `POST /api/webhooks/twitch` | `channel.cheer`, `channel.subscribe`, `channel_points` |
| **Stripe** | `POST /api/webhooks/stripe` | `checkout.session.completed`, `payment_intent.succeeded` |
| **WooCommerce** | `POST /api/webhooks/woocommerce` | `order.created`, `order.updated` |
| **Custom** | `POST /api/webhooks/custom` | Any JSON payload |

### Custom Webhook Example

```bash
curl -X POST http://localhost:3000/api/webhooks/custom \
  -H "Content-Type: application/json" \
  -d '{
    "user": "Elena Vance",
    "amount": 29.99,
    "currency": "USD",
    "item": "Cyberpunk Art Print",
    "message": "Love your content!"
  }'
```

---

## 📄 License
MIT License.

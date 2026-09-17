import React, { useState, useEffect } from 'react';
import OBSOverlay from './OBSOverlay';
import { playChime } from '../utils/audioChimes';
import { getAvailableVoices, speakAlert } from '../utils/speechTts';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('connectors');
  const [connectors, setConnectors] = useState([]);
  const [eventHistory, setEventHistory] = useState([]);
  const [activeListeners, setActiveListeners] = useState(0);
  const [copiedKey, setCopiedKey] = useState(null);
  const [selectedDocConnector, setSelectedDocConnector] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    theme: 'cyberpunk',
    position: 'top-center',
    animation: 'slide-bounce',
    displayDuration: 6,
    soundChime: 'chime-ding',
    chimeVolume: 0.8,
    ttsEnabled: true,
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    minThreshold: 0,
    moderationEnabled: true,
    customBadWords: 'scam, fake, exploit',
    webhookSecret: 'os_sec_live_994827'
  });

  // Simulator Form State
  const [simForm, setSimForm] = useState({
    source: 'shopify',
    user: 'Alex Rivera',
    amount: '49.99',
    currency: 'USD',
    item: 'Mechanical Gaming Keyboard',
    message: 'Hyped for the stream! Keep up the great grind.'
  });

  // Preview Event for in-dashboard overlay preview
  const [previewEvent, setPreviewEvent] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [saveStatus, setSaveStatus] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchConnectors();
    fetchSettings();
    fetchHistory();

    // Load available voices
    const loadVoices = () => {
      const voices = getAvailableVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Connect to SSE for dashboard live counters
    const es = new EventSource('/api/events/stream');
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'ALERT' && payload.data) {
          setEventHistory(prev => [payload.data, ...prev.slice(0, 49)]);
        }
        if (payload.clientsCount !== undefined) {
          setActiveListeners(payload.clientsCount);
        }
      } catch (err) {
        console.error(err);
      }
    };

    return () => {
      es.close();
    };
  }, []);

  const fetchConnectors = async () => {
    try {
      const res = await fetch('/api/connectors');
      const data = await res.json();
      setConnectors(data.connectors || []);
      if (data.activeListeners !== undefined) setActiveListeners(data.activeListeners);
    } catch (err) {
      console.error('Fetch connectors error:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Fetch settings error:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/events/history');
      const data = await res.json();
      setEventHistory(data || []);
    } catch (err) {
      console.error('Fetch history error:', err);
    }
  };

  const saveSettingsToServer = async (newSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setSaveStatus('Settings Saved!');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (err) {
      console.error('Save settings error:', err);
    }
  };

  const triggerSimulation = async (customPayload = null) => {
    const payload = customPayload || {
      ...simForm,
      amount: parseFloat(simForm.amount) || 20.00
    };

    try {
      const res = await fetch('/api/simulate-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setPreviewEvent(data.event);
        fetchHistory();
      }
    } catch (err) {
      console.error('Simulate alert error:', err);
    }
  };

  const replayEvent = async (id) => {
    try {
      const res = await fetch(`/api/events/replay/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPreviewEvent(data.event);
      }
    } catch (err) {
      console.error('Replay error:', err);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear event history?')) return;
    try {
      await fetch('/api/events/clear', { method: 'POST' });
      setEventHistory([]);
    } catch (err) {
      console.error('Clear history error:', err);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const obsOverlayUrl = `${window.location.origin}/obs-overlay`;

  // Calculate session revenue stats
  const totalRevenue = eventHistory.reduce((sum, evt) => {
    if (evt.currency === 'USD' || evt.currency === 'USDC') {
      return sum + (parseFloat(evt.amount) || 0);
    }
    return sum;
  }, 0);

  const totalBits = eventHistory.reduce((sum, evt) => {
    if (evt.currency === 'BITS') {
      return sum + (parseInt(evt.amount, 10) || 0);
    }
    return sum;
  }, 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0e17', color: '#f8fafc' }}>
      {/* Top Navbar */}
      <header style={{
        background: 'linear-gradient(180deg, #131726 0%, #0d101c 100%)',
        borderBottom: '1px solid #1e243a',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)'
          }}>
            ⚡
          </div>
          <div>
            <div style={{
              fontSize: '20px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(90deg, #ffffff, #cbd5e1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              OMNISTREAM CONNECTOR
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
              Universal Marketplace &amp; Crypto Bridge for OBS &amp; Live Streams
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '12px',
            fontWeight: 700
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }} />
            Backend Active
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            fontSize: '12px',
            fontWeight: 700
          }}>
            📡 {activeListeners} OBS Listener{activeListeners === 1 ? '' : 's'}
          </div>

          {/* Copy OBS Overlay Button */}
          <button
            onClick={() => copyToClipboard(obsOverlayUrl, 'obs-url')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              background: copiedKey === 'obs-url'
                ? '#10b981'
                : 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000000',
              fontWeight: 800,
              fontSize: '13px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0, 242, 254, 0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            <span>{copiedKey === 'obs-url' ? '✓ Copied!' : '🔗 Copy OBS Overlay URL'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 32px' }}>
        {/* Metric Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '28px'
        }}>
          {/* Card 1: Total Revenue */}
          <div style={{
            background: '#131826',
            border: '1px solid #1f2740',
            borderRadius: '14px',
            padding: '20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              Total Stream Revenue
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#10b981' }}>
              ${totalRevenue.toFixed(2)}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              Fiat &amp; USDC settled volume
            </div>
          </div>

          {/* Card 2: Twitch Bits */}
          <div style={{
            background: '#131826',
            border: '1px solid #1f2740',
            borderRadius: '14px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              Twitch Bits Cheered
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#bf94ff' }}>
              {totalBits.toLocaleString()} <span style={{ fontSize: '16px' }}>BITS</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              ~${(totalBits * 0.01).toFixed(2)} creator payout
            </div>
          </div>

          {/* Card 3: Events Handled */}
          <div style={{
            background: '#131826',
            border: '1px solid #1f2740',
            borderRadius: '14px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              Alerts Processed
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#38bdf8' }}>
              {eventHistory.length}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              Real-time SSE dispatches to OBS
            </div>
          </div>

          {/* Card 4: Active Connectors */}
          <div style={{
            background: '#131826',
            border: '1px solid #1f2740',
            borderRadius: '14px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              Active Marketplaces
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#fbbf24' }}>
              6 <span style={{ fontSize: '16px', color: '#94a3b8' }}>Platforms</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              Shopify, Stripe, Web3, Twitch, Woo, POS
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #1e243a',
          marginBottom: '28px',
          overflowX: 'auto',
          paddingBottom: '8px'
        }}>
          {[
            { id: 'connectors', label: '🔌 Marketplace Connectors', badge: '6' },
            { id: 'customizer', label: '🎨 OBS Overlay Customizer & Preview' },
            { id: 'tts', label: '🗣️ React TTS Studio' },
            { id: 'simulator', label: '🧪 Alert Simulator' },
            { id: 'feed', label: '📜 Live Event Log', badge: eventHistory.length },
            { id: 'guide', label: '📖 OBS Setup Guide' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: activeTab === tab.id ? '#1e243a' : 'transparent',
                color: activeTab === tab.id ? '#00f2fe' : '#94a3b8',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span style={{
                  background: activeTab === tab.id ? '#00f2fe' : '#334155',
                  color: activeTab === tab.id ? '#000000' : '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: CONNECTORS */}
        {activeTab === 'connectors' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>
                Active Marketplace Connectors
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                Point your store webhooks to these dedicated endpoints. When a sale, tip, or cheer occurs, OmniStream formats the event and immediately broadcasts it to your OBS overlay.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '20px'
            }}>
              {connectors.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    background: '#131826',
                    border: '1px solid #1e243a',
                    borderRadius: '14px',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>{conn.icon}</span>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                            {conn.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                            ● ACTIVE &amp; READY
                          </div>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
                      {conn.description}
                    </p>

                    {/* Webhook URL Input */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Webhook Ingestion URL
                      </label>
                      <div style={{
                        display: 'flex',
                        background: '#090c14',
                        border: '1px solid #1f2740',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        <input
                          type="text"
                          readOnly
                          value={conn.webhookUrl}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: '#38bdf8',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            padding: '10px 12px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={() => copyToClipboard(conn.webhookUrl, conn.id)}
                          style={{
                            background: copiedKey === conn.id ? '#10b981' : '#1e243a',
                            color: copiedKey === conn.id ? '#000' : '#f8fafc',
                            border: 'none',
                            padding: '0 14px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedKey === conn.id ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button
                      onClick={() => triggerSimulation({
                        source: conn.id === 'woocommerce' ? 'woocommerce' : conn.id,
                        user: conn.id === 'twitch' ? 'TwitchVIP' : 'Jordan Smith',
                        amount: conn.id === 'twitch' ? 250 : 34.50,
                        currency: conn.id === 'twitch' ? 'BITS' : (conn.id === 'crypto' ? 'USDC' : 'USD'),
                        item: conn.id === 'crypto' ? 'Direct Crypto Tip' : (conn.id === 'twitch' ? '250 Bits' : 'Gaming Headset Pro'),
                        message: 'Tested connection via OmniStream!'
                      })}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        background: '#1a2236',
                        border: '1px solid #2a3554',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Test Webhook
                    </button>

                    <button
                      onClick={() => setSelectedDocConnector(conn)}
                      style={{
                        padding: '9px 14px',
                        background: 'transparent',
                        border: '1px solid #2a3554',
                        borderRadius: '8px',
                        color: '#94a3b8',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Docs &amp; Payload
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: OVERLAY CUSTOMIZER & LIVE PREVIEW */}
        {activeTab === 'customizer' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) 1fr', gap: '28px' }}>
            {/* Left Column: Settings Form */}
            <div style={{
              background: '#131826',
              border: '1px solid #1e243a',
              borderRadius: '14px',
              padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Overlay Style &amp; Behavior
                </h3>
                {saveStatus && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>
                    {saveStatus}
                  </span>
                )}
              </div>

              {/* Theme Picker */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Visual Theme Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'cyberpunk', label: '⚡ Cyberpunk Neon', color: '#00f2fe' },
                    { id: 'twitch', label: '🟣 Twitch Violet', color: '#9146ff' },
                    { id: 'gold', label: '👑 Gold Royalty', color: '#fbbf24' },
                    { id: 'minimal', label: '🌑 Minimal Sleek', color: '#38bdf8' },
                    { id: 'arcade', label: '🕹️ Retro Arcade', color: '#39ff14' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        const newSettings = { ...settings, theme: t.id };
                        setSettings(newSettings);
                        saveSettingsToServer(newSettings);
                      }}
                      style={{
                        padding: '10px 14px',
                        background: settings.theme === t.id ? '#1e2842' : '#0c0f1a',
                        border: settings.theme === t.id ? `2px solid ${t.color}` : '1px solid #1f2740',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Overlay Screen Anchor
                </label>
                <select
                  value={settings.position}
                  onChange={(e) => {
                    const newSettings = { ...settings, position: e.target.value };
                    setSettings(newSettings);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value="top-center">Top Center (Recommended for Gaming)</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
              </div>

              {/* Sound Chime Selection */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Alert Sound Chime
                  </label>
                  <button
                    onClick={() => playChime(settings.soundChime, settings.chimeVolume)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#00f2fe',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🔊 Test Audio
                  </button>
                </div>
                <select
                  value={settings.soundChime}
                  onChange={(e) => {
                    const newSettings = { ...settings, soundChime: e.target.value };
                    setSettings(newSettings);
                    playChime(e.target.value, settings.chimeVolume);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value="chime-ding">Crystal Bell Harmonic (Clean &amp; Modern)</option>
                  <option value="cash-register">Ka-Ching Cash Register (Best for Sales)</option>
                  <option value="power-up">8-Bit Retro Power Up (Arcade)</option>
                  <option value="level-up">Victory Brass Fanfare (Major Triad)</option>
                  <option value="sub-bass">Cinematic Sub-Bass Drop (Deep Impact)</option>
                </select>
              </div>

              {/* Volume Slider */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Chime Volume
                  </label>
                  <span style={{ fontSize: '12px', color: '#00f2fe', fontWeight: 700 }}>
                    {Math.round(settings.chimeVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={settings.chimeVolume}
                  onChange={(e) => {
                    const newSettings = { ...settings, chimeVolume: parseFloat(e.target.value) };
                    setSettings(newSettings);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{ width: '100%', accentColor: '#00f2fe' }}
                />
              </div>

              {/* Display Duration */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Display Duration
                  </label>
                  <span style={{ fontSize: '12px', color: '#00f2fe', fontWeight: 700 }}>
                    {settings.displayDuration} Seconds
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="15"
                  step="1"
                  value={settings.displayDuration}
                  onChange={(e) => {
                    const newSettings = { ...settings, displayDuration: parseInt(e.target.value, 10) };
                    setSettings(newSettings);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{ width: '100%', accentColor: '#00f2fe' }}
                />
              </div>

              {/* Minimum Alert Threshold */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Minimum Amount to Alert ($ or BITS)
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.minThreshold}
                  onChange={(e) => {
                    const newSettings = { ...settings, minThreshold: parseFloat(e.target.value) || 0 };
                    setSettings(newSettings);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Set to 0 to trigger on all transactions.
                </span>
              </div>
            </div>

            {/* Right Column: Live Stream Simulator Canvas */}
            <div>
              <div style={{
                background: '#131826',
                border: '1px solid #1e243a',
                borderRadius: '14px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px 0' }}>
                      Live Stream OBS Canvas Preview
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                      This preview simulates how the alert renders over your stream gameplay/camera background.
                    </p>
                  </div>

                  <button
                    onClick={() => triggerSimulation()}
                    style={{
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                      color: '#000000',
                      fontWeight: 800,
                      fontSize: '13px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ Dispatch Test Alert
                  </button>
                </div>

                {/* Simulated Game/Stream Background Frame */}
                <div style={{
                  flex: 1,
                  minHeight: '420px',
                  borderRadius: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at center, #1b2440 0%, #0d1222 100%)',
                  border: '2px solid #202b48',
                  boxShadow: 'inset 0 0 50px rgba(0,0,0,0.8)'
                }}>
                  {/* Subtle Grid Lines to simulate game HUD */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    pointerEvents: 'none'
                  }} />

                  {/* Simulated Streamer Webcam Box in bottom right */}
                  <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '20px',
                    width: '180px',
                    height: '110px',
                    borderRadius: '8px',
                    border: '2px solid #38bdf8',
                    background: 'rgba(10, 15, 30, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontSize: '11px',
                    fontWeight: 700,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
                  }}>
                    <span style={{ fontSize: '20px', marginBottom: '4px' }}>🎥</span>
                    WEBCAM SOURCE
                  </div>

                  {/* Streamer Live Chat placeholder */}
                  <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '20px',
                    width: '200px',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: '#64748b',
                    fontSize: '11px',
                    lineHeight: 1.6
                  }}>
                    <div><b style={{ color: '#38bdf8' }}>viewer1:</b> Poggers!</div>
                    <div><b style={{ color: '#bf94ff' }}>crypto_fan:</b> W stream</div>
                    <div><b style={{ color: '#10b981' }}>mod_sarah:</b> check pinned!</div>
                  </div>

                  {/* Render the actual OBS overlay in preview mode */}
                  <OBSOverlay isPreview={true} previewEvent={previewEvent} />
                </div>

                {/* Quick instructions below preview */}
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  background: '#0c0f1a',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#94a3b8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>OBS Studio Resolution: <b>1920 × 1080</b> (or 800 × 400 for compact)</span>
                  <span style={{ color: '#00f2fe' }}>Background is 100% transparent in OBS</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REACT TTS STUDIO */}
        {activeTab === 'tts' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{
              background: '#131826',
              border: '1px solid #1e243a',
              borderRadius: '14px',
              padding: '28px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0' }}>
                    React Text-to-Speech (TTS) Studio
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                    Synthesize spoken donor announcements directly into your stream audio via Web Speech API.
                  </p>
                </div>

                {/* Master TTS Toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: settings.ttsEnabled ? '#10b981' : '#64748b' }}>
                    {settings.ttsEnabled ? 'TTS ENABLED' : 'TTS MUTED'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.ttsEnabled}
                    onChange={(e) => {
                      const newSettings = { ...settings, ttsEnabled: e.target.checked };
                      setSettings(newSettings);
                      saveSettingsToServer(newSettings);
                    }}
                    style={{ width: '20px', height: '20px', accentColor: '#10b981' }}
                  />
                </label>
              </div>

              {/* Voice Selector */}
              <div style={{ marginBottom: '22px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Spoken Voice Model
                </label>
                <select
                  value={settings.ttsVoice}
                  onChange={(e) => {
                    const newSettings = { ...settings, ttsVoice: e.target.value };
                    setSettings(newSettings);
                    saveSettingsToServer(newSettings);
                  }}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '12px 14px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value="">Default System Natural Voice</option>
                  {availableVoices.map((v, i) => (
                    <option key={i} value={v.name}>
                      {v.name} ({v.lang}) {v.default ? '★ Default' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Speed & Pitch Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '22px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Speech Speed Rate
                    </label>
                    <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                      {settings.ttsRate}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={settings.ttsRate}
                    onChange={(e) => {
                      const newSettings = { ...settings, ttsRate: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      saveSettingsToServer(newSettings);
                    }}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Voice Pitch
                    </label>
                    <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                      {settings.ttsPitch}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.05"
                    value={settings.ttsPitch}
                    onChange={(e) => {
                      const newSettings = { ...settings, ttsPitch: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      saveSettingsToServer(newSettings);
                    }}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
              </div>

              {/* Safety & Moderation Guard */}
              <div style={{
                background: '#0c0f1a',
                border: '1px solid #1f2740',
                borderRadius: '10px',
                padding: '18px',
                marginBottom: '22px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🛡️</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                        Streamer Safety &amp; Moderation Guard
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        Automatically blocks vulgarity and limits message length to prevent stream hijacking.
                      </div>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={settings.moderationEnabled}
                    onChange={(e) => {
                      const newSettings = { ...settings, moderationEnabled: e.target.checked };
                      setSettings(newSettings);
                      saveSettingsToServer(newSettings);
                    }}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Custom Blacklisted Words (comma separated)
                  </label>
                  <input
                    type="text"
                    value={settings.customBadWords}
                    onChange={(e) => {
                      const newSettings = { ...settings, customBadWords: e.target.value };
                      setSettings(newSettings);
                      saveSettingsToServer(newSettings);
                    }}
                    placeholder="badword1, scam, link"
                    style={{
                      width: '100%',
                      background: '#131826',
                      border: '1px solid #202b48',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Speech Test Sandbox */}
              <div style={{
                background: 'rgba(0, 242, 254, 0.05)',
                border: '1px solid rgba(0, 242, 254, 0.2)',
                borderRadius: '10px',
                padding: '18px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#00f2fe', marginBottom: '8px' }}>
                  🎙️ Test Voice Readout Now
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    id="ttsTestInput"
                    defaultValue="Sarah just bought the Mechanical Gaming Keyboard for forty nine dollars! Thank you for supporting the stream!"
                    style={{
                      flex: 1,
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 14px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('ttsTestInput');
                      speakAlert({
                        user: 'Sarah',
                        amount: 49.99,
                        currency: 'USD',
                        item: 'Mechanical Gaming Keyboard',
                        message: input ? input.value : 'Thank you for supporting!'
                      }, settings);
                    }}
                    style={{
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                      color: '#000000',
                      fontWeight: 800,
                      fontSize: '13px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    🔊 Speak
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ALERT SIMULATOR */}
        {activeTab === 'simulator' && (
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{
              background: '#131826',
              border: '1px solid #1e243a',
              borderRadius: '14px',
              padding: '28px'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>
                Interactive Alert Dispatch Simulator
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 24px 0' }}>
                Test any marketplace event format on demand. The event will instantly dispatch via Server-Sent Events to all open OBS Browser Sources and record in your event log.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Event Source
                  </label>
                  <select
                    value={simForm.source}
                    onChange={(e) => setSimForm({ ...simForm, source: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    <option value="shopify">🛍️ Shopify Store Purchase</option>
                    <option value="crypto">💎 Web3 / Crypto (USDC / ETH)</option>
                    <option value="twitch">🟣 Twitch EventSub (Bits Cheer)</option>
                    <option value="stripe">💳 Stripe Card Payment</option>
                    <option value="woocommerce">🛒 WooCommerce Order</option>
                    <option value="custom">⚡ Universal Custom Webhook</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Customer / Supporter Name
                  </label>
                  <input
                    type="text"
                    value={simForm.user}
                    onChange={(e) => setSimForm({ ...simForm, user: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={simForm.amount}
                    onChange={(e) => setSimForm({ ...simForm, amount: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Currency
                  </label>
                  <input
                    type="text"
                    value={simForm.currency}
                    onChange={(e) => setSimForm({ ...simForm, currency: e.target.value.toUpperCase() })}
                    placeholder="USD, USDC, BITS"
                    style={{
                      width: '100%',
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Item Name / Action Title
                </label>
                <input
                  type="text"
                  value={simForm.item}
                  onChange={(e) => setSimForm({ ...simForm, item: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Donor Message (Read by TTS)
                </label>
                <textarea
                  rows="3"
                  value={simForm.message}
                  onChange={(e) => setSimForm({ ...simForm, message: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#090c14',
                    border: '1px solid #1f2740',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                onClick={() => triggerSimulation()}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: '15px',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(0, 242, 254, 0.4)'
                }}
              >
                🚀 Trigger Alert &amp; Dispatch to OBS Overlay
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: LIVE EVENT LOG */}
        {activeTab === 'feed' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0' }}>
                  Live Event Feed &amp; Audit Log
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                  Real-time history of all marketplace webhooks received during this session.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={clearHistory}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Clear Feed
                </button>
              </div>
            </div>

            {eventHistory.length === 0 ? (
              <div style={{
                background: '#131826',
                borderRadius: '14px',
                padding: '48px',
                textAlign: 'center',
                color: '#64748b'
              }}>
                No events received yet. Dispatch a test alert in the simulator or connect your store!
              </div>
            ) : (
              <div style={{
                background: '#131826',
                border: '1px solid #1e243a',
                borderRadius: '14px',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#0d101c', borderBottom: '1px solid #1e243a', color: '#94a3b8' }}>
                      <th style={{ padding: '14px 20px', fontWeight: 700 }}>Time</th>
                      <th style={{ padding: '14px 20px', fontWeight: 700 }}>Source</th>
                      <th style={{ padding: '14px 20px', fontWeight: 700 }}>Customer / User</th>
                      <th style={{ padding: '14px 20px', fontWeight: 700 }}>Amount</th>
                      <th style={{ padding: '14px 20px', fontWeight: 700 }}>Item &amp; Message</th>
                      <th style={{ padding: '14px 20px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventHistory.map(evt => (
                      <tr key={evt.id} style={{ borderBottom: '1px solid #1a2034' }}>
                        <td style={{ padding: '14px 20px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: evt.source === 'shopify' ? 'rgba(149, 191, 71, 0.15)' :
                              evt.source === 'twitch' ? 'rgba(145, 70, 255, 0.15)' :
                                evt.source === 'crypto' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.1)',
                            color: evt.source === 'shopify' ? '#95bf47' :
                              evt.source === 'twitch' ? '#bf94ff' :
                                evt.source === 'crypto' ? '#38bdf8' : '#ffffff'
                          }}>
                            {evt.sourceLabel || evt.source}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#f8fafc' }}>
                          {evt.user}
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>
                          {evt.currency === 'BITS' ? `${evt.amount} BITS` : `$${evt.amount} ${evt.currency !== 'USD' ? evt.currency : ''}`}
                        </td>
                        <td style={{ padding: '14px 20px', color: '#cbd5e1' }}>
                          <div style={{ fontWeight: 600 }}>{evt.item}</div>
                          {evt.message && (
                            <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                              "{evt.message}"
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => replayEvent(evt.id)}
                            style={{
                              padding: '6px 12px',
                              background: '#1e243a',
                              border: '1px solid #2a3554',
                              color: '#38bdf8',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            🔁 Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: OBS SETUP GUIDE */}
        {activeTab === 'guide' && (
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>
            <div style={{
              background: '#131826',
              border: '1px solid #1e243a',
              borderRadius: '14px',
              padding: '32px'
            }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 12px 0' }}>
                How to Add OmniStream to OBS Studio &amp; Streamlabs
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
                Follow these simple steps to overlay real-time marketplace alerts directly on your live stream broadcast.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Step 1 */}
                <div style={{ display: 'flex', gap: '18px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#00f2fe',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    1
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                      Copy your dedicated Overlay URL
                    </h4>
                    <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 10px 0' }}>
                      Click the button below to copy the browser source link with your active credentials:
                    </p>
                    <div style={{
                      display: 'flex',
                      background: '#090c14',
                      border: '1px solid #1f2740',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      maxWidth: '560px'
                    }}>
                      <input
                        type="text"
                        readOnly
                        value={obsOverlayUrl}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          color: '#00f2fe',
                          padding: '10px 14px',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => copyToClipboard(obsOverlayUrl, 'guide-url')}
                        style={{
                          padding: '0 16px',
                          background: copiedKey === 'guide-url' ? '#10b981' : '#00f2fe',
                          color: '#000',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedKey === 'guide-url' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div style={{ display: 'flex', gap: '18px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#00f2fe',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    2
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                      Create a "Browser Source" in OBS
                    </h4>
                    <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                      In OBS Studio, navigate to the <b>Sources</b> dock, click the <b>+ (Add)</b> button, and choose <b>Browser</b>. Give it a name like <code style={{ color: '#00f2fe' }}>OmniStream Overlay</code>.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div style={{ display: 'flex', gap: '18px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#00f2fe',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    3
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                      Set Dimensions and Audio Settings
                    </h4>
                    <ul style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.8, margin: 0, paddingLeft: '20px' }}>
                      <li><b>URL:</b> Paste your copied OmniStream overlay URL.</li>
                      <li><b>Width:</b> <code style={{ color: '#38bdf8' }}>1920</code> (or matching canvas width)</li>
                      <li><b>Height:</b> <code style={{ color: '#38bdf8' }}>1080</code></li>
                      <li>Check <b>"Control audio via OBS"</b> to allow stream mixer control over chimes and TTS speech.</li>
                      <li>Leave <b>"Shutdown source when not visible"</b> unchecked so you never miss an incoming webhook alert!</li>
                    </ul>
                  </div>
                </div>

                {/* Step 4 */}
                <div style={{ display: 'flex', gap: '18px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    4
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                      Done! Test your alert live
                    </h4>
                    <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                      Head over to the <b>Alert Simulator</b> or click "Dispatch Test Alert". You'll hear the crystal chime and watch the animated alert pop up instantly over your stream scene!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payload Documentation Modal */}
      {selectedDocConnector && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#131826',
            border: '1px solid #1e243a',
            borderRadius: '16px',
            maxWidth: '620px',
            width: '100%',
            padding: '28px',
            position: 'relative'
          }}>
            <button
              onClick={() => setSelectedDocConnector(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '20px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '32px' }}>{selectedDocConnector.icon}</span>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  {selectedDocConnector.name} Integration Spec
                </h3>
                <span style={{ fontSize: '12px', color: '#38bdf8' }}>
                  HTTP POST JSON Endpoint
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '18px' }}>
              Configure your marketplace webhook to send HTTP POST requests to this URL when an order or payment is confirmed:
            </p>

            <div style={{
              background: '#090c14',
              border: '1px solid #1f2740',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#38bdf8',
              marginBottom: '18px',
              wordBreak: 'break-all'
            }}>
              {selectedDocConnector.webhookUrl}
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              Sample JSON Payload:
            </div>
            <pre style={{
              background: '#090c14',
              border: '1px solid #1f2740',
              borderRadius: '8px',
              padding: '14px',
              fontSize: '12px',
              color: '#a7f3d0',
              overflowX: 'auto',
              maxHeight: '200px',
              marginBottom: '20px'
            }}>
              {selectedDocConnector.id === 'shopify' ? JSON.stringify({
                id: 1234567890,
                total_price: "49.99",
                currency: "USD",
                customer: { first_name: "Sarah", last_name: "Jenkins" },
                line_items: [{ title: "Mechanical Gaming Keyboard", quantity: 1 }],
                note: "Ordered via stream recommendation!"
              }, null, 2) : selectedDocConnector.id === 'crypto' ? JSON.stringify({
                event: {
                  type: "charge:confirmed",
                  data: {
                    buyer_name: "0x8F3a...c912",
                    pricing: { local: { amount: "25.00", currency: "USDC" } },
                    name: "Direct Stream Tip",
                    metadata: { message: "GGs on that last match!" }
                  }
                }
              }, null, 2) : JSON.stringify({
                source: selectedDocConnector.id,
                user: "SupporterName",
                amount: 25.00,
                currency: "USD",
                item: "Special Edition Item",
                message: "Loving the stream today!"
              }, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedDocConnector(null)}
                style={{
                  padding: '10px 20px',
                  background: '#1e243a',
                  color: '#f8fafc',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

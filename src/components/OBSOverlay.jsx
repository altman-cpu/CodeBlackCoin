import React, { useState, useEffect, useRef } from 'react';
import { playChime } from '../utils/audioChimes';
import { speakAlert } from '../utils/speechTts';

export default function OBSOverlay({ isPreview = false, previewEvent = null }) {
  const [currentAlert, setCurrentAlert] = useState(null);
  const [settings, setSettings] = useState({
    theme: 'cyberpunk',
    position: 'top-center',
    animation: 'slide-bounce',
    displayDuration: 6,
    soundChime: 'chime-ding',
    chimeVolume: 0.8,
    ttsEnabled: true,
    ttsRate: 1.0,
    ttsPitch: 1.0,
    minThreshold: 0
  });

  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(100);

  // Set transparent body background if in pure OBS mode
  useEffect(() => {
    if (!isPreview) {
      document.body.classList.add('obs-mode');
    }
    return () => {
      document.body.classList.remove('obs-mode');
    };
  }, [isPreview]);

  // Handle previewEvent updates from the dashboard simulator
  useEffect(() => {
    if (isPreview && previewEvent) {
      displayAlert(previewEvent, settings);
    }
  }, [previewEvent]);

  // Connect to SSE stream
  useEffect(() => {
    if (isPreview) return;

    let eventSource = null;
    let reconnectTimeout = null;

    function connect() {
      eventSource = new EventSource('/api/events/stream');

      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.settings) {
            setSettings(prev => ({ ...prev, ...payload.settings }));
          }

          if (payload.type === 'ALERT' && payload.data) {
            const event = payload.data;
            // Check minimum threshold
            if (event.amount && event.amount < (settings.minThreshold || 0)) {
              return;
            }
            setQueue(prev => [...prev, event]);
          }
        } catch (err) {
          console.error('SSE JSON error:', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isPreview, settings.minThreshold]);

  // Queue worker
  useEffect(() => {
    if (queue.length > 0 && !isProcessing && !currentAlert) {
      const nextEvent = queue[0];
      setQueue(prev => prev.slice(1));
      displayAlert(nextEvent, settings);
    }
  }, [queue, isProcessing, currentAlert, settings]);

  const displayAlert = async (event, activeSettings) => {
    setIsProcessing(true);
    setCurrentAlert(event);
    setProgress(100);

    // 1. Play sound effect
    if (activeSettings.soundChime) {
      playChime(activeSettings.soundChime, activeSettings.chimeVolume);
    }

    // 2. Play TTS voice
    if (activeSettings.ttsEnabled) {
      speakAlert(event, activeSettings);
    }

    // 3. Progress bar animation
    const durationMs = (activeSettings.displayDuration || 6) * 1000;
    const intervalMs = 50;
    const step = 100 / (durationMs / intervalMs);

    const timer = setInterval(() => {
      setProgress(p => {
        if (p <= 0) {
          clearInterval(timer);
          return 0;
        }
        return Math.max(0, p - step);
      });
    }, intervalMs);

    setTimeout(() => {
      clearInterval(timer);
      setCurrentAlert(null);
      setIsProcessing(false);
    }, durationMs);
  };

  if (!currentAlert) {
    if (isPreview) {
      return (
        <div style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '14px',
          fontWeight: 500,
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          Waiting for alert trigger... (Click "Dispatch Test Alert")
        </div>
      );
    }
    return null;
  }

  // Theme styling definitions
  const themeStyles = {
    cyberpunk: {
      cardBg: 'linear-gradient(135deg, rgba(13, 17, 30, 0.95) 0%, rgba(20, 26, 48, 0.95) 100%)',
      border: '1.5px solid #00f2fe',
      boxShadow: '0 0 30px rgba(0, 242, 254, 0.35), 0 10px 40px rgba(0, 0, 0, 0.8)',
      accentColor: '#00f2fe',
      secondaryAccent: '#ff007f',
      textColor: '#ffffff',
      subTextColor: '#94a3b8',
      badgeBg: 'linear-gradient(90deg, #00f2fe 0%, #4facfe 100%)',
      badgeText: '#000000',
      progressBg: 'linear-gradient(90deg, #00f2fe, #ff007f)'
    },
    twitch: {
      cardBg: 'linear-gradient(135deg, rgba(18, 14, 30, 0.95) 0%, rgba(31, 20, 58, 0.95) 100%)',
      border: '1.5px solid #9146ff',
      boxShadow: '0 0 35px rgba(145, 70, 255, 0.4), 0 10px 40px rgba(0, 0, 0, 0.85)',
      accentColor: '#bf94ff',
      secondaryAccent: '#9146ff',
      textColor: '#ffffff',
      subTextColor: '#cbd5e1',
      badgeBg: '#9146ff',
      badgeText: '#ffffff',
      progressBg: 'linear-gradient(90deg, #9146ff, #bf94ff)'
    },
    gold: {
      cardBg: 'linear-gradient(135deg, rgba(20, 18, 12, 0.95) 0%, rgba(38, 32, 18, 0.95) 100%)',
      border: '1.5px solid #fbbf24',
      boxShadow: '0 0 35px rgba(251, 191, 36, 0.35), 0 10px 40px rgba(0, 0, 0, 0.85)',
      accentColor: '#fbbf24',
      secondaryAccent: '#f59e0b',
      textColor: '#ffffff',
      subTextColor: '#fef3c7',
      badgeBg: 'linear-gradient(90deg, #fbbf24 0%, #d97706 100%)',
      badgeText: '#000000',
      progressBg: 'linear-gradient(90deg, #fbbf24, #f59e0b)'
    },
    minimal: {
      cardBg: 'rgba(15, 23, 42, 0.92)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
      accentColor: '#38bdf8',
      secondaryAccent: '#818cf8',
      textColor: '#f8fafc',
      subTextColor: '#94a3b8',
      badgeBg: 'rgba(255, 255, 255, 0.15)',
      badgeText: '#ffffff',
      progressBg: '#38bdf8'
    },
    arcade: {
      cardBg: 'linear-gradient(135deg, rgba(10, 10, 20, 0.97) 0%, rgba(20, 10, 30, 0.97) 100%)',
      border: '2px solid #39ff14',
      boxShadow: '0 0 35px rgba(57, 255, 20, 0.4), inset 0 0 15px rgba(57, 255, 20, 0.2)',
      accentColor: '#39ff14',
      secondaryAccent: '#ff0055',
      textColor: '#ffffff',
      subTextColor: '#a7f3d0',
      badgeBg: '#39ff14',
      badgeText: '#000000',
      progressBg: 'linear-gradient(90deg, #39ff14, #ff0055)'
    }
  };

  const style = themeStyles[settings.theme] || themeStyles.cyberpunk;

  // Source badges & icons
  const sourceIcons = {
    shopify: { icon: '🛍️', label: 'SHOPIFY ORDER', color: '#95bf47' },
    woocommerce: { icon: '🛒', label: 'WOOCOMMERCE SALE', color: '#96588a' },
    crypto: { icon: '💎', label: 'WEB3 CRYPTO TIP', color: '#38bdf8' },
    twitch: { icon: '🟣', label: 'TWITCH CHEER', color: '#9146ff' },
    stripe: { icon: '💳', label: 'STRIPE CHECKOUT', color: '#635bff' },
    custom: { icon: '⚡', label: 'MARKETPLACE ALERT', color: '#f59e0b' }
  };

  const sourceMeta = sourceIcons[currentAlert.source] || sourceIcons.custom;

  // Position alignment styling
  const positionStyles = {
    'top-center': { top: isPreview ? '15px' : '40px', left: '50%', transform: 'translateX(-50%)' },
    'top-right': { top: isPreview ? '15px' : '40px', right: isPreview ? '15px' : '40px' },
    'bottom-center': { bottom: isPreview ? '15px' : '40px', left: '50%', transform: 'translateX(-50%)' },
    'bottom-right': { bottom: isPreview ? '15px' : '40px', right: isPreview ? '15px' : '40px' }
  };

  return (
    <div style={{
      position: isPreview ? 'relative' : 'fixed',
      ...(!isPreview ? positionStyles[settings.position] || positionStyles['top-center'] : {}),
      width: isPreview ? '90%' : '560px',
      maxWidth: '95vw',
      margin: isPreview ? '20px auto' : '0',
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      <div style={{
        background: style.cardBg,
        border: style.border,
        boxShadow: style.boxShadow,
        borderRadius: '16px',
        padding: '20px 24px',
        backdropFilter: 'blur(16px)',
        position: 'relative',
        overflow: 'hidden',
        animation: 'alertPopup 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}>
        {/* Subtle decorative glow orb */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '120px',
          height: '120px',
          background: style.accentColor,
          opacity: 0.15,
          borderRadius: '50%',
          filter: 'blur(30px)'
        }} />

        {/* Header row: Source label badge + Amount pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>{sourceMeta.icon}</span>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: style.accentColor
            }}>
              {sourceMeta.label}
            </span>
          </div>

          <div style={{
            background: style.badgeBg,
            color: style.badgeText,
            fontSize: '13px',
            fontWeight: 800,
            padding: '4px 12px',
            borderRadius: '999px',
            letterSpacing: '0.02em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            {currentAlert.currency === 'BITS'
              ? `${currentAlert.amount} BITS`
              : `${currentAlert.currency === 'USD' ? '$' : ''}${currentAlert.amount} ${currentAlert.currency !== 'USD' ? currentAlert.currency : ''}`}
          </div>
        </div>

        {/* Body content */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          {/* User Avatar Circle */}
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))',
            border: `1.5px solid ${style.accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 800,
            color: style.accentColor,
            flexShrink: 0
          }}>
            {currentAlert.user ? currentAlert.user.charAt(0).toUpperCase() : '★'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '20px',
              fontWeight: 800,
              color: style.textColor,
              lineHeight: 1.2,
              marginBottom: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {currentAlert.user}
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: style.subTextColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {currentAlert.item || 'New Supporter Event'}
            </div>
          </div>
        </div>

        {/* Message Bubble (if any) */}
        {currentAlert.message && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#e2e8f0',
            lineHeight: 1.4,
            marginBottom: '10px',
            fontStyle: 'italic',
            wordBreak: 'break-word'
          }}>
            "{currentAlert.message}"
          </div>
        )}

        {/* Animated Progress Bar */}
        <div style={{
          height: '3px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '999px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: style.progressBg,
            transition: 'width 0.05s linear'
          }} />
        </div>
      </div>

      <style>{`
        @keyframes alertPopup {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(-20px);
          }
          70% {
            transform: scale(1.02) translateY(3px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

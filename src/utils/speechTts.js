// Web Speech API TTS Engine with Streamer Moderation Guard

export function getAvailableVoices() {
  if (!('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices;
}

export function filterProfanity(text, customBadWords = '') {
  if (!text) return '';

  const defaultBadWords = ['scam', 'fake', 'exploit', 'bot', 'hack', 'drainer', 'phish'];
  const userWords = customBadWords
    ? customBadWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
    : [];

  const allWords = Array.from(new Set([...defaultBadWords, ...userWords]));

  let sanitized = text;
  allWords.forEach(badWord => {
    if (badWord.length > 1) {
      const reg = new RegExp(`\\b${badWord}\\b`, 'gi');
      sanitized = sanitized.replace(reg, '***');
    }
  });

  return sanitized;
}

export function speakAlert(event, settings = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    if (settings.ttsEnabled === false) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    // Prepare speech text
    let user = event.user || 'A viewer';
    let amountStr = event.amount ? `${event.amount} ${event.currency || 'dollars'}` : '';
    let item = event.item || '';
    let message = event.message || '';

    if (settings.moderationEnabled) {
      message = filterProfanity(message, settings.customBadWords);
      user = filterProfanity(user, settings.customBadWords);
    }

    // Truncate long messages to prevent TTS stream hijacking
    if (message.length > 180) {
      message = message.substring(0, 180) + ' and so on.';
    }

    let speechText = '';
    if (event.source === 'shopify' || event.source === 'woocommerce') {
      speechText = `${user} just ordered ${item} for ${amountStr}!`;
      if (message && message !== item) {
        speechText += ` Message: ${message}`;
      }
    } else if (event.source === 'crypto') {
      speechText = `${user} sent ${amountStr} via crypto! ${message}`;
    } else if (event.source === 'twitch') {
      speechText = `${user} cheered ${amountStr}! ${message}`;
    } else {
      speechText = `${user} sent ${amountStr}! ${message}`;
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.rate = Math.max(0.6, Math.min(settings.ttsRate || 1.0, 1.8));
    utterance.pitch = Math.max(0.5, Math.min(settings.ttsPitch || 1.0, 1.6));

    const voices = window.speechSynthesis.getVoices();
    if (settings.ttsVoice) {
      const matched = voices.find(v => v.name === settings.ttsVoice || v.voiceURI === settings.ttsVoice);
      if (matched) utterance.voice = matched;
    } else {
      const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.default));
      if (englishVoice) utterance.voice = englishVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    // Timeout safety
    setTimeout(() => resolve(), 8000);

    window.speechSynthesis.speak(utterance);
  });
}

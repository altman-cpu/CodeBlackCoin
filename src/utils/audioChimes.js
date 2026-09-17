// Web Audio API Synthesizer for OBS Stream Alert Chimes
// Zero external sound asset dependencies - 100% reliable in any browser or OBS CEF source

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playChime(chimeType = 'chime-ding', volume = 0.8) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(volume, 1.0)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (chimeType) {
      case 'chime-ding': {
        // Dual-harmonic crystal bell sound
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now); // A5
        osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.1);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, now); // E6

        gain1.gain.setValueAtTime(0.8, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        gain2.gain.setValueAtTime(0.4, now);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(masterGain);
        gain2.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.2);
        osc2.stop(now + 1.2);
        break;
      }

      case 'cash-register': {
        // Ka-Ching cash register effect
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);

          gain.gain.setValueAtTime(0.0, now);
          gain.gain.setValueAtTime(0.6, now + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.4);

          osc.connect(gain);
          gain.connect(masterGain);

          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.5);
        });

        // High shimmer finish
        const shimmer = ctx.createOscillator();
        const shimmerGain = ctx.createGain();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(2093, now + 0.25); // C7
        shimmerGain.gain.setValueAtTime(0.4, now + 0.25);
        shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
        shimmer.connect(shimmerGain);
        shimmerGain.connect(masterGain);
        shimmer.start(now + 0.25);
        shimmer.stop(now + 1.4);
        break;
      }

      case 'power-up': {
        // 8-Bit Arcade Power-Up
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';

        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.1);
        osc.frequency.linearRampToValueAtTime(660, now + 0.2);
        osc.frequency.linearRampToValueAtTime(880, now + 0.35);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }

      case 'level-up': {
        // Victory fanfare
        const notes = [
          { f: 523.25, t: 0.00, d: 0.12 }, // C5
          { f: 659.25, t: 0.12, d: 0.12 }, // E5
          { f: 783.99, t: 0.24, d: 0.12 }, // G5
          { f: 1046.5, t: 0.36, d: 0.50 }  // C6
        ];

        notes.forEach(note => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(note.f, now + note.t);

          gain.gain.setValueAtTime(0, now);
          gain.gain.setValueAtTime(0.25, now + note.t);
          gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

          osc.connect(gain);
          gain.connect(masterGain);

          osc.start(now + note.t);
          osc.stop(now + note.t + note.d);
        });
        break;
      }

      case 'sub-bass': {
        // Deep cinematic sub-bass impact
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);

        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 1.0);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

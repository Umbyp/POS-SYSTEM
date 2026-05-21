/**
 * Sound utility — synthesized via Web Audio API (no asset files needed)
 *
 * - playBeep: KDS new order alert (sharp 2-tone beep)
 * - playCashRegister: payment received "cha-ching" (3-note pleasant chime)
 * - playSuccess: generic success ding
 */

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function isMuted(key = 'app-sound-muted'): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(key) === '1';
}

export function setMuted(muted: boolean, key = 'app-sound-muted') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, muted ? '1' : '0');
}

export function getMuted(key = 'app-sound-muted'): boolean {
  return isMuted(key);
}

// KDS new order — sharp 2-tone
export function playBeep(force = false) {
  if (!force && isMuted('kds-muted')) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => ctx.close();
}

// Payment received — cha-ching style (3-note chord)
export function playCashRegister(force = false) {
  if (!force && isMuted('payment-muted')) return;
  const ctx = getCtx();
  if (!ctx) return;

  // 3 notes in sequence forming a major chord (C5 → E5 → G5)
  const notes = [
    { freq: 523.25, start: 0, duration: 0.18 },    // C5
    { freq: 659.25, start: 0.08, duration: 0.22 }, // E5
    { freq: 783.99, start: 0.16, duration: 0.45 }, // G5
  ];

  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + n.start);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + n.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.start + n.duration);
    osc.start(ctx.currentTime + n.start);
    osc.stop(ctx.currentTime + n.start + n.duration);
  }

  // Add a brief "bell" overtone for cha-ching effect
  const bell = ctx.createOscillator();
  const bellGain = ctx.createGain();
  bell.connect(bellGain);
  bellGain.connect(ctx.destination);
  bell.type = 'sine';
  bell.frequency.setValueAtTime(2093, ctx.currentTime + 0.16); // C7
  bellGain.gain.setValueAtTime(0.0001, ctx.currentTime + 0.16);
  bellGain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.18);
  bellGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
  bell.start(ctx.currentTime + 0.16);
  bell.stop(ctx.currentTime + 0.75);
  bell.onended = () => ctx.close();
}

// Generic success ding
export function playSuccess(force = false) {
  if (!force && isMuted('app-sound-muted')) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
  osc.frequency.exponentialRampToValueAtTime(2093, ctx.currentTime + 0.15); // C7
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
  osc.onended = () => ctx.close();
}

// Small synthesised sound effects (Web Audio): no audio files to ship or load.
// Browsers only allow sound after a user gesture, so the context is created on the first click.

export type SoundKind = 'new' | 'cook' | 'ready' | 'serve' | 'paid' | 'late' | 'arrive' | 'cancel';

let ctx: AudioContext | null = null;
let enabled = true;
const last: Partial<Record<SoundKind, number>> = {};
const KEY = 'world-preview-sound';

try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  // storage can be blocked; default to on
}

export const soundEnabled = () => enabled;
export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}

/** Call from a click/tap handler (or the first pointerdown). */
export function initAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(t0: number, dur: number, gain: number, freq: number) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

export function playSound(kind: SoundKind) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const wall = performance.now();
  if (wall - (last[kind] ?? -1e9) < 250) return; // never machine-gun the same sound
  last[kind] = wall;
  switch (kind) {
    case 'new': // soft two-note door-bell
      tone(784, now, 0.5, 'sine', 0.14);
      tone(988, now + 0.16, 0.6, 'sine', 0.14);
      break;
    case 'cook': // sizzle
      noise(now, 0.7, 0.07, 4200);
      break;
    case 'ready': // happy rising chime
      [660, 830, 988, 1319].forEach((f, i) => tone(f, now + i * 0.09, 0.45, 'triangle', 0.13));
      break;
    case 'serve': // plate set down
      tone(520, now, 0.12, 'sine', 0.12, 330);
      noise(now, 0.06, 0.05, 2400);
      break;
    case 'paid': // cha-ching
      tone(1568, now, 0.12, 'square', 0.07);
      tone(2093, now + 0.08, 0.5, 'square', 0.07);
      noise(now, 0.12, 0.05, 6000);
      break;
    case 'late': // two low warning beeps
      tone(300, now, 0.16, 'sawtooth', 0.07);
      tone(300, now + 0.24, 0.16, 'sawtooth', 0.07);
      break;
    case 'arrive': // tiny entrance chime
      tone(1175, now, 0.25, 'sine', 0.08);
      tone(1568, now + 0.1, 0.3, 'sine', 0.08);
      break;
    case 'cancel':
      tone(420, now, 0.3, 'sine', 0.1, 180);
      break;
  }
}

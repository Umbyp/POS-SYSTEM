/**
 * Web Speech API helper for announcing incoming payments.
 * Uses browser's built-in synthesis — no external service needed.
 */

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  if (cachedVoices.length) return cachedVoices;
  cachedVoices = window.speechSynthesis.getVoices();
  return cachedVoices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

/** Pick the best available voice for the given language tag */
function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  // Prefer exact match, then prefix match
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]))
  );
}

export interface SpeakOptions {
  lang?: string; // 'th-TH' | 'en-US'
  rate?: number; // 0.1 .. 10 (default 1)
  pitch?: number;
  volume?: number;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  // Cancel any current speech so urgent announcements aren't queued behind stale ones
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang || 'th-TH';
  u.rate = opts.rate ?? 1.0;
  u.pitch = opts.pitch ?? 1.0;
  u.volume = opts.volume ?? 1.0;
  const voice = pickVoice(u.lang);
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

/**
 * Announce a payment in Thai.
 * Example: "ได้รับเงิน 1,250 บาท" / "Received 1,250 baht"
 */
export function announcePayment(amount: number, lang: 'th' | 'en' = 'th'): void {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

  const text =
    lang === 'th'
      ? `ได้รับเงิน ${formatted} บาท`
      : `Received ${formatted} baht`;

  speak(text, { lang: lang === 'th' ? 'th-TH' : 'en-US', rate: 1.05 });
}

/** Check if voice announcement is available */
export function isVoiceAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

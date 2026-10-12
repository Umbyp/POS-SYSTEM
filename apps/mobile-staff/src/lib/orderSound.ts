/**
 * New-order chime for the kitchen screen.
 *
 * expo-audio is a native module: a build made before it was added doesn't contain it, and importing
 * it there throws. Everything is behind try/catch so such a build keeps working (flash + vibration only)
 * and `soundAvailable()` tells the UI whether sound can actually play.
 */
import { requireOptionalNativeModule } from 'expo';

let player: { play: () => void; seekTo: (s: number) => unknown; volume: number } | null = null;
let attempted = false;

function ensure() {
  if (attempted) return player;
  attempted = true;
  try {
    // Probe first: requiring expo-audio in a build without the native module logs a red-box error even if caught.
    if (!requireOptionalNativeModule('ExpoAudio')) return player;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio');
    // Kitchen tablets are often left on silent — the alert must still be heard.
    audio.setAudioModeAsync?.({ playsInSilentMode: true, interruptionMode: 'duckOthers' })?.catch?.(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    player = audio.createAudioPlayer(require('../../assets/sounds/new-order.wav'));
    if (player) player.volume = 1;
  } catch {
    player = null;
  }
  return player;
}

export function soundAvailable(): boolean {
  return ensure() != null;
}

export function playNewOrderSound() {
  try {
    const p = ensure();
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {
    /* audio session unavailable — the visual flash still shows */
  }
}

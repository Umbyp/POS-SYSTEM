import { View } from 'react-native';

/**
 * Flat status spine: a static colored bar next to a row/card that has a
 * status. Only status-bearing content gets one — plain rows (e.g. a product
 * card) never do.
 */
export function Spine({ color }: { color: string }) {
  return <View style={{ backgroundColor: color, alignSelf: 'stretch' }} className="w-1.5 rounded-full" />;
}

/**
 * Time-fill gauge spine: a bottom-anchored fill inside a fixed neutral
 * track, used on KDS ticket cards. `ratio` (0–1) is elapsed/allowed wait
 * time; the fill's color is the ticket's status color, independent of ratio.
 */
export function SpineGauge({ color, ratio, trackColor }: { color: string; ratio: number; trackColor: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    // Absolutely positioned so the percentage-height fill never feeds back into
    // the card's own (auto) height — the parent must be `relative` and pad left 8px.
    <View style={{ backgroundColor: trackColor }} className="absolute left-0 top-0 bottom-0 w-2 overflow-hidden justify-end">
      <View style={{ backgroundColor: color, height: `${clamped * 100}%` }} className="w-full" />
    </View>
  );
}

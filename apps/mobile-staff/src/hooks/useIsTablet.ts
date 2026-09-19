import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;

/** Single source of truth for the phone/tablet layout breakpoint. */
export function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT;
}

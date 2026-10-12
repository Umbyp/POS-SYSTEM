import type { ViewStyle } from 'react-native';

/** Max width for single-column lists / forms on tablets. */
export const CONTENT_MAX = 720;
/** Max width for 2-column grids on tablets. */
export const GRID_MAX = 1040;

/** Centered, width-capped container style (no-op on phones). */
export function centered(isTablet: boolean, max: number = CONTENT_MAX): ViewStyle {
  return isTablet ? { width: '100%', maxWidth: max, alignSelf: 'center' } : {};
}

/**
 * Class names for the dim-overlay + panel pair used by bottom-sheet modals:
 * bottom sheet on phones, centered width-limited card on tablets.
 */
export function sheetClasses(isTablet: boolean) {
  return {
    overlay: `flex-1 bg-black/40 dark:bg-black/60 ${isTablet ? 'items-center justify-center' : 'justify-end'}`,
    panel: isTablet ? 'w-[520px] max-w-[94%] rounded-[14px]' : 'rounded-t-[14px]',
  };
}

import { useColorScheme } from 'nativewind';

/**
 * Theme-aware values for places Tailwind classes can't reach: icon `color=`
 * props, placeholders, switch tracks, native headers / tab bars, spinners.
 * Mirrors tailwind.config.js tokens (light vs `dark-*`).
 */
export interface ThemeColors {
  isDark: boolean;
  background: string;
  card: string;
  border: string;
  muted: string;
  foreground: string;
  /** Secondary text / icons (>= 4.5:1 on card + background). */
  mutedForeground: string;
  /** Faint decorative icons (chevrons, empty-state glyphs). Not for text. */
  faint: string;
  placeholder: string;
  primary: string;
  danger: string;
  success: string;
  warning: string;
  /** Modal scrim. */
  overlay: string;
}

const LIGHT: ThemeColors = {
  isDark: false,
  background: '#F5F5F5',
  card: '#FFFFFF',
  border: '#E6E6E6',
  muted: '#EFEFEF',
  foreground: '#1F1F1F',
  mutedForeground: '#707070',
  faint: '#9CA3AF',
  placeholder: '#8F8F8F',
  primary: '#D25E3B',
  danger: '#B91C1C',
  success: '#047857',
  warning: '#B45309',
  overlay: 'rgba(0,0,0,0.4)',
};

const DARK: ThemeColors = {
  isDark: true,
  background: '#161616',
  card: '#212121',
  border: '#3A3A3A',
  muted: '#2C2C2C',
  foreground: '#F5F5F5',
  mutedForeground: '#A3A3A3',
  faint: '#8A8A8A',
  placeholder: '#8A8A8A',
  primary: '#E07A57',
  danger: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? DARK : LIGHT;
}

/** @type {import('tailwindcss').Config} */
// Colors mirror apps/web/tailwind.config.ts + globals.css. Web drives them
// with CSS custom properties (for the light/dark toggle); RN has no CSS vars,
// so both palettes are inlined here and selected via NativeWind's `dark:` variant.
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#F5F5F5',
        card: '#FFFFFF',
        'card-hover': '#EFEFEF',
        muted: { DEFAULT: '#EFEFEF', foreground: '#707070' },
        border: '#E6E6E6',
        input: '#FFFFFF',
        foreground: '#1F1F1F',

        'dark-background': '#161616',
        'dark-card': '#212121',
        'dark-card-hover': '#2C2C2C',
        'dark-muted': '#2C2C2C',
        'dark-muted-foreground': '#A3A3A3',
        'dark-border': '#3A3A3A',
        'dark-input': '#212121',
        'dark-foreground': '#F5F5F5',
        // Status text colours tuned for >= 4.5:1 on dark-card / dark-background.
        'dark-success': '#4ADE80',
        'dark-warning': '#FBBF24',
        'dark-danger': '#F87171',
        'dark-info': '#60A5FA',

        primary: {
          DEFAULT: '#D25E3B',
          foreground: '#FFFFFF',
          50: '#F3E5E2',
          100: '#E9CFC8',
          400: '#E07A57',
          500: '#D25E3B',
          600: '#B84B2B',
          700: '#963820',
        },
        accent: { DEFAULT: '#B45309', foreground: '#FFFFFF' },
        success: '#047857',
        warning: '#B45309',
        danger: '#B91C1C',
        info: '#1D4ED8',
        destructive: { DEFAULT: '#B91C1C', foreground: '#FFFFFF' },

        // Bright fill colors for the KDS status-spine gauge (SpineGauge) —
        // distinct from success/warning/danger/info, which are tuned for
        // small-text contrast, not a wide fill bar against a dark track.
        spine: {
          pending: '#FBBF24',
          preparing: '#60A5FA',
          ready: '#4ADE80',
          overdue: '#F87171',
        },
      },
      fontSize: {
        'metric-sm': ['1.5rem', { lineHeight: '1.1', fontWeight: '700' }],
        'metric-md': ['2rem', { lineHeight: '1.1', fontWeight: '700' }],
        'metric-lg': ['2.75rem', { lineHeight: '1', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};

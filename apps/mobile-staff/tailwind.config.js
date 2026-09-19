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
        background: '#FBF6F0',
        card: '#FFFFFF',
        'card-hover': '#F2E9E0',
        muted: { DEFAULT: '#F2E9E0', foreground: '#7A6A5C' },
        border: '#E7DACE',
        input: '#FFFFFF',
        foreground: '#2B1F17',

        'dark-background': '#23180F',
        'dark-card': '#2F2117',
        'dark-card-hover': '#3B2A1E',
        'dark-muted': '#3B2A1E',
        'dark-muted-foreground': '#B9A392',
        'dark-border': '#4A3627',
        'dark-input': '#2F2117',
        'dark-foreground': '#FBF6F0',

        primary: {
          DEFAULT: '#C9622E',
          foreground: '#FFFFFF',
          50: '#F6E6DC',
          100: '#EFD3C0',
          400: '#D97D46',
          500: '#C9622E',
          600: '#A64B1F',
          700: '#853A17',
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

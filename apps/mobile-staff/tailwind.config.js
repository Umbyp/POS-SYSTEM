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
        background: '#F5F6F8',
        card: '#FFFFFF',
        'card-hover': '#F9FAFB',
        muted: { DEFAULT: '#F3F4F6', foreground: '#6B7280' },
        border: '#E5E7EB',
        input: '#FFFFFF',
        foreground: '#111827',

        'dark-background': '#090D16',
        'dark-card': '#151C2C',
        'dark-card-hover': '#1E273C',
        'dark-muted': '#1E273C',
        'dark-muted-foreground': '#949EB2',
        'dark-border': '#2A354F',
        'dark-input': '#1E273C',
        'dark-foreground': '#F5F6F8',

        primary: {
          DEFAULT: '#FF6B35',
          foreground: '#FFFFFF',
          50: '#FFF4F0',
          100: '#FFE4D6',
          400: '#FF8A5C',
          500: '#FF6B35',
          600: '#F25525',
          700: '#D14315',
        },
        accent: { DEFAULT: '#F59E0B', foreground: '#FFFFFF' },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        destructive: { DEFAULT: '#EF4444', foreground: '#FFFFFF' },
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

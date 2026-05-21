import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Light mode palette — RestroBit-inspired
        background: '#F5F6F8',        // App background (very light gray)
        card: '#FFFFFF',              // Cards (pure white)
        'card-hover': '#F9FAFB',      // Hover state
        muted: {
          DEFAULT: '#F3F4F6',
          foreground: '#6B7280',      // Secondary text
        },
        border: '#E5E7EB',            // Soft borders
        input: '#FFFFFF',
        foreground: '#111827',        // Primary text (near black)

        // Primary — Orange (RestroBit signature)
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
        // Accent — Soft warning yellow for highlights
        accent: {
          DEFAULT: '#F59E0B',
          foreground: '#FFFFFF',
        },
        // Semantic
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        ring: '#FF6B35',
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      fontSize: {
        'metric-sm': ['1.5rem', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'metric-md': ['2rem', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'metric-lg': ['2.75rem', { lineHeight: '1', fontWeight: '700', letterSpacing: '-0.03em' }],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0,0,0,0.04)',
        'card': '0 1px 3px 0 rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)',
        'card-hover': '0 4px 12px -2px rgba(0,0,0,0.08)',
        'pop': '0 8px 24px -4px rgba(0,0,0,0.12)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;

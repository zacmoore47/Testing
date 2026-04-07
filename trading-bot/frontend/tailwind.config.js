/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0a0d12', surface: '#0f1318', elevated: '#151b22' },
        bull: '#22c55e',
        bear: '#ef4444',
        warn: '#f59e0b',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui'],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.07)',
      },
    },
  },
  plugins: [],
};

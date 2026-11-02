/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'film-black':     '#0e0d0c',
        'film-dark':      '#1a1816',
        'film-surface':   '#242220',
        'film-border':    '#3a3632',
        'film-muted':     '#6b6560',
        'film-text':      '#e8e0d5',
        'film-text-dim': '#9e9690',
        'film-amber':     '#c8a96e',
        'film-amber-dim': '#8a7048',
        'film-red':       '#c45c3a',
        'film-teal':      '#4a8a7e',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

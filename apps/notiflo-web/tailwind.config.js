const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(
      __dirname,
      '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'
    ),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        deep: '#06080d',
        surface: '#0c1019',
        elevated: '#141925',
        panel: '#1a2130',
        border: '#1e2736',
        'border-bright': '#2a3548',
        'text-primary': '#e8ecf1',
        'text-secondary': '#7a8599',
        'text-muted': '#4a5568',
        neon: {
          green: '#22c55e',
          cyan: '#06b6d4',
          amber: '#f59e0b',
          rose: '#f43f5e',
          violet: '#8b5cf6',
        },
        glow: {
          green: 'rgba(34,197,94,0.15)',
          cyan: 'rgba(6,182,212,0.15)',
          amber: 'rgba(245,158,11,0.15)',
          rose: 'rgba(244,63,94,0.15)',
          violet: 'rgba(139,92,246,0.15)',
        },
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34,197,94,0.15), 0 0 60px rgba(34,197,94,0.05)',
        'glow-cyan': '0 0 20px rgba(6,182,212,0.15), 0 0 60px rgba(6,182,212,0.05)',
        'glow-violet': '0 0 20px rgba(139,92,246,0.15), 0 0 60px rgba(139,92,246,0.05)',
        'glow-amber': '0 0 20px rgba(245,158,11,0.15), 0 0 60px rgba(245,158,11,0.05)',
        'glow-rose': '0 0 20px rgba(244,63,94,0.15), 0 0 60px rgba(244,63,94,0.05)',
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(30,39,54,0.5)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(42,53,72,0.8)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-in': 'fade-in 0.5s ease-out',
        'stagger-in': 'stagger-in 0.6s ease-out both',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'stagger-in': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(30,39,54,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(30,39,54,0.3) 1px, transparent 1px)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        'grid-40': '40px 40px',
      },
    },
  },
  plugins: [],
};

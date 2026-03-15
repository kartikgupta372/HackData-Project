/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          void:     '#060608',
          base:     '#0c0c10',
          surface:  '#111116',
          card:     '#18181f',
          elevated: '#1f1f28',
          border:   '#2a2a35',
          line:     '#1e1e26',
          accent:   '#7c5cfc',
          'accent-dim': '#5a3fd4',
          'accent-glow': '#9d7fff',
          'accent-subtle': 'rgba(124,92,252,0.12)',
          text:     '#e8e8f0',
          muted:    '#6b6b80',
          faint:    '#3a3a48',
          success:  '#34d399',
          warn:     '#fbbf24',
          error:    '#f87171',
        }
      },
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in':    'fadeIn 0.3s ease forwards',
        'slide-up':   'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
        'spotlight': 'spotlight 2s ease 0.75s 1 forwards',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        glowPulse: { '0%,100%': { opacity: 0.6 }, '50%': { opacity: 1 } },
        cursorBlink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        spotlight: { '0%': { opacity: 0, transform: 'translate(-72%, -62%) scale(0.5)' }, '100%': { opacity: 1, transform: 'translate(-50%, -40%) scale(1)' } },
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(124,92,252,0.3)',
        'glow':     '0 0 24px rgba(124,92,252,0.4)',
        'glow-lg':  '0 0 48px rgba(124,92,252,0.35)',
        'card':     '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
        'elevated': '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
}

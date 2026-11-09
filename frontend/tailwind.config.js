const c = (name) => `rgb(var(--aura-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          void:     c('void'),
          base:     c('base'),
          surface:  c('surface'),
          card:     c('card'),
          elevated: c('elevated'),
          border:   c('border'),
          line:     c('line'),
          accent:   c('accent'),
          'accent-dim':  c('accent-dim'),
          'accent-glow': c('accent-glow'),
          'accent-subtle': 'rgb(var(--aura-accent) / 0.12)',
          'on-accent': c('on-accent'),
          text:     c('text'),
          muted:    c('muted'),
          faint:    c('faint'),
          success:  c('success'),
          warn:     c('warn'),
          error:    c('error'),
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body:    ['var(--font-body)', 'sans-serif'],
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
        'glow-sm':  '0 0 12px rgb(var(--aura-accent) / 0.3)',
        'glow':     '0 0 24px rgb(var(--aura-accent) / 0.4)',
        'glow-lg':  '0 0 48px rgb(var(--aura-accent) / 0.35)',
        'card':     '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
        'elevated': '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      backdropBlur: { xs: '4px' },
    },
  },
  plugins: [],
}

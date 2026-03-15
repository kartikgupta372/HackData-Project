import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy all API calls through Vite in dev — avoids any CORS/cookie issues
    proxy: {
      '/auth':            { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/chat':            { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/heatmap':         { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/recommendations': { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/uploads':         { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/health':          { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/onboarding':      { target: 'http://localhost:3002', changeOrigin: true, secure: false },
      '/insights':         { target: 'http://localhost:3002', changeOrigin: true, secure: false },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:    ['react', 'react-dom', 'react-router-dom'],
          ui:        ['framer-motion', 'lucide-react'],
          data:      ['@tanstack/react-query', 'zustand', 'axios'],
          markdown:  ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
        },
      },
    },
  },
})

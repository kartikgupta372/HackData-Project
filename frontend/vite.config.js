import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where the dev server forwards API calls. Matches backend/.env PORT.
  const target = env.VITE_DEV_API_TARGET || 'http://localhost:3002'
  const proxied = ['/auth', '/chat', '/heatmap', '/recommendations', '/uploads', '/health', '/onboarding', '/insights']

  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['tslib', '@radix-ui/react-dialog', '@radix-ui/react-tooltip'],
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: Object.fromEntries(proxied.map(p => [p, { target, changeOrigin: true, secure: false }])),
  },
  build: {
    // Don't publish source maps (they expose your full source code).
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
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
}
})

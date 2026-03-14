// src/app.js
// Express entry point — boots DB, LangGraph, and starts the server

// ── Global safety nets — prevent unhandled async errors from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Rejection (non-fatal):', reason?.message ?? reason);
});
process.on('uncaughtException', (err) => {
  // Only crash on truly fatal errors, not Puppeteer / network failures
  if (err.code === 'ERR_USE_AFTER_CLOSE' || err.message?.includes('Protocol error')) {
    console.warn('⚠️  Browser protocol error (non-fatal):', err.message);
    return;
  }
  console.error('💥 Uncaught Exception:', err.message);
  // Don't call process.exit — let the server keep running
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve screenshots locally
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth.routes'));
app.use('/chat', require('./routes/chat.routes'));
app.use('/heatmap', require('./routes/heatmap.routes'));
app.use('/recommendations', require('./routes/recommendation.routes'));
app.use('/onboarding', require('./routes/onboarding.routes'));

// Root route
app.get('/', (_req, res) => {
  res.json({
    name: 'Aura Design AI Backend',
    status: '🟢 running',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: 'POST /auth/register | POST /auth/login',
      chat: 'POST /chat/session | POST /chat/message | GET /chat/history/:sessionId',
      heatmap: 'POST /heatmap/survey | POST /heatmap/predict | GET /heatmap/:pageKey',
      recommendations: 'POST /recommendations/track | GET /recommendations/pages | GET /recommendations/profile',
    }
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Boot ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;

async function start(port = PORT) {
  try {
    // Boot DB first
    require('./db/pool');

    // Pre-warm LangGraph (builds checkpointer + compiles graph)
    const { getGraph } = require('./graph/auraGraph');
    await getGraph();

    const server = app.listen(port, () => {
      console.log(`\n✅ Aura Backend running → http://localhost:${port}`);
      console.log(`   Environment: ${process.env.NODE_ENV}`);
      console.log(`   CORS origin: ${process.env.FRONTEND_URL ?? 'http://localhost:5173'}\n`);
    });

    // If port is busy, auto-retry on next port
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Port ${port} in use — retrying on ${port + 1}…`);
        server.close();
        start(port + 1);
      } else {
        console.error('Server error:', err.message);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();

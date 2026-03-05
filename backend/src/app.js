// src/app.js
// Express entry point — boots DB, LangGraph, and starts the server

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5173',
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

async function start() {
  try {
    // Boot DB first
    require('./db/pool');

    // Pre-warm LangGraph (builds checkpointer + compiles graph)
    const { getGraph } = require('./graph/auraGraph');
    await getGraph();

    app.listen(PORT, () => {
      console.log(`\n✅ Aura Backend running → http://localhost:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV}`);
      console.log(`   CORS origin: ${process.env.FRONTEND_URL ?? 'http://localhost:5173'}\n`);
    });
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();

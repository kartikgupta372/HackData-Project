const fs           = require('fs');
const path         = require('path');
const { config, validate } = require('./config/env');

const { errors, warnings } = validate();
warnings.forEach(w => console.warn(`⚠️  ${w}`));
if (errors.length) {
  errors.forEach(e => console.error(`❌ ${e}`));
  console.error('Fix the variables above in backend/.env (or your host\'s environment settings) and restart.');
  process.exit(1);
}

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const pool         = require('./db/pool');
const storage      = require('./services/storage');

process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection:', reason?.stack ?? reason);
});
process.on('uncaughtException', (err) => {
  if (err?.code === 'ERR_USE_AFTER_CLOSE' || err?.message?.includes('Protocol error')) {
    console.warn('⚠️  Browser protocol error (non-fatal):', err.message);
    return;
  }
  console.error('💀 Uncaught exception — shutting down:', err?.stack ?? err);
  process.exit(1);
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// CORS is only needed when the frontend is hosted on a different origin
// (e.g. Vercel + Railway). Requests from this server's own origin are always
// allowed — browsers send an Origin header even for same-origin module scripts.
app.use(cors((req, cb) => {
  const origin = (req.get('origin') || '').replace(/\/+$/, '');
  const self = `${req.protocol}://${req.get('host')}`;
  if (!origin || origin === self || config.frontendUrls.includes(origin)) {
    return cb(null, { origin: true, credentials: true });
  }
  const err = new Error(`Origin ${origin} is not allowed`);
  err.status = 403;
  cb(err);
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

storage.ensureLocalDir();
app.use('/uploads', express.static(storage.UPLOADS_DIR, {
  index: false,
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"),
}));

// ── Health checks ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() }));
app.get('/health/ready', async (_req, res) => {
  try {
    const db = await pool.healthCheck();
    res.json({ status: 'ready', db, storage: storage.driver });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: config.isProd ? 'database unreachable' : err.message });
  }
});

// ── API ──────────────────────────────────────────────────────────────────────
const API_PREFIXES = ['/auth', '/chat', '/heatmap', '/recommendations', '/onboarding', '/insights'];
app.use('/auth',            require('./routes/auth.routes'));
app.use('/chat',            require('./routes/chat.routes'));
app.use('/heatmap',         require('./routes/heatmap.routes'));
app.use('/recommendations', require('./routes/recommendation.routes'));
app.use('/onboarding',      require('./routes/onboarding.routes'));
app.use('/insights',        require('./routes/insights.routes'));

// Unknown API route → JSON 404 (never the SPA's index.html)
app.use([...API_PREFIXES, '/uploads'], (_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ── Frontend (single-service deploy) ─────────────────────────────────────────
const indexHtml = path.join(config.frontendDist, 'index.html');
const serveFrontend = fs.existsSync(indexHtml);
if (serveFrontend) {
  app.use(express.static(config.frontendDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  // SPA fallback: client-side routes like /login, /app, /survey/:token
  app.get('*', (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
} else {
  app.get('/', (_req, res) => res.json({ name: 'Aura Design AI Backend', status: 'running' }));
}

app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`Unhandled error on ${req.method} ${req.path}:`, err.stack || err.message);
  if (res.headersSent) return res.end();
  const message = status === 400 && err.type === 'entity.parse.failed' ? 'Invalid JSON body'
    : status === 413 ? 'Request body is too large'
    : status < 500 ? err.message
    : 'Internal server error';
  res.status(status).json({ success: false, error: message });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
async function start(port, attemptsLeft = config.isProd ? 0 : 5) {
  pool.init().catch(err => console.error('❌ Database init failed:', err.message));

  const server = app.listen(port, () => {
    console.log(`\n✅ Aura backend → http://localhost:${port}  (${config.nodeEnv})`);
    console.log(`   Frontend:   ${serveFrontend ? `served from ${config.frontendDist}` : 'not bundled (run the Vite dev server or deploy it separately)'}`);
    if (config.frontendUrls.length) console.log(`   CORS:       ${config.frontendUrls.join(', ')}`);
    console.log(`   Storage:    ${storage.driver}\n`);
  });
  // Keep idle connections open longer than typical load-balancer timeouts.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`⚠️  Port ${port} in use — trying ${port + 1}`);
      start(port + 1, attemptsLeft - 1);
      return;
    }
    console.error('Server error:', err.message);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) start(config.port);

module.exports = { app, start };

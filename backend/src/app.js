require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled Rejection (non-fatal):', reason?.message ?? reason);
});
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_USE_AFTER_CLOSE' || err.message?.includes('Protocol error')) {
    console.warn('⚠️  Browser protocol error (non-fatal):', err.message);
    return;
  }
  console.error('💀 Uncaught Exception — shutting down:', err.message);
  process.exit(1);
});

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');

const app = express();

app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL ?? 'http://localhost:5174')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { index: false }));

app.use('/auth',            require('./routes/auth.routes'));
app.use('/chat',            require('./routes/chat.routes'));
app.use('/heatmap',         require('./routes/heatmap.routes'));
app.use('/recommendations', require('./routes/recommendation.routes'));
app.use('/onboarding',      require('./routes/onboarding.routes'));
app.use('/insights',        require('./routes/insights.routes'));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/', (_req, res) => res.json({ name: 'Aura Design AI Backend', status: 'running', version: '1.0.0' }));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const BASE_PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start(port) {
  port = parseInt(port, 10);
  if (isNaN(port) || port >= 65536) {
    console.error('❌ No valid port available'); process.exit(1);
  }
  try {
    require('./db/pool');
    const server = app.listen(port, () => {
      console.log(`\n✅ Aura Backend running → http://localhost:${port}`);
      console.log(`   Environment: ${process.env.NODE_ENV}`);
      console.log(`   CORS origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const next = parseInt(port, 10) + 1;
        console.warn(`⚠️  Port ${port} in use — retrying on ${next}…`);
        server.close(() => start(next));
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

start(BASE_PORT);

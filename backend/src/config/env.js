// Central environment loading + validation.
// Every other module should read configuration from here instead of calling
// dotenv itself, so the app fails fast with one clear message when something
// required is missing.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

function list(value, fallback) {
  return (value ?? fallback ?? '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: parseInt(process.env.PORT || '3002', 10),

  // Comma-separated list of browser origins allowed to call the API.
  // Not needed when the backend also serves the frontend (same origin).
  frontendUrls: list(process.env.FRONTEND_URL, isProd ? '' : 'http://localhost:5174,http://localhost:5173'),

  // Public base URL of this backend (used to build absolute links).
  // Leave empty to return relative URLs (recommended for single-service deploys).
  backendUrl: (process.env.BACKEND_URL || '').trim().replace(/\/+$/, ''),

  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  databaseUrl: process.env.DATABASE_URL || '',
  // 'auto' (default): use DATABASE_URL when it connects, otherwise the Supabase
  // HTTPS bridge. 'pg' forces DATABASE_URL, 'rest' forces the HTTPS bridge.
  dbDriver: (process.env.DB_DRIVER || 'auto').toLowerCase(),

  jwtSecret: process.env.JWT_SECRET,
  // 'lax' when frontend and backend share a site (single service, or Vercel
  // rewrites); 'none' when they live on different domains.
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : isProd,

  groqApiKey: process.env.GROQ_API_KEY || '',
  models: {
    chat: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
    json: process.env.GROQ_JSON_MODEL || process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
    vision: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
    // Used automatically if the primary model is retired/unavailable.
    fallbacks: list(process.env.GROQ_FALLBACK_MODELS, 'openai/gpt-oss-120b,openai/gpt-oss-20b'),
  },

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  pineconeApiKey: process.env.PINECONE_API_KEY || '',
  pineconeIndex: process.env.PINECONE_INDEX_BENCHMARKS || 'aura-benchmarks',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // Where screenshots / uploaded documents are stored.
  // 'supabase' keeps them in Supabase Storage (survives redeploys — use in production),
  // 'local' writes to ./uploads (lost when a container restarts).
  storageDriver: (process.env.STORAGE_DRIVER || (isProd ? 'supabase' : 'local')).toLowerCase(),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'aura-uploads',

  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  maxConcurrentScrapes: Math.max(1, parseInt(process.env.MAX_CONCURRENT_SCRAPES || '2', 10)),

  // Folder with the built frontend (frontend/dist). When present the backend
  // serves it, so the whole app runs as one service on one URL.
  frontendDist: process.env.FRONTEND_DIST || path.join(__dirname, '..', '..', '..', 'frontend', 'dist'),
};

function validate() {
  const errors = [];
  const warnings = [];

  if (!config.supabaseUrl) errors.push('SUPABASE_URL is not set');
  if (!config.supabaseServiceKey) errors.push('SUPABASE_SERVICE_KEY is not set');
  if (!config.jwtSecret) errors.push('JWT_SECRET is not set');
  else if (isProd && config.jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters in production');

  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
    errors.push('COOKIE_SAMESITE must be lax, strict or none');
  }
  if (config.cookieSameSite === 'none' && !config.cookieSecure) {
    errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true (HTTPS)');
  }
  if (!config.groqApiKey) warnings.push('GROQ_API_KEY is not set — AI chat, insights and recommendations will fail');
  if (isProd && config.storageDriver === 'local') {
    warnings.push('STORAGE_DRIVER=local in production — screenshots and uploads disappear when the container restarts');
  }

  return { errors, warnings };
}

module.exports = { config, validate };

// File storage for screenshots and uploaded documents.
//
// STORAGE_DRIVER=supabase → Supabase Storage public bucket (persists across
//                           deploys; the right choice in production).
// STORAGE_DRIVER=local    → ./uploads served at /uploads (dev only — files are
//                           lost whenever a container is replaced).
//
// save() returns a URL the browser can load: an absolute https URL for
// Supabase, or a relative "/uploads/…" path for local files.

const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');

// Serverless platforms (Vercel) only allow writing to /tmp.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  || (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads'));
let driver = config.storageDriver === 'supabase' ? 'supabase' : 'local';
let bucketReady = null;

function ensureLocalDir(sub = '') {
  const dir = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function ensureBucket(supabase) {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const { data, error } = await supabase.storage.getBucket(config.storageBucket);
    if (data && !error) return true;
    const { error: createErr } = await supabase.storage.createBucket(config.storageBucket, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
    });
    if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
    return true;
  })().catch((err) => {
    console.warn(`⚠️  Supabase Storage bucket "${config.storageBucket}" unavailable (${err.message}) — falling back to local files`);
    driver = 'local';
    return false;
  });
  return bucketReady;
}

/**
 * @param {Buffer} buffer
 * @param {string} key  e.g. "screenshots/<uuid>.png"
 * @param {string} contentType
 */
async function save(buffer, key, contentType) {
  key = key.replace(/^\/+/, '').replace(/\.\.+/g, '.');
  if (driver === 'supabase') {
    const { supabase } = require('../db/pool');
    await ensureBucket(supabase);
    if (driver === 'supabase') {
      const { error } = await supabase.storage.from(config.storageBucket)
        .upload(key, buffer, { contentType, upsert: true, cacheControl: '31536000' });
      if (!error) {
        return supabase.storage.from(config.storageBucket).getPublicUrl(key).data.publicUrl;
      }
      console.warn(`⚠️  Upload to Supabase Storage failed (${error.message}) — saving locally`);
    }
  }
  const full = path.join(UPLOADS_DIR, key);
  ensureLocalDir(path.dirname(key));
  await fs.promises.writeFile(full, buffer);
  return `/uploads/${key}`;
}

// Only files we created: /uploads/<name>.png or /uploads/screenshots/<name>.png
const LOCAL_URL_RE = /^\/uploads\/(?:screenshots\/)?[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/;

/**
 * Read an image we stored earlier and return it as a data: URL (for vision
 * models). Returns null for anything that isn't one of our own files.
 */
async function readAsDataUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    let buf;
    if (LOCAL_URL_RE.test(url)) {
      const full = path.join(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));
      if (!full.startsWith(UPLOADS_DIR) || !fs.existsSync(full)) return null;
      buf = await fs.promises.readFile(full);
    } else if (config.supabaseUrl && url.startsWith(`${config.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${config.storageBucket}/`)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    // Keep vision payloads reasonable (Groq limits base64 images to ~4MB).
    if (buf.length > 3.5 * 1024 * 1024) return null;
    const ext = url.split('.').pop().toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Turn a stored path into an absolute URL when BACKEND_URL is configured.
 * Relative paths are fine when the frontend is served by the backend or proxies /uploads.
 */
function publicUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return config.backendUrl ? `${config.backendUrl}${url}` : url;
}

module.exports = { save, readAsDataUrl, publicUrl, UPLOADS_DIR, ensureLocalDir, get driver() { return driver; } };

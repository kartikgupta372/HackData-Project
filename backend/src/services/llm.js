// One place for every LLM call.
//
// Models come from env (GROQ_CHAT_MODEL / GROQ_JSON_MODEL / GROQ_VISION_MODEL),
// and if Groq reports a model as retired or unknown we automatically retry with
// GROQ_FALLBACK_MODELS. This matters: Groq shut down llama-3.3-70b-versatile,
// llama-4-scout and llama-3.2-90b-vision during 2025-26, which silently broke
// every AI feature in the app.

const { config } = require('../config/env');

let client = null;
function getClient() {
  if (!config.groqApiKey) {
    const err = new Error('GROQ_API_KEY is not set on the server');
    err.status = 503;
    throw err;
  }
  if (!client) {
    const Groq = require('groq-sdk');
    client = new Groq({ apiKey: config.groqApiKey, timeout: 90_000, maxRetries: 2 });
  }
  return client;
}

function isModelUnavailable(err) {
  const code = err?.error?.error?.code || err?.error?.code || err?.code || '';
  const msg = String(err?.message || '').toLowerCase();
  return code === 'model_decommissioned' || code === 'model_not_found'
    || msg.includes('decommissioned') || msg.includes('model_not_found')
    || (msg.includes('model') && (msg.includes('does not exist') || msg.includes('not supported')));
}

// Request options that differ per model family.
function modelOptions(model, { reasoning = 'low' } = {}) {
  if (model.startsWith('openai/gpt-oss')) {
    return { reasoning_effort: reasoning, include_reasoning: false };
  }
  if (model.startsWith('qwen/')) {
    // Keep <think> blocks out of the answer.
    return { reasoning_format: 'hidden' };
  }
  return {};
}

// Models Groq has told us are gone — skip them for the rest of this process.
const unavailable = new Set();

function candidates(primary) {
  const all = [primary, ...config.models.fallbacks].filter((m, i, a) => m && a.indexOf(m) === i);
  const live = all.filter(m => !unavailable.has(m));
  return live.length ? live : all;
}

async function withFallback(primary, run) {
  let lastErr;
  for (const model of candidates(primary)) {
    try {
      return await run(model);
    } catch (err) {
      lastErr = err;
      if (!isModelUnavailable(err)) throw err;
      unavailable.add(model);
      console.warn(`⚠️  Groq model "${model}" is unavailable — using a fallback model. Update GROQ_*_MODEL in your environment.`);
    }
  }
  throw lastErr;
}

function stripThinking(text) {
  return String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function normaliseMessages(messages) {
  return messages.map(m => ({
    role: m.role || 'user',
    content: typeof m.content === 'string' || Array.isArray(m.content) ? m.content : String(m.content ?? ''),
  }));
}

/**
 * Plain completion. Returns the assistant text.
 */
async function complete(messages, { model = config.models.json, temperature = 0.3, maxTokens = 4096, reasoning } = {}) {
  return withFallback(model, async (m) => {
    const res = await getClient().chat.completions.create({
      model: m,
      messages: normaliseMessages(messages),
      temperature,
      max_completion_tokens: maxTokens,
      ...modelOptions(m, { reasoning }),
    });
    return stripThinking(res.choices?.[0]?.message?.content ?? '');
  });
}

/**
 * Streaming completion. Calls onToken(text) for each chunk and resolves with
 * the full text.
 */
async function stream(messages, { model = config.models.chat, temperature = 0.4, maxTokens = 4096, onToken, signal } = {}) {
  return withFallback(model, async (m) => {
    const res = await getClient().chat.completions.create({
      model: m,
      messages: normaliseMessages(messages),
      temperature,
      max_completion_tokens: maxTokens,
      stream: true,
      ...modelOptions(m),
    }, { signal });

    let full = '';
    for await (const chunk of res) {
      const token = chunk.choices?.[0]?.delta?.content ?? '';
      if (token) {
        full += token;
        onToken?.(token);
      }
    }
    return stripThinking(full);
  });
}

/**
 * Vision completion. `images` are data: URLs or https URLs.
 * Falls back to text-only (DOM summary) when the vision model is unavailable.
 */
async function vision(prompt, images, { system, temperature = 0, maxTokens = 2000 } = {}) {
  const content = [{ type: 'text', text: prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content },
  ];
  try {
    const res = await getClient().chat.completions.create({
      model: config.models.vision,
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      ...modelOptions(config.models.vision),
    });
    return stripThinking(res.choices?.[0]?.message?.content ?? '');
  } catch (err) {
    if (!isModelUnavailable(err) && err?.status !== 400) throw err;
    console.warn(`⚠️  Vision model "${config.models.vision}" failed (${err.message}) — falling back to text-only analysis`);
    return complete([
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ], { temperature, maxTokens });
  }
}

/**
 * Pull the first JSON object/array out of a model reply.
 */
function parseJSON(text, fallback) {
  if (!text) return fallback;
  let s = stripThinking(text).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  const starts = [firstObj, firstArr].filter(i => i !== -1);
  if (!starts.length) return fallback;
  const start = Math.min(...starts);
  const end = s[start] === '[' ? s.lastIndexOf(']') : s.lastIndexOf('}');
  if (end <= start) return fallback;
  try { return JSON.parse(s.substring(start, end + 1)); } catch { return fallback; }
}

/**
 * Friendly error text for API responses / SSE.
 */
function describeError(err) {
  const status = err?.status ?? err?.response?.status;
  const raw = err?.error?.error?.message || err?.message || 'AI request failed';
  if (status === 401 || status === 403) return { message: 'The AI service rejected the server API key. Check GROQ_API_KEY.', retryable: false };
  if (status === 429 || /rate limit|quota/i.test(raw)) return { message: 'The AI service is busy (rate limit). Please try again in a minute.', retryable: true };
  if (status === 503 && /GROQ_API_KEY/.test(raw)) return { message: raw, retryable: false };
  if (isModelUnavailable(err)) return { message: 'The configured AI model is no longer available. Set GROQ_CHAT_MODEL to a current Groq model.', retryable: false };
  if (status >= 500) return { message: 'The AI service had a temporary problem. Please try again.', retryable: true };
  return { message: config.isProd ? 'The AI request failed. Please try again.' : raw, retryable: true };
}

module.exports = { complete, stream, vision, parseJSON, describeError, stripThinking };

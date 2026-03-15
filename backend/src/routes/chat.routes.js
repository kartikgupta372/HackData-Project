// src/routes/chat.routes.js
// Direct Gemini streaming chat — with Groq fallback when Gemini hits quota
require('dotenv').config();
const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authMiddleware } = require('../middleware/auth.middleware');
const chatMemory = require('../memory/chatMemory');
const pool       = require('../db/pool');
const { supabase } = require('../db/pool');
const { validatePublicUrl } = require('../utils/validateUrl');
const scraper    = require('../tools/scraper.tool');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { success: false, error: 'Rate limit reached. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const activeRequestKeys = new Set();

// ── Gemini client ─────────────────────────────────────────────────────────────
let _genAI = null;
function getGenAI() {
  if (!_genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI;
}

// ── Groq fallback client (OpenAI-compatible, free tier: 14,400 req/day) ──────
let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const Groq = require('groq-sdk');
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return _groq;
  } catch { return null; }
}

// Returns true if the error is a Gemini quota / rate-limit error
function isQuotaError(err) {
  const msg = String(err?.message || err?.status || '').toLowerCase();
  return msg.includes('quota') || msg.includes('429') || msg.includes('resource_exhausted') || err?.status === 429;
}

// ── Groq streaming helper — streams tokens via emit, returns full response ────
async function streamWithGroq(systemPrompt, chatHistory, userMessage, emit) {
  const groq = getGroq();
  if (!groq) throw new Error('GROQ_API_KEY not set — add it to .env as fallback');

  emit('stage', { stage:'generating', message:'Gemini quota hit — using Groq (llama-4-scout) as fallback...', progress:40 });

  // Convert Gemini history format → OpenAI format
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.parts?.[0]?.text ?? '' })),
    { role: 'user', content: userMessage },
  ];

  const stream = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct', // best free Groq model
    messages,
    max_tokens: 4096,
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) { full += token; emit('token', { token }); }
  }
  return full;
}

// ── Data loaders ─────────────────────────────────────────────────────────────
async function loadOnboardingData(userId) {
  try {
    const { data } = await supabase.from('users').select('onboarding_data').eq('id', userId).single();
    return data?.onboarding_data ?? null;
  } catch { return null; }
}

async function loadScrapedPages(sessionId) {
  try {
    const { rows } = await pool.query(
      'SELECT page_key, page_url, page_type, dom_summary, screenshot_url, element_count, has_cta FROM scraped_pages WHERE session_id = $1',
      [sessionId]
    );
    return rows;
  } catch { return []; }
}

// Load heatmap/survey context — read-only bridge from heatmap system into chat
// Priority: bundle (from "Send to Chat") → summaries for the site URL
async function loadHeatmapContext(siteUrl, bundleId) {
  try {
    if (bundleId) {
      const { data: bundle } = await supabase.from('heatmap_bundles')
        .select('bundle_name, site_url, page_keys, bundle_data, ai_summary').eq('id', bundleId).single();
      if (bundle) return { type: 'bundle', bundle };
    }
    if (siteUrl) {
      const { rows } = await pool.query(
        `SELECT page_key, summary_text, above_fold_pct, confidence_level, session_count
           FROM heatmap_summaries WHERE site_url = $1 ORDER BY last_updated DESC LIMIT 10`,
        [siteUrl]
      );
      if (rows.length > 0) return { type: 'summaries', summaries: rows };
    }
    return null;
  } catch { return null; }
}

// ── Sanitize DOM summaries before injecting into prompt ──────────────────────
function sanitizeDomSummary(summary) {
  if (!summary) return '';
  return summary
    .replace(/^Design classes:.*$/m, '')
    .replace(/\/uploads\/[a-f0-9-]+\.\w+/g, '[screenshot]')
    .replace(/<[^>]{60,}>/g, '[complex element]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Clean model output: remove code comments, internal state, garbage text ───
function sanitizeChatResponse(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text.trim();

  // Strip meta-prefixes that leak from model internals
  const metaPrefixes = [
    /^As an (AI|LLM)[^.]*\.\s*/i,
    /^I am an (AI|language model)[^.]*\.\s*/i,
    /^I don't have access to[^.]*\.\s*/i,
    /^I cannot (access|see|retrieve)[^.]*\.\s*/i,
    /^Note:\s*This (response|content)[^.]*\.\s*/i,
    /^Here'?s? (the )?(response|analysis|result) (in )?(JSON|raw format)[^.]*:\s*/i,
  ];
  for (const re of metaPrefixes) out = out.replace(re, '');

  // Strip bare code-comment lines (keep lines inside fenced blocks)
  const lines = out.split('\n');
  const cleaned = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^```(\w*)\s*$/)) { inFence = !inFence; cleaned.push(line); continue; }
    if (inFence) { cleaned.push(line); continue; }
    if (/^\s*\/\/\s*/.test(line)) continue;
    if (/^\s*#\s*(TODO|FIXME|DEBUG|XXX)\s*:/i.test(trimmed)) continue;
    cleaned.push(line);
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim() || text.trim();
}

// ── Label maps ───────────────────────────────────────────────────────────────
const DOMAIN_LABELS = {
  ecommerce:'E-Commerce', saas:'SaaS / App', portfolio:'Portfolio',
  restaurant:'Restaurant / Food', healthcare:'Healthcare', blog:'Blog / Content',
  agency:'Agency / Business', education:'Education', other:'Other',
};
const INTENT_LABELS = {
  increase_conversions:'Increase conversions & sales', improve_ux:'Improve user experience',
  brand_refresh:'Brand / visual refresh', accessibility:'Fix accessibility issues',
  mobile_ux:'Better mobile experience', seo_design:'SEO-friendly structure', full_audit:'Full design audit',
};

// ── Build system prompt — includes onboarding, scraped pages, heatmap, style, docs ──
function buildSystemPrompt(onboarding, scrapedPages, siteUrl, sessionFormData, heatmapContext = null) {
  const rawDomain   = sessionFormData?.domain     || onboarding?.domain     || '';
  const rawIntent   = sessionFormData?.intent     || onboarding?.intent     || '';
  const otherInfo   = sessionFormData?.other_info || onboarding?.other_info || '';
  const style       = sessionFormData?.style_preference || onboarding?.style_preference || '';
  const docs        = onboarding?.document_urls ?? [];

  const site   = siteUrl || onboarding?.url || 'the website';
  const domain = DOMAIN_LABELS[rawDomain] || rawDomain || 'web';
  const intent = INTENT_LABELS[rawIntent] || rawIntent || 'improve design';

  let ctx = `You are Aura AI, a friendly expert UI/UX design consultant.

== SESSION CONTEXT (PERSISTENT) ==
You have full context for this conversation: the user's website (URL, type, goals), any scraped page data, heatmap data, and the full chat history. Use this context to answer questions about their site at any time without asking the user to repeat information.

== OUTPUT FORMAT (STRICT) ==
- Write ONLY what the user should see: natural language and, when they ask for code, fenced code blocks.
- Do NOT output: code comments (// or /* */), variable names, function names, internal state, raw JSON, debug text, TODO/FIXME, or any meta-commentary like "As an AI" or "Note: This response".
- Use markdown for structure: **bold**, lists, headers. Never use CSS selectors or class names in prose.

== WEBSITE CONTEXT ==
Website: ${site}
Type: ${domain}
Goal: ${intent}${style ? `\nDesired visual style: ${style}` : ''}${otherInfo ? `\nSpecific issues: ${otherInfo}` : ''}${docs.length ? `\nUser uploaded ${docs.length} reference file(s) (brand assets/guidelines): ${docs.join(', ')}` : ''}`;

  if (scrapedPages.length > 0) {
    ctx += '\n\n== PAGES ANALYSED ==\n';
    for (const page of scrapedPages) {
      ctx += `\nPage: ${page.page_key} (${page.page_type})\nURL: ${page.page_url}\nElements: ${page.element_count} | Has CTA: ${page.has_cta}\n`;
      if (page.dom_summary) {
        ctx += `Content overview:\n${sanitizeDomSummary(page.dom_summary).substring(0, 600)}\n`;
      }
    }
  } else if (site !== 'the website') {
    ctx += `\n\nNote: I'll analyse ${site} based on my knowledge while the scraping completes in background.`;
  }

  if (heatmapContext) {
    ctx += '\n\n== SURVEY & HEATMAP DATA ==';
    if (heatmapContext.type === 'bundle') {
      const { bundle } = heatmapContext;
      ctx += `\nBundle: "${bundle.bundle_name}" | Pages: ${(bundle.page_keys ?? []).join(', ')}`;
      if (bundle.bundle_data?.pages) {
        for (const p of bundle.bundle_data.pages) {
          ctx += `\n\nPage "${p.page_key}":`;
          if (p.heatmap?.summary_text)       ctx += `\n  Heatmap: ${p.heatmap.summary_text}`;
          if (p.heatmap?.above_fold_pct !== undefined) ctx += `\n  Above-fold attention: ${p.heatmap.above_fold_pct}%`;
          if (p.survey?.response_count)      ctx += `\n  Survey responses: ${p.survey.response_count}`;
        }
      }
      if (bundle.ai_summary) ctx += `\n\nAI insight:\n${bundle.ai_summary}`;
    } else if (heatmapContext.type === 'summaries') {
      for (const s of heatmapContext.summaries) {
        ctx += `\n\nPage "${s.page_key}": ${s.summary_text} (${s.confidence_level} confidence, ${s.session_count} responses, ${s.above_fold_pct}% above-fold)`;
      }
    }
    ctx += `\n\nUse this data to answer heatmap questions directly. Do NOT ask the user to provide this data — you already have it.`;
  }

  ctx += `

== YOUR CAPABILITIES ==
1. Analyse pages against design laws (Fitts's Law, Gestalt, F-Pattern, Visual Hierarchy, Hick's Law)
2. Compare this site against top benchmarks (Stripe, Linear, Vercel, Shopify, etc.)
3. When asked, generate complete enhanced HTML/CSS with specific fixes
4. Suggest prioritised improvements with business impact estimates
5. Answer any design, UX, or frontend question

== WHEN GENERATING CODE ==
- Output complete, copy-paste-ready HTML + CSS
- Keep the site's brand colours and personality
- Wrap all code in proper \`\`\`html or \`\`\`css blocks
- After each code block, explain what changed and which design principle it applies

Be direct, specific, and helpful. Reference actual elements from the page when available.`;

  return ctx;
}

// ── POST /chat/sessions ──────────────────────────────────────────────────────
router.post('/sessions', authMiddleware, async (req, res) => {
  const { siteUrl: rawSiteUrl, domain, intent, other_info } = req.body ?? {};
  const siteUrl = rawSiteUrl ? validatePublicUrl(rawSiteUrl) : null;
  try {
    const ob = await loadOnboardingData(req.user.id);
    let finalUrl = siteUrl || (ob?.url ? validatePublicUrl(ob.url) : null);
    const formData = {
      domain:     domain     || ob?.domain     || null,
      intent:     intent     || ob?.intent     || null,
      other_info: other_info || ob?.other_info || null,
    };
    const session = await chatMemory.createSession(req.user.id, finalUrl ?? null, formData);
    res.status(201).json({ success: true, data: { session } });
    if (finalUrl) {
      setImmediate(async () => {
        try {
          const pages = await scraper.scrapeWebsite(finalUrl, { maxPages: 5, fullPage: true });
          for (const [pageKey, pageData] of Object.entries(pages)) {
            await pool.query(
              `INSERT INTO scraped_pages
                 (session_id,site_url,page_key,page_url,page_type,raw_html,computed_css,dom_summary,screenshot_url,element_count,has_cta)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (session_id,page_key) DO UPDATE
               SET raw_html=$6,dom_summary=$8,screenshot_url=$9`,
              [session.id,finalUrl,pageKey,pageData.page_url,pageData.page_type,
               pageData.html,pageData.css,pageData.dom_summary,
               pageData.screenshot_url,pageData.element_count,pageData.has_cta]
            );
          }
          await supabase.from('chat_sessions').update({ site_url:finalUrl, analysis_stage:'scraped' }).eq('id',session.id);
        } catch (e) { console.warn(`[${session.id}] Scrape failed:`, e.message); }
      });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/sessions', authMiddleware, async (req, res) => {
  try { res.json({ success:true, data:{ sessions: await chatMemory.listSessions(req.user.id) } }); }
  catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

router.get('/sessions/:threadId', authMiddleware, async (req, res) => {
  try {
    const session = await chatMemory.getSession(req.params.threadId, req.user.id);
    if (!session) return res.status(404).json({ success:false, error:'Session not found' });
    res.json({ success:true, data:{ session } });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  try { await chatMemory.deleteSession(req.params.sessionId, req.user.id); res.json({ success:true }); }
  catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

router.get('/sessions/:sessionId/results', authMiddleware, async (req, res) => {
  try {
    const results = await chatMemory.getAnalysisResults(req.params.sessionId, req.user.id);
    if (!results) return res.status(404).json({ success:false, error:'No results found' });
    res.json({ success:true, data:results });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ── POST /chat/message — DIRECT GEMINI STREAMING ────────────────────────────
router.post('/message', authMiddleware, chatLimiter, async (req, res) => {
  const { thread_id, session_id, message } = req.body;
  if (!thread_id || !session_id || !message?.trim()) {
    return res.status(400).json({ success:false, error:'thread_id, session_id, and message are required' });
  }

  const requestKey = `${req.user.id || req.ip}:${thread_id}`;
  if (activeRequestKeys.has(requestKey)) {
    return res.status(429).json({ success:false, error:'Another message is already processing. Please wait.' });
  }
  activeRequestKeys.add(requestKey);

  const session = await chatMemory.getSession(thread_id, req.user.id).catch(() => null);
  if (!session) {
    activeRequestKeys.delete(requestKey);
    return res.status(403).json({ success:false, error:'Session not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(':heartbeat\n\n'); }, 15000);
  req.on('close', () => clearInterval(heartbeat));
  const emit = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  try {
    // 1. Save user message
    await chatMemory.saveMessage(thread_id, session_id, 'user', message);
    emit('user_message', { content: message });

    // 2. Extract form data early so we can resolve siteUrl + heatmap bundle id
    const sessionFormData = typeof session.design_prefs === 'string'
      ? JSON.parse(session.design_prefs || '{}')
      : (session.design_prefs || {});

    // 3. Load all context in parallel
    const [onboarding, scrapedPages, history] = await Promise.all([
      loadOnboardingData(req.user.id),
      loadScrapedPages(session_id),
      pool.query('SELECT role,content FROM chat_messages WHERE thread_id=$1 ORDER BY created_at ASC LIMIT 40', [thread_id])
        .then(r => r.rows).catch(() => []),
    ]);

    // Resolve siteUrl BEFORE heatmap lookup (session.site_url can be null on first msg)
    const siteUrl = session.site_url || onboarding?.url || null;
    const heatmapContext = await loadHeatmapContext(siteUrl, sessionFormData?.heatmap_bundle_id ?? null);

    if (siteUrl && scrapedPages.length === 0) {
      emit('stage', { stage:'scraping', message:`Scraping ${siteUrl} in background — answering based on knowledge for now...`, progress:10 });
    } else if (scrapedPages.length > 0) {
      emit('stage', { stage:'analysing', message:`Analysing ${scrapedPages.length} scraped pages...`, progress:20 });
    }

    // 4. Build system prompt with ALL context (onboarding + scrape + heatmap + style + docs)
    const systemPrompt = buildSystemPrompt(onboarding, scrapedPages, siteUrl, sessionFormData, heatmapContext);
    const model = getGenAI().getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: 4096 },
    });

    // 5. Build Gemini chat history (exclude the current user message — sent via sendMessageStream)
    const historyForContext = history.length > 0 && history[history.length - 1].role === 'user'
      ? history.slice(0, -1) : history;
    const chatHistory = historyForContext.map(msg =>
      msg.role === 'user'
        ? { role:'user',  parts:[{ text:msg.content }] }
        : { role:'model', parts:[{ text:msg.content }] }
    );

    const chat = model.startChat({ history: chatHistory });
    emit('stage', { stage:'generating', message:'Generating response...', progress:40 });

    // 6. Stream — try Gemini first, auto-fallback to Groq on quota error
    let fullResponse = '';
    let usedGroq = false;
    try {
      const streamResult = await chat.sendMessageStream(message);
      for await (const chunk of streamResult.stream) {
        const token = chunk.text();
        if (token) { fullResponse += token; emit('token', { token }); }
      }
    } catch (streamErr) {
      if (isQuotaError(streamErr)) {
        // Gemini quota hit — silently switch to Groq
        console.log('[Chat] Gemini quota hit — falling back to Groq');
        fullResponse = await streamWithGroq(systemPrompt, chatHistory, message, emit);
        usedGroq = true;
      } else {
        throw streamErr;
      }
    }

    // 7. Sanitize (strip code comments, meta-text, garbage) then save
    const cleanResponse = sanitizeChatResponse(fullResponse);
    await chatMemory.saveMessage(thread_id, session_id, 'assistant', cleanResponse);
    await chatMemory.updateSessionStage(session_id, 'idle', siteUrl, onboarding?.domain ?? null);

    emit('assistant_message', { content: cleanResponse });
    emit('done', { thread_id });

  } catch (err) {
    const rawMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Unknown error';
    console.error('Chat error:', rawMsg);
    const lower = String(rawMsg).toLowerCase();
    if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('429')) {
      // Both Gemini and Groq failed — tell user clearly
      emit('error', {
        error: 'Both Gemini and Groq quota limits reached. Wait 1-2 minutes and try again, or add GROQ_API_KEY to your .env for automatic fallback.',
        retryable: true,
      });
    } else if (err?.response?.status === 401 || err?.response?.status === 403) {
      emit('error', { error:'Gemini API key unauthorized. Verify GEMINI_API_KEY.' });
    } else {
      emit('error', { error: rawMsg });
    }
  } finally {
    activeRequestKeys.delete(requestKey);
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;

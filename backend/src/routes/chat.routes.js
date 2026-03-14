// src/routes/chat.routes.js
// REST + SSE streaming endpoints for the chatbot

const express     = require('express');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const { HumanMessage } = require('@langchain/core/messages');
const { streamGraph, getSessionState, resumeGraph } = require('../graph/auraGraph');
const chatMemory  = require('../memory/chatMemory');
const pool        = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');
const scraper     = require('../tools/scraper.tool');
const { validatePublicUrl } = require('../utils/validateUrl');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { success: false, error: 'Too many messages. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders:   false,
});


// â”€â”€ POST /chat/sessions â”€â”€ Create new session (optionally with site URL) â”€â”€â”€â”€â”€â”€
router.post('/sessions', authMiddleware, async (req, res) => {
  const { siteUrl: rawSiteUrl } = req.body ?? {};
  const siteUrl = rawSiteUrl ? validatePublicUrl(rawSiteUrl) : null;
  // Note: invalid URL is silently ignored (session created without URL)
  try {
    const session = await chatMemory.createSession(req.user.id, siteUrl ?? null);
    res.status(201).json({ success: true, data: { session } });

    // If URL provided, scrape all pages immediately in background
    // Screenshots saved to uploads/, scraped_pages saved to DB
    if (siteUrl) {
      setImmediate(async () => {
        try {
          console.log(`[Session ${session.id}] Scraping ${siteUrl}...`);
          const pages = await scraper.scrapeWebsite(siteUrl.trim(), { maxPages: 5, fullPage: true });
          for (const [pageKey, pageData] of Object.entries(pages)) {
            await pool.query(
              `INSERT INTO scraped_pages
                 (session_id, site_url, page_key, page_url, page_type, raw_html, computed_css, dom_summary, screenshot_url, element_count, has_cta)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (session_id, page_key) DO UPDATE
               SET raw_html=$6, dom_summary=$8, screenshot_url=$9`,
              [session.id, siteUrl.trim(), pageKey, pageData.page_url, pageData.page_type,
               pageData.html, pageData.css, pageData.dom_summary,
               pageData.screenshot_url, pageData.element_count, pageData.has_cta]
            );
          }
          // Mark session as scraped
          const { supabase } = pool;
          await supabase.from('chat_sessions').update({
            site_url:  siteUrl.trim(),
            analysis_stage: 'scraped',
          }).eq('id', session.id);
          console.log(`[Session ${session.id}] Scraped ${Object.keys(pages).length} pages, screenshots saved`);
        } catch (e) {
          console.warn(`[Session ${session.id}] Background scrape failed:`, e.message);
        }
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ GET /chat/sessions â”€â”€ List user's sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await chatMemory.listSessions(req.user.id);
    res.json({ success: true, data: { sessions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ GET /chat/sessions/:threadId â”€â”€ Get session + messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sessions/:threadId', authMiddleware, async (req, res) => {
  try {
    const session = await chatMemory.getSession(req.params.threadId, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: { session } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ DELETE /chat/sessions/:sessionId â”€â”€ Delete a session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    await chatMemory.deleteSession(req.params.sessionId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ GET /chat/sessions/:sessionId/results â”€â”€ Download analysis results â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sessions/:sessionId/results', authMiddleware, async (req, res) => {
  try {
    const results = await chatMemory.getAnalysisResults(req.params.sessionId, req.user.id);
    if (!results) return res.status(404).json({ success: false, error: 'No results found' });
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ GET /chat/sessions/:threadId/state â”€â”€ Current graph state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sessions/:threadId/state', authMiddleware, async (req, res) => {
  try {
    const session = await chatMemory.getSession(req.params.threadId, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const graphState = await getSessionState(req.params.threadId);
    res.json({
      success: true,
      data: {
        analysis_stage:    session.analysis_stage,
        current_stage:     graphState?.values?.current_stage,
        site_url:          graphState?.values?.site_url,
        pages_scraped:     Object.keys(graphState?.values?.scraped_pages ?? {}).length,
        pages_analyzed:    Object.keys(graphState?.values?.page_analyses ?? {}).length,
        design_prefs_done: graphState?.values?.design_prefs_collected,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// â”€â”€ POST /chat/message â”€â”€ Main SSE streaming endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Body: { thread_id, session_id, message, is_resume? }
 *
 * SSE events emitted:
 *   stage            â€” { stage, message, progress, current_page }
 *   node_update      â€” { node, stage, progress }
 *   token            â€” { token }              (streamed text chunks)
 *   assistant_message â€” { content, node }     (complete agent messages)
 *   user_message     â€” { content }            (echo)
 *   done             â€” { thread_id }
 *   error            â€” { error }
 */
router.post('/message', authMiddleware, chatLimiter, async (req, res) => {
  const { thread_id, session_id, message, is_resume = false } = req.body;

  if (!thread_id || !session_id || !message?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'thread_id, session_id, and message are required',
    });
  }

  // Verify ownership
  const session = await chatMemory.getSession(thread_id, req.user.id);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Session not found or access denied' });
  }

  // â”€â”€ Set up SSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',      'no-cache');
  res.setHeader('Connection',         'keep-alive');
  res.setHeader('X-Accel-Buffering',  'no');   // disable Nginx buffering
  res.flushHeaders();

  // Keepalive heartbeat every 20s
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(':heartbeat\n\n');
  }, 20000);

  req.on('close', () => clearInterval(heartbeat));

  // Load any existing scraped pages from DB into graph state
  // This happens when session was created with a URL and background scraping already ran
  async function loadScrapedPagesIntoState(sessionId, siteUrl) {
    if (!sessionId || !siteUrl) return {};
    try {
      const { rows } = await pool.query(
        'SELECT * FROM scraped_pages WHERE session_id = $1',
        [sessionId]
      );
      if (!rows.length) return {};
      const pages = {};
      for (const row of rows) {
        pages[row.page_key] = {
          page_url:       row.page_url,
          page_key:       row.page_key,
          page_type:      row.page_type,
          html:           row.raw_html ?? '',
          css:            row.computed_css ?? '',
          dom_summary:    row.dom_summary ?? '',
          screenshot_url: row.screenshot_url ?? '',
          element_count:  row.element_count ?? 0,
          has_cta:        row.has_cta ?? false,
        };
      }
      return pages;
    } catch { return {}; }
  }

  try {
    // Save user message
    await chatMemory.saveMessage(thread_id, session_id, 'user', message);
    res.write(`event: user_message\ndata: ${JSON.stringify({ content: message })}\n\n`);

    let inputState = {
      messages:   [new HumanMessage(message)],
      session_id,
      thread_id,
      user_id:    req.user.id,
    };

    // Inject pre-scraped pages + site info into state for new messages
    if (session.site_url && !is_resume) {
      const existingPages = await loadScrapedPagesIntoState(session_id, session.site_url);
      if (Object.keys(existingPages).length > 0) {
        inputState.scraped_pages = existingPages;
        inputState.site_url = session.site_url;
        inputState.pages_to_analyze = Object.keys(existingPages);
      }
    }

    if (is_resume) {
      await resumeGraph(thread_id, message, res);
    } else {
      await streamGraph(thread_id, inputState, res);
    }

    // Persist the final AI message after stream completes
    const finalState = await getSessionState(thread_id);
    if (finalState?.values?.messages?.length > 0) {
      const msgs = finalState.values.messages;
      const lastAI = [...msgs].reverse().find(m => m._getType?.() === 'ai' || m.role === 'assistant');
      if (lastAI) {
        const content = typeof lastAI.content === 'string'
          ? lastAI.content
          : JSON.stringify(lastAI.content);
        await chatMemory.saveMessage(thread_id, session_id, 'assistant', content, {
          content_type: finalState.values.current_stage === 'done' ? 'analysis_result' : 'text',
        });
        await chatMemory.updateSessionStage(
          session_id,
          finalState.values.current_stage,
          finalState.values.site_url,
          finalState.values.site_type,
        );
      }
    }

  } catch (err) {
    console.error('Chat message error:', err);
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

module.exports = router;



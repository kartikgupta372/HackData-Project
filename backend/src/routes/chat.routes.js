// src/routes/chat.routes.js
// REST + SSE streaming endpoints for the chatbot

const express     = require('express');
const rateLimit   = require('express-rate-limit');
const { HumanMessage } = require('@langchain/core/messages');
const { streamGraph, getSessionState, resumeGraph } = require('../graph/auraGraph');
const chatMemory  = require('../memory/chatMemory');
const { authMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { success: false, error: 'Too many messages. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── POST /chat/sessions ── Create new session ──────────────────────────────────
router.post('/sessions', authMiddleware, async (req, res) => {
  try {
    const session = await chatMemory.createSession(req.user.id);
    res.status(201).json({ success: true, data: { session } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/sessions ── List user's sessions ─────────────────────────────────
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await chatMemory.listSessions(req.user.id);
    res.json({ success: true, data: { sessions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/sessions/:threadId ── Get session + messages ─────────────────────
router.get('/sessions/:threadId', authMiddleware, async (req, res) => {
  try {
    const session = await chatMemory.getSession(req.params.threadId, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: { session } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /chat/sessions/:sessionId ── Delete a session ──────────────────────
router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    await chatMemory.deleteSession(req.params.sessionId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/sessions/:sessionId/results ── Download analysis results ─────────
router.get('/sessions/:sessionId/results', authMiddleware, async (req, res) => {
  try {
    const results = await chatMemory.getAnalysisResults(req.params.sessionId, req.user.id);
    if (!results) return res.status(404).json({ success: false, error: 'No results found' });
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/sessions/:threadId/state ── Current graph state ─────────────────
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

// ── POST /chat/message ── Main SSE streaming endpoint ─────────────────────────
/**
 * Body: { thread_id, session_id, message, is_resume? }
 *
 * SSE events emitted:
 *   stage            — { stage, message, progress, current_page }
 *   node_update      — { node, stage, progress }
 *   token            — { token }              (streamed text chunks)
 *   assistant_message — { content, node }     (complete agent messages)
 *   user_message     — { content }            (echo)
 *   done             — { thread_id }
 *   error            — { error }
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

  // ── Set up SSE ─────────────────────────────────────────────────────────────
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

  try {
    // Save user message
    await chatMemory.saveMessage(thread_id, session_id, 'user', message);
    res.write(`event: user_message\ndata: ${JSON.stringify({ content: message })}\n\n`);

    if (is_resume) {
      await resumeGraph(thread_id, message, res);
    } else {
      const inputState = {
        messages:   [new HumanMessage(message)],
        session_id,
        thread_id,
        user_id:    req.user.id,
      };
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

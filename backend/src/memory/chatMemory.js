// src/memory/chatMemory.js — Fixed: safe URL parsing, no crash on malformed URLs
const pool    = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return url.substring(0, 40); }
}

async function createSession(userId, siteUrl = null) {
  const threadId = `aura_${uuidv4()}`;
  const title    = siteUrl ? `Analysis: ${safeHostname(siteUrl)}` : 'New Analysis';
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (user_id, thread_id, title, status, site_url)
     VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
    [userId, threadId, title, siteUrl ?? null]
  );
  return rows[0];
}

async function getSession(threadId, userId) {
  const { rows: sessionRows } = await pool.query(
    'SELECT * FROM chat_sessions WHERE thread_id=$1 AND user_id=$2',
    [threadId, userId]
  );
  if (!sessionRows[0]) return null;
  const { rows: msgRows } = await pool.query(
    'SELECT * FROM chat_messages WHERE thread_id=$1 ORDER BY created_at ASC',
    [threadId]
  );
  return { ...sessionRows[0], messages: msgRows };
}

async function listSessions(userId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT cs.*,
       (SELECT content  FROM chat_messages WHERE thread_id=cs.thread_id ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*) FROM chat_messages WHERE thread_id=cs.thread_id)::int AS message_count
     FROM chat_sessions cs
     WHERE cs.user_id=$1 ORDER BY cs.last_active_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function saveMessage(threadId, sessionId, role, content, metadata = {}) {
  await pool.query(
    `INSERT INTO chat_messages (session_id, thread_id, role, content, content_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [sessionId, threadId, role, content, metadata.content_type ?? 'text', JSON.stringify(metadata)]
  );
  await pool.query('UPDATE chat_sessions SET last_active_at=NOW() WHERE id=$1', [sessionId]);
  if (role === 'user') {
    const { rows } = await pool.query('SELECT title FROM chat_sessions WHERE id=$1', [sessionId]);
    if (rows[0]?.title === 'New Analysis') {
      const title = content.substring(0, 60) + (content.length > 60 ? '…' : '');
      await pool.query('UPDATE chat_sessions SET title=$1 WHERE id=$2', [title, sessionId]);
    }
  }
}

async function updateSessionStage(sessionId, stage, siteUrl = null, siteType = null) {
  await pool.query(
    `UPDATE chat_sessions SET analysis_stage=$1, site_url=COALESCE($2,site_url), site_type=COALESCE($3,site_type), last_active_at=NOW() WHERE id=$4`,
    [stage, siteUrl, siteType, sessionId]
  );
}

async function getAnalysisResults(sessionId, userId) {
  const { rows: sessions } = await pool.query('SELECT * FROM chat_sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
  if (!sessions[0]) return null;
  const { rows: analyses } = await pool.query('SELECT * FROM design_analyses WHERE session_id=$1 ORDER BY created_at ASC', [sessionId]);
  const { rows: pages }    = await pool.query('SELECT * FROM scraped_pages WHERE session_id=$1', [sessionId]);
  return { session: sessions[0], analyses, pages };
}

async function deleteSession(sessionId, userId) {
  await pool.query('DELETE FROM chat_sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
}

module.exports = { createSession, getSession, listSessions, saveMessage, updateSessionStage, getAnalysisResults, deleteSession };

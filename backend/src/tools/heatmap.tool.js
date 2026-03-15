// src/tools/heatmap.tool.js
require('dotenv').config();

const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const fs = require('fs');
const path = require('path');

const GRID_COLS = 20;
const GRID_ROWS = 20;
const GAUSSIAN_RADIUS = 1.5;
const TIME_WEIGHTS = [
  { maxMs: 3000,    weight: 4.0 },
  { maxMs: 8000,    weight: 2.0 },
  { maxMs: Infinity, weight: 1.0 },
];

let _llm = null;
function getLLM() {
  if (!_llm) _llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.0-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0, maxOutputTokens: 2000 });
  return _llm;
}

function getTimeWeight(ms) {
  for (const b of TIME_WEIGHTS) if (ms <= b.maxMs) return b.weight;
  return 1.0;
}
function emptyGrid() { return Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0)); }
function applyGaussian(grid, cx, cy, w) {
  const s2 = GAUSSIAN_RADIUS * GAUSSIAN_RADIUS;
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      grid[r][c] += w * Math.exp(-((c-cx)**2 + (r-cy)**2) / (2*s2));
}
function normalizeGrid(grid) {
  let max = 0;
  grid.forEach(row => row.forEach(v => { if (v > max) max = v; }));
  if (max === 0) return grid;
  return grid.map(row => row.map(v => Math.round((v/max)*100)));
}
function extractHotZones(grid, topN = 5) {
  const cells = [];
  for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) cells.push({ r, c, score: grid[r][c] });
  cells.sort((a,b) => b.score - a.score);
  const zones = [], taken = new Set();
  for (const { r, c, score } of cells) {
    if (zones.length >= topN) break;
    if (taken.has(r+','+c) || score < 20) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) taken.add((r+dr)+','+(c+dc));
    zones.push({ x: parseFloat((c/GRID_COLS).toFixed(3)), y: parseFloat((r/GRID_ROWS).toFixed(3)), w: parseFloat((1/GRID_COLS).toFixed(3)), h: parseFloat((1/GRID_ROWS).toFixed(3)), score, label: r < 7 ? 'above-fold' : r < 14 ? 'mid-fold' : 'below-fold' });
  }
  return zones;
}
function aboveFoldPct(grid) {
  const fold = Math.floor(GRID_ROWS * 0.55);
  let above = 0, total = 0;
  for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) { total += grid[r][c]; if (r < fold) above += grid[r][c]; }
  return total > 0 ? parseFloat(((above/total)*100).toFixed(1)) : 0;
}

async function aggregateHeatmap(siteUrl, pageKey) {
  const { rows: events } = await pool.query(
    'SELECT ge.x_pct,ge.y_pct,ge.timestamp_ms,ge.confidence FROM gaze_events ge JOIN gaze_sessions gs ON ge.session_id=gs.id WHERE gs.site_url=$1 AND gs.page_key=$2 AND gs.completed=true',
    [siteUrl, pageKey]
  );
  const { rows: sc } = await pool.query('SELECT COUNT(*) AS count FROM gaze_sessions WHERE site_url=$1 AND page_key=$2 AND completed=true', [siteUrl, pageKey]);
  const sessionCount = parseInt(sc[0]?.count ?? 0);
  if (events.length < 10) return { hasData: false, sessionCount };
  const grid = emptyGrid();
  const attentionPath = [];
  for (const e of events) {
    const cx = Math.min(GRID_COLS-1, Math.floor(e.x_pct * GRID_COLS));
    const cy = Math.min(GRID_ROWS-1, Math.floor(e.y_pct * GRID_ROWS));
    applyGaussian(grid, cx, cy, getTimeWeight(e.timestamp_ms) * (e.confidence ?? 1.0));
    if (e.timestamp_ms <= 3000) attentionPath.push({ x: +e.x_pct.toFixed(3), y: +e.y_pct.toFixed(3), t: e.timestamp_ms });
  }
  const normalized = normalizeGrid(grid);
  const hotZones = extractHotZones(normalized);
  const afPct = aboveFoldPct(normalized);
  const desc = hotZones.slice(0,3).map(z => z.label+'@('+Math.round(z.x*100)+'%,'+Math.round(z.y*100)+'%) score:'+z.score).join('; ');
  const summaryText = sessionCount+' real sessions. '+afPct+'% above-fold. Hot zones: '+desc+'.';
  await pool.query(
    'INSERT INTO heatmap_summaries (site_url,page_key,grid_data,hot_zones,attention_path,above_fold_pct,summary_text,confidence_level,session_count,predicted,last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,NOW()) ON CONFLICT ON CONSTRAINT heatmap_summaries_site_url_page_key_key DO UPDATE SET grid_data=$3,hot_zones=$4,attention_path=$5,above_fold_pct=$6,summary_text=$7,confidence_level=$8,session_count=$9,predicted=false,last_updated=NOW()',
    [siteUrl, pageKey, JSON.stringify(normalized), JSON.stringify(hotZones), JSON.stringify(attentionPath.slice(0,50)), afPct, summaryText, sessionCount>=20?'high':sessionCount>=5?'medium':'low', sessionCount]
  );
  return { hasData: true, sessionCount, grid: normalized, hotZones, aboveFold: afPct, summaryText };
}

async function predictHeatmap(siteUrl, pageKey, screenshotPath, domSummary) {
  let imageContent = null;
  if (screenshotPath) {
    const imgPath = screenshotPath.startsWith('/uploads/') ? path.join(process.cwd(), screenshotPath) : screenshotPath;
    if (fs.existsSync(imgPath)) {
      const b64 = fs.readFileSync(imgPath).toString('base64');
      imageContent = { type: 'image_url', image_url: { url: 'data:image/png;base64,'+b64 } };
    }
  }
  const prompt = 'Analyse this webpage. Predict where users look in FIRST 3s vs 3-8s.\nDOM: '+(domSummary??'N/A')+'\nReturn ONLY JSON:\n{"hot_zones":[{"x":0.0,"y":0.0,"w":0.1,"h":0.1,"score":0,"label":"above-fold","reason":""}],"above_fold_pct":0,"primary_attention":"","secondary_attention":"","design_laws_observed":[],"summary_text":""}';
  const msgs = [
    new SystemMessage('You are an expert UI/UX eye-tracking prediction system.'),
    imageContent ? new HumanMessage({ content: [{ type: 'text', text: prompt }, imageContent] }) : new HumanMessage(prompt),
  ];
  const result = await getLLM().invoke(msgs);
  let parsed;
  try { parsed = JSON.parse(result.content.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()); } catch { return null; }
  if (!parsed) return null;
  const summaryText = parsed.summary_text ?? 'AI-predicted: '+(parsed.primary_attention??'');
  await pool.query(
    'INSERT INTO heatmap_summaries (site_url,page_key,hot_zones,above_fold_pct,summary_text,confidence_level,session_count,predicted,last_updated) VALUES ($1,$2,$3,$4,$5,\'none\',0,true,NOW()) ON CONFLICT ON CONSTRAINT heatmap_summaries_site_url_page_key_key DO UPDATE SET hot_zones=$3,above_fold_pct=$4,summary_text=$5,predicted=true,last_updated=NOW() WHERE heatmap_summaries.predicted=true OR heatmap_summaries.session_count=0',
    [siteUrl, pageKey, JSON.stringify(parsed.hot_zones), parsed.above_fold_pct, summaryText]
  );
  return { ...parsed, summaryText, predicted: true };
}

async function getHeatmap(siteUrl, pageKey) {
  const { rows } = await pool.query('SELECT * FROM heatmap_summaries WHERE site_url=$1 AND page_key=$2', [siteUrl, pageKey]);
  return rows[0] ?? null;
}

async function saveGazeSession(sessionData) {
  const { siteUrl, pageKey, pageUrl, participantId, userId, deviceWidth, deviceHeight, webcamUsed, events } = sessionData;
  const duration = events?.length > 0 ? (events[events.length-1].t ?? events[events.length-1].timestamp_ms ?? 0) : 0;
  const { rows } = await pool.query(
    'INSERT INTO gaze_sessions (site_url,page_key,page_url,user_id,participant_id,device_width,device_height,webcam_used,completed,session_duration_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING id',
    [siteUrl, pageKey, pageUrl??siteUrl, userId??null, participantId??uuidv4(), deviceWidth??1280, deviceHeight??800, webcamUsed??false, duration]
  );
  const gazeSessionId = rows[0].id;
  if (events?.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < events.length; i += CHUNK) {
      const chunk = events.slice(i, i+CHUNK);
      const placeholders = chunk.map((e, j) => { const b = j*4; return '($'+(b+1)+',$'+(b+2)+',$'+(b+3)+',$'+(b+4)+')'; }).join(',');
      const params = chunk.flatMap(e => [gazeSessionId, e.x_pct??e.x, e.y_pct??e.y, e.timestamp_ms??e.t??0]);
      await pool.query('INSERT INTO gaze_events (session_id,x_pct,y_pct,timestamp_ms) VALUES '+placeholders, params);
    }
  }
  const { rows: cnt } = await pool.query('SELECT COUNT(*) AS n FROM gaze_sessions WHERE site_url=$1 AND page_key=$2 AND completed=true', [siteUrl, pageKey]);
  const totalSessions = parseInt(cnt[0]?.n ?? 0);
  if (totalSessions % 5 === 0 && totalSessions > 0)
    aggregateHeatmap(siteUrl, pageKey).catch(e => console.warn('Auto-aggregate:', e.message));
  return { gazeSessionId, totalSessions };
}

module.exports = { aggregateHeatmap, predictHeatmap, getHeatmap, saveGazeSession };




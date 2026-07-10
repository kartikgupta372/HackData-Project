require('dotenv').config();
const pool = require('../db/pool');

const WEIGHTS = {
  design:     0.40,
  heatmap:    0.25,
  engagement: 0.20,
  improvement:0.15,
};

async function trackInteraction(userId, sessionId, data) {
  const { siteUrl, pageKey, actionType, actionData } = data;

  await pool.query(
    `INSERT INTO user_interactions (user_id, session_id, site_url, page_key, action_type, action_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, sessionId ?? null, siteUrl ?? null, pageKey ?? null, actionType, JSON.stringify(actionData ?? {})]
  );

  updatePreferenceProfile(userId).catch(err => console.warn('Profile update error:', err.message));
}

async function updatePreferenceProfile(userId) {
  const { rows } = await pool.query(
    `SELECT action_type, action_data FROM user_interactions WHERE user_id = $1`,
    [userId]
  );

  const styles = {};
  const laws = {};
  const siteTypes = {};
  let applied = 0, dismissed = 0;

  for (const row of rows) {
    const d = row.action_data ?? {};
    if (row.action_type === 'applied_fix') {
      applied++;
      if (d.law) laws[d.law] = (laws[d.law] ?? 0) + 2;
      if (d.style) styles[d.style] = (styles[d.style] ?? 0) + 2;
    } else if (row.action_type === 'dismissed_fix') {
      dismissed++;
      if (d.law) laws[d.law] = (laws[d.law] ?? 0) - 1;
    } else if (row.action_type === 'requested_style') {
      if (d.style) styles[d.style] = (styles[d.style] ?? 0) + 3;
    } else if (row.action_type === 'liked_benchmark') {
      if (d.style) styles[d.style] = (styles[d.style] ?? 0) + 1;
    }
    if (d.siteType) siteTypes[d.siteType] = (siteTypes[d.siteType] ?? 0) + 1;
  }

  const preferredStyles = Object.entries(styles)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const preferredLaws = Object.entries(laws)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  await pool.query(
    `INSERT INTO user_preference_profiles
       (user_id, preferred_styles, preferred_laws, site_type_history,
        applied_fixes_count, dismissed_fixes_count, last_updated)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       preferred_styles=$2, preferred_laws=$3, site_type_history=$4,
       applied_fixes_count=$5, dismissed_fixes_count=$6, last_updated=NOW()`,
    [userId, preferredStyles, preferredLaws, JSON.stringify(siteTypes), applied, dismissed]
  );

  return { preferredStyles, preferredLaws, applied, dismissed };
}

async function updatePageRanking(siteUrl, pageKey, siteType, analysisScores, heatmapData) {
  const overall = analysisScores?.overall ?? 0;

  const heatmapScore = heatmapData
    ? heatmapData.session_count >= 20 ? 100
    : heatmapData.session_count >= 5  ? 60
    : heatmapData.session_count >= 1  ? 30
    : heatmapData.predicted           ? 15
    : 0
    : 0;

  const { rows: existing } = await pool.query(
    'SELECT engagement_score, design_score, analysis_count, improvement_delta FROM page_rankings WHERE site_url=$1 AND page_key=$2',
    [siteUrl, pageKey]
  );
  const prev = existing[0] ?? {};
  const engagementScore = prev.engagement_score ?? 0;
  const improvementDelta = prev.improvement_delta ?? 0;

  const composite = (
    overall        * WEIGHTS.design +
    heatmapScore   * WEIGHTS.heatmap +
    engagementScore * WEIGHTS.engagement +
    Math.min(100, improvementDelta * 2) * WEIGHTS.improvement
  );

  await pool.query(
    `INSERT INTO page_rankings (site_url, page_key, site_type, design_score, heatmap_score,
       engagement_score, composite_score, analysis_count, improvement_delta, last_analysed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,NOW())
     ON CONFLICT (site_url, page_key) DO UPDATE SET
       site_type=$3, design_score=$4, heatmap_score=$5,
       composite_score=$7, analysis_count=page_rankings.analysis_count+1, last_analysed=NOW()`,
    [siteUrl, pageKey, siteType, overall, heatmapScore, engagementScore, composite, improvementDelta]
  );
}

async function incrementEngagement(siteUrl, pageKey, points = 10) {
  await pool.query(
    `UPDATE page_rankings
     SET engagement_score = LEAST(100, engagement_score + $3),
         composite_score = (
           design_score * ${WEIGHTS.design} +
           heatmap_score * ${WEIGHTS.heatmap} +
           LEAST(100, engagement_score + $3) * ${WEIGHTS.engagement} +
           LEAST(100, improvement_delta * 2) * ${WEIGHTS.improvement}
         )
     WHERE site_url=$1 AND page_key=$2`,
    [siteUrl, pageKey, points]
  );
}

async function recordImprovement(siteUrl, pageKey, beforeScore, afterScore) {
  const delta = Math.max(0, afterScore - beforeScore);
  await pool.query(
    `UPDATE page_rankings
     SET improvement_delta = $3,
         composite_score = (
           design_score * ${WEIGHTS.design} +
           heatmap_score * ${WEIGHTS.heatmap} +
           engagement_score * ${WEIGHTS.engagement} +
           LEAST(100, $3 * 2) * ${WEIGHTS.improvement}
         )
     WHERE site_url=$1 AND page_key=$2`,
    [siteUrl, pageKey, delta]
  );
}

async function getRankedPages(userId, siteType = null, limit = 10) {
  const { rows: profRows } = await pool.query(
    'SELECT preferred_styles, preferred_laws, site_type_history FROM user_preference_profiles WHERE user_id=$1',
    [userId]
  );
  const profile = profRows[0];

  const { rows: pages } = await pool.query(
    `SELECT pr.*, da.critique_text, da.recommendations
     FROM page_rankings pr
     LEFT JOIN design_analyses da ON da.page_key = pr.page_key
     WHERE ($1::text IS NULL OR pr.site_type = $1)
     ORDER BY pr.composite_score DESC
     LIMIT $2`,
    [siteType, limit]
  );

  if (profile?.site_type_history) {
    const siteTypeHistory = profile.site_type_history;
    return pages.map(page => {
      const typeBoost = siteTypeHistory[page.site_type] ? 5 : 0;
      return { ...page, personalized_score: page.composite_score + typeBoost };
    }).sort((a, b) => b.personalized_score - a.personalized_score);
  }

  return pages;
}

async function getUserProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_preference_profiles WHERE user_id=$1',
    [userId]
  );
  return rows[0] ?? null;
}

async function rankBenchmarksForUser(userId, benchmarks) {
  const profile = await getUserProfile(userId);
  if (!profile || !benchmarks?.length) return benchmarks;

  const preferred = new Set(profile.preferred_styles ?? []);

  return benchmarks
    .map(b => {
      let boost = 0;
      if (b.style && preferred.has(b.style)) boost += 15;
      if (b.tags?.some(t => preferred.has(t))) boost += 10;
      return { ...b, relevance_boost: boost, adjusted_score: (b.score ?? 0) + boost };
    })
    .sort((a, b) => b.adjusted_score - a.adjusted_score);
}

module.exports = {
  trackInteraction,
  updatePreferenceProfile,
  updatePageRanking,
  incrementEngagement,
  recordImprovement,
  getRankedPages,
  getUserProfile,
  rankBenchmarksForUser,
};

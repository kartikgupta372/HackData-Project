// src/tools/vectorSearch.tool.js
// Pinecone RAG — retrieves benchmark sites by category similarity
// Falls back to Supabase DB query if Pinecone is unavailable

const { Pinecone } = require('@pinecone-database/pinecone');
const pool = require('../db/pool');
require('dotenv').config();

let client = null;
let index  = null;

async function init() {
  if (client) return;
  if (!process.env.PINECONE_API_KEY) {
    console.warn('⚠️  PINECONE_API_KEY not set — using DB fallback for benchmarks');
    return;
  }
  client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  index  = client.index(process.env.PINECONE_INDEX_BENCHMARKS ?? 'aura-benchmarks');
}

/**
 * Search for top benchmark sites matching siteType + designStyle.
 * Returns array of benchmark objects.
 */
async function searchBenchmarks({ siteType, designStyle, topK = 5 }) {
  await init();

  // Pinecone vector search (if available + index is seeded)
  if (index) {
    try {
      // Placeholder embedding — swap for a real embedding model later
      // e.g. text-embedding-004 via Gemini, or OpenAI text-embedding-3-small
      const dummyVector = new Array(1536).fill(0).map(() => Math.random() * 0.001);

      const results = await index.query({
        vector: dummyVector,
        topK,
        filter: { site_type: { $eq: siteType } },
        includeMetadata: true,
      });

      if (results.matches?.length > 0) {
        return results.matches.map(m => ({
          name:         m.metadata.name,
          url:          m.metadata.url,
          site_type:    m.metadata.site_type,
          description:  m.metadata.description,
          design_notes: m.metadata.design_notes,
          tags:         m.metadata.tags ?? [],
          score:        m.score,
        }));
      }
    } catch (err) {
      console.warn('Pinecone query failed, using DB fallback:', err.message);
    }
  }

  // ── DB fallback ────────────────────────────────────────────────
  const { rows } = await pool.query(
    `SELECT * FROM benchmark_sites
     WHERE site_type = $1
     ORDER BY awwwards_score DESC NULLS LAST
     LIMIT $2`,
    [siteType, topK]
  );

  return rows.map(r => ({
    name:         r.name,
    url:          r.url,
    site_type:    r.site_type,
    description:  r.description,
    design_notes: r.design_notes,
    tags:         r.tags ?? [],
    score:        1.0,
  }));
}

module.exports = { searchBenchmarks };

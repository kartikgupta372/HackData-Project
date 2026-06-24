const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const pool = require('../db/pool');
require('dotenv').config();

let pineconeClient = null;
let pineconeIndex   = null;
let embedder        = null;

async function init() {
  if (pineconeClient) return;

  if (!process.env.PINECONE_API_KEY) {
    console.warn('⚠️  PINECONE_API_KEY not set — using DB fallback for benchmarks');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not set — using DB fallback for benchmarks');
    return;
  }

  pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  pineconeIndex  = pineconeClient.index(
    process.env.PINECONE_INDEX_BENCHMARKS ?? 'aura-benchmarks'
  );

  embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-001',
  });
}

function buildQueryText(siteType, designStyle) {
  const parts = [`Site type: ${siteType ?? 'general'}`];
  if (designStyle) parts.push(`Design style: ${designStyle}`);
  parts.push(`Best practices for ${siteType ?? 'web'} design`);
  parts.push(`UI/UX design patterns conversion optimization`);
  return parts.join('. ');
}

async function searchBenchmarks({ siteType, designStyle, topK = 5 }) {
  await init();

  if (pineconeIndex && embedder) {
    try {
      const queryText = buildQueryText(siteType, designStyle);
      const queryVector = await embedder.embedQuery(queryText);

      const results = await pineconeIndex.query({
        vector: queryVector,
        topK,
        filter: siteType ? { site_type: { $eq: siteType } } : undefined,
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

      if (siteType) {
        const fallbackResults = await pineconeIndex.query({
          vector: queryVector,
          topK,
          includeMetadata: true,
        });
        if (fallbackResults.matches?.length > 0) {
          return fallbackResults.matches.map(m => ({
            name:         m.metadata.name,
            url:          m.metadata.url,
            site_type:    m.metadata.site_type,
            description:  m.metadata.description,
            design_notes: m.metadata.design_notes,
            tags:         m.metadata.tags ?? [],
            score:        m.score,
          }));
        }
      }
    } catch (err) {
      console.warn('⚠️  Pinecone query failed, using DB fallback:', err.message);
    }
  }

  const { rows } = await pool.query(
    `SELECT * FROM benchmark_sites
     WHERE ($1::text IS NULL OR site_type = $1)
     ORDER BY awwwards_score DESC NULLS LAST
     LIMIT $2`,
    [siteType ?? null, topK]
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

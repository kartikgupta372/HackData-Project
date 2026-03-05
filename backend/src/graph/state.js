// src/graph/state.js
// LangGraph State — every field that flows between agents

const { Annotation, messagesStateReducer } = require('@langchain/langgraph');

const AuraGraphState = Annotation.Root({

  // ── Chat messages (append-only) ──────────────────────────────
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // ── Session identifiers ───────────────────────────────────────
  session_id: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  thread_id:  Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  user_id:    Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // ── Routing ───────────────────────────────────────────────────
  next_node: Annotation({ reducer: (x, y) => y ?? x, default: () => 'orchestrator' }),
  intent:    Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
    // 'analyze_website' | 'general_chat' | 'enhance_code' | 'heatmap_query'
  }),

  // ── Website context ───────────────────────────────────────────
  site_url:  Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  site_type: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // ── Scraped pages: { [page_key]: pageData } ───────────────────
  scraped_pages: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  current_page_key: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  pages_to_analyze: Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),

  // ── Design preferences ────────────────────────────────────────
  design_preferences: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  design_prefs_collected: Annotation({ reducer: (x, y) => y ?? x, default: () => false }),

  // ── RAG benchmark context ─────────────────────────────────────
  benchmark_sites:   Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),
  benchmark_context: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // ── Heatmap context ───────────────────────────────────────────
  heatmap_data:    Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
  heatmap_context: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // ── Analysis results: { [page_key]: analysisData } ───────────
  page_analyses:            Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
  cross_page_discrepancies: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // ── Enhanced code: { [page_key]: { html, css, diff } } ────────
  enhanced_pages: Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),

  // ── UI / streaming stage ──────────────────────────────────────
  current_stage:  Annotation({ reducer: (x, y) => y ?? x, default: () => 'idle' }),
  stage_progress: Annotation({ reducer: (x, y) => y ?? x, default: () => 0 }),
  error:          Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

});

module.exports = { AuraGraphState };

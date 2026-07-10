const { Annotation, messagesStateReducer } = require('@langchain/langgraph');

const AuraGraphState = Annotation.Root({

  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  session_id: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  thread_id:  Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  user_id:    Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  user_profile: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  next_node: Annotation({ reducer: (x, y) => y ?? x, default: () => 'orchestrator' }),
  intent:    Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  site_url:  Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  site_type: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  scraped_pages: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  current_page_key: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  pages_to_analyze: Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),

  design_preferences: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  design_prefs_collected: Annotation({ reducer: (x, y) => y ?? x, default: () => false }),

  benchmark_sites:   Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),
  benchmark_context: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  heatmap_data:    Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
  heatmap_context: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  page_analyses:            Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),
  cross_page_discrepancies: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  enhanced_pages: Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),

  current_stage:  Annotation({ reducer: (x, y) => y ?? x, default: () => 'idle' }),
  stage_progress: Annotation({ reducer: (x, y) => y ?? x, default: () => 0 }),
  error:          Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

});

module.exports = { AuraGraphState };

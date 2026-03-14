// src/graph/auraGraph.js
require('dotenv').config();

const { StateGraph, END, START, MemorySaver } = require('@langchain/langgraph');
const { AuraGraphState } = require('./state');
const sse = require('../utils/sseRegistry');
const {
  orchestratorNode,
  domIntakeNode,
  designPreferenceNode,
  benchmarkRagNode,
  heatmapAnalyzerNode,
  pageAnalyzerNode,
  codeEnhancerNode,
  generalChatNode,
} = require('../agents/nodes');

// ── Routing functions ─────────────────────────────────────────────────────────

function routeFromOrchestrator(state) {
  const valid = ['dom_intake', 'code_enhancer', 'heatmap_analyzer', 'page_analyzer', 'general_chat', 'design_preference'];
  const route = state.next_node ?? 'general_chat';
  return valid.includes(route) ? route : 'general_chat';
}

function routeFromDesignPrefs(state) {
  return state.design_prefs_collected ? 'benchmark_rag' : END;
}

function routeFromHeatmapAnalyzer(state) {
  const hasPages = Object.keys(state.scraped_pages ?? {}).length > 0;
  return hasPages ? 'page_analyzer' : 'general_chat';
}

function routeFromPageAnalyzer(state) {
  return state.next_node === 'code_enhancer' ? 'code_enhancer' : END;
}

// ── Build & compile ───────────────────────────────────────────────────────────

async function buildAuraGraph() {
  // MemorySaver: in-process checkpointing — no direct pg connection needed.
  // Conversations persist within the server session.
  // Swap for PostgresSaver when a direct pg connection is available in prod.
  const checkpointer = new MemorySaver();
  console.log('✅ LangGraph checkpointer ready (MemorySaver)');

  const workflow = new StateGraph(AuraGraphState)
    .addNode('orchestrator', orchestratorNode)
    .addNode('dom_intake', domIntakeNode)
    .addNode('design_preference', designPreferenceNode)
    .addNode('benchmark_rag', benchmarkRagNode)
    .addNode('heatmap_analyzer', heatmapAnalyzerNode)
    .addNode('page_analyzer', pageAnalyzerNode)
    .addNode('code_enhancer', codeEnhancerNode)
    .addNode('general_chat', generalChatNode)

    .addEdge(START, 'orchestrator')

    .addConditionalEdges('orchestrator', routeFromOrchestrator, {
      dom_intake: 'dom_intake',
      code_enhancer: 'code_enhancer',
      heatmap_analyzer: 'heatmap_analyzer',
      page_analyzer: 'page_analyzer',
      general_chat: 'general_chat',
      design_preference: 'design_preference',
    })

    .addEdge('dom_intake', 'design_preference')

    .addConditionalEdges('design_preference', routeFromDesignPrefs, {
      benchmark_rag: 'benchmark_rag',
      [END]: END,
    })

    .addEdge('benchmark_rag', 'heatmap_analyzer')

    .addConditionalEdges('heatmap_analyzer', routeFromHeatmapAnalyzer, {
      page_analyzer: 'page_analyzer',
      general_chat: 'general_chat',
    })

    .addConditionalEdges('page_analyzer', routeFromPageAnalyzer, {
      code_enhancer: 'code_enhancer',
      [END]: END,
    })

    .addEdge('code_enhancer', END)
    .addEdge('general_chat', END);

  const compiled = workflow.compile({ checkpointer });
  console.log('✅ LangGraph compiled');
  return compiled;
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _graph = null;
async function getGraph() {
  if (!_graph) _graph = await buildAuraGraph();
  return _graph;
}

// ── Stream execution ──────────────────────────────────────────────────────────

async function streamGraph(threadId, inputState, resWriter) {
  sse.setWriter(threadId, resWriter);
  const graph = await getGraph();
  const config = { configurable: { thread_id: threadId }, recursion_limit: 25 };

  try {
    const stream = await graph.stream(inputState, { ...config, streamMode: 'updates' });
    for await (const chunk of stream) {
      const [nodeName, stateUpdate] = Object.entries(chunk)[0] ?? [];
      if (!nodeName || !stateUpdate) continue;
      if (!resWriter.writableEnded) {
        resWriter.write(`event: node_update\ndata: ${JSON.stringify({
          node: nodeName, stage: stateUpdate.current_stage, progress: stateUpdate.stage_progress,
        })}\n\n`);
        for (const msg of stateUpdate.messages ?? []) {
          const isAI = msg._getType?.() === 'ai' || msg.role === 'assistant';
          if (isAI) {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            resWriter.write(`event: assistant_message\ndata: ${JSON.stringify({ content, node: nodeName })}\n\n`);
          }
        }
      }
    }
    if (!resWriter.writableEnded)
      resWriter.write(`event: done\ndata: ${JSON.stringify({ thread_id: threadId })}\n\n`);
  } finally {
    sse.removeWriter(threadId);
  }
}

async function getSessionState(threadId) {
  const graph = await getGraph();
  const config = { configurable: { thread_id: threadId } };
  return graph.getState(config);
}

async function resumeGraph(threadId, userMessage, resWriter) {
  sse.setWriter(threadId, resWriter);
  const graph = await getGraph();
  const config = { configurable: { thread_id: threadId }, recursion_limit: 25 };
  const { HumanMessage } = require('@langchain/core/messages');

  await graph.updateState(config, { messages: [new HumanMessage(userMessage)] });

  try {
    const stream = await graph.stream(null, { ...config, streamMode: 'updates' });
    for await (const chunk of stream) {
      const [nodeName, stateUpdate] = Object.entries(chunk)[0] ?? [];
      if (!nodeName || !stateUpdate) continue;
      if (!resWriter.writableEnded) {
        resWriter.write(`event: node_update\ndata: ${JSON.stringify({
          node: nodeName, stage: stateUpdate.current_stage,
        })}\n\n`);
        for (const msg of stateUpdate.messages ?? []) {
          const isAI = msg._getType?.() === 'ai' || msg.role === 'assistant';
          if (isAI) {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            resWriter.write(`event: assistant_message\ndata: ${JSON.stringify({ content, node: nodeName })}\n\n`);
          }
        }
      }
    }
    if (!resWriter.writableEnded)
      resWriter.write(`event: done\ndata: ${JSON.stringify({ thread_id: threadId })}\n\n`);
  } finally {
    sse.removeWriter(threadId);
  }
}

module.exports = { getGraph, streamGraph, getSessionState, resumeGraph };

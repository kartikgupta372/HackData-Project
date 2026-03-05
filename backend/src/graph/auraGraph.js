// src/graph/auraGraph.js
// LangGraph StateGraph — wires all 8 agents with conditional routing + PostgreSQL persistence

const { StateGraph, END, START } = require('@langchain/langgraph');
const { PostgresSaver }           = require('@langchain/langgraph-checkpoint-postgres');
const { AuraGraphState }          = require('./state');
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
require('dotenv').config();

// ── Routing functions ──────────────────────────────────────────────────────────

function routeFromOrchestrator(state) {
  const valid = ['dom_intake', 'code_enhancer', 'heatmap_analyzer', 'page_analyzer', 'general_chat'];
  const route = state.next_node ?? 'general_chat';
  return valid.includes(route) ? route : 'general_chat';
}

function routeFromDesignPrefs(state) {
  // If prefs collected → proceed; otherwise → END (graph pauses, waits for next user message)
  return state.design_prefs_collected ? 'benchmark_rag' : END;
}

function routeFromPageAnalyzer(state) {
  return state.next_node === 'code_enhancer' ? 'code_enhancer' : END;
}

// ── Build & compile the graph ──────────────────────────────────────────────────

async function buildAuraGraph() {
  // PostgreSQL checkpointer — enables full persistence + resume
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
  await checkpointer.setup(); // creates checkpoint tables (idempotent)
  console.log('✅ LangGraph checkpointer ready');

  const workflow = new StateGraph(AuraGraphState)
    // Register nodes
    .addNode('orchestrator',       orchestratorNode)
    .addNode('dom_intake',         domIntakeNode)
    .addNode('design_preference',  designPreferenceNode)
    .addNode('benchmark_rag',      benchmarkRagNode)
    .addNode('heatmap_analyzer',   heatmapAnalyzerNode)
    .addNode('page_analyzer',      pageAnalyzerNode)
    .addNode('code_enhancer',      codeEnhancerNode)
    .addNode('general_chat',       generalChatNode)

    // Entry → orchestrator
    .addEdge(START, 'orchestrator')

    // orchestrator → intent-based routing
    .addConditionalEdges('orchestrator', routeFromOrchestrator, {
      dom_intake:      'dom_intake',
      code_enhancer:   'code_enhancer',
      heatmap_analyzer:'heatmap_analyzer',
      page_analyzer:   'page_analyzer',
      general_chat:    'general_chat',
    })

    // dom_intake always → design_preference
    .addEdge('dom_intake', 'design_preference')

    // design_preference → benchmark_rag (if prefs done) or END (wait for user)
    .addConditionalEdges('design_preference', routeFromDesignPrefs, {
      benchmark_rag: 'benchmark_rag',
      [END]:         END,
    })

    // benchmark_rag → heatmap_analyzer (always)
    .addEdge('benchmark_rag', 'heatmap_analyzer')

    // heatmap_analyzer → page_analyzer (always)
    .addEdge('heatmap_analyzer', 'page_analyzer')

    // page_analyzer → code_enhancer or END
    .addConditionalEdges('page_analyzer', routeFromPageAnalyzer, {
      code_enhancer: 'code_enhancer',
      [END]:         END,
    })

    // Terminals
    .addEdge('code_enhancer', END)
    .addEdge('general_chat',  END);

  const compiled = workflow.compile({ checkpointer });
  console.log('✅ LangGraph compiled');
  return compiled;
}

// ── Singleton ──────────────────────────────────────────────────────────────────
let _graph = null;

async function getGraph() {
  if (!_graph) _graph = await buildAuraGraph();
  return _graph;
}

// ── Stream execution ───────────────────────────────────────────────────────────
/**
 * Run the graph and stream updates via SSE.
 *
 * @param {string} threadId   - LangGraph thread ID (= session.thread_id)
 * @param {object} inputState - New state to inject (messages + session ids)
 * @param {object} sseWriter  - Express res object (already has SSE headers set)
 */
async function streamGraph(threadId, inputState, sseWriter) {
  const graph  = await getGraph();
  const config = { configurable: { thread_id: threadId }, recursion_limit: 25 };

  // Inject SSE writer into state so agents can emit events
  const stateWithWriter = { ...inputState, _sseWriter: sseWriter };

  const stream = await graph.stream(stateWithWriter, { ...config, streamMode: 'updates' });

  for await (const chunk of stream) {
    const [nodeName, stateUpdate] = Object.entries(chunk)[0] ?? [];
    if (!nodeName || !stateUpdate) continue;

    // Emit node transition
    if (sseWriter && !sseWriter.writableEnded) {
      sseWriter.write(`event: node_update\ndata: ${JSON.stringify({
        node:     nodeName,
        stage:    stateUpdate.current_stage,
        progress: stateUpdate.stage_progress,
      })}\n\n`);

      // Emit any new AI messages from this node
      for (const msg of stateUpdate.messages ?? []) {
        const isAI = msg._getType?.() === 'ai' || msg.role === 'assistant';
        if (isAI) {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          sseWriter.write(`event: assistant_message\ndata: ${JSON.stringify({ content, node: nodeName })}\n\n`);
        }
      }
    }
  }

  if (sseWriter && !sseWriter.writableEnded) {
    sseWriter.write(`event: done\ndata: ${JSON.stringify({ thread_id: threadId })}\n\n`);
  }
}

/**
 * Get the latest persisted graph state for a thread (for resume / history).
 */
async function getSessionState(threadId) {
  const graph  = await getGraph();
  const config = { configurable: { thread_id: threadId } };
  return graph.getState(config);
}

/**
 * Resume a paused graph (after human-in-the-loop interrupt).
 * Call this when the user replies to a mid-graph question.
 */
async function resumeGraph(threadId, userMessage, sseWriter) {
  const graph  = await getGraph();
  const config = { configurable: { thread_id: threadId }, recursion_limit: 25 };

  const { HumanMessage } = require('@langchain/core/messages');
  await graph.updateState(config, {
    messages:    [new HumanMessage(userMessage)],
    _sseWriter:  sseWriter,
  });

  // Re-stream from the resume point
  const stream = await graph.stream({ _sseWriter: sseWriter }, { ...config, streamMode: 'updates' });

  for await (const chunk of stream) {
    const [nodeName, stateUpdate] = Object.entries(chunk)[0] ?? [];
    if (!nodeName || !stateUpdate) continue;

    if (sseWriter && !sseWriter.writableEnded) {
      sseWriter.write(`event: node_update\ndata: ${JSON.stringify({
        node: nodeName, stage: stateUpdate.current_stage,
      })}\n\n`);

      for (const msg of stateUpdate.messages ?? []) {
        const isAI = msg._getType?.() === 'ai' || msg.role === 'assistant';
        if (isAI) {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          sseWriter.write(`event: assistant_message\ndata: ${JSON.stringify({ content, node: nodeName })}\n\n`);
        }
      }
    }
  }

  if (sseWriter && !sseWriter.writableEnded) {
    sseWriter.write(`event: done\ndata: ${JSON.stringify({ thread_id: threadId })}\n\n`);
  }
}

module.exports = { getGraph, streamGraph, getSessionState, resumeGraph };

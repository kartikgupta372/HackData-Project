import { create } from 'zustand'

export const useChatStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,     // session.id from DB
  activeThreadId: null,      // session.thread_id for chat
  messages: [],              // { id, role, content, type, timestamp }
  isStreaming: false,
  streamingContent: '',      // accumulates token chunks
  currentStage: null,        // { stage, message, progress, current_page }
  analysisResults: null,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (session) => set({
    activeSessionId: session?.id ?? null,
    activeThreadId: session?.thread_id ?? null,
    messages: [],
    streamingContent: '',
    currentStage: null,
    analysisResults: null,
  }),

  addMessage: (msg) => set(s => ({ messages: [...s.messages, { id: Date.now() + Math.random(), ...msg }] })),

  setMessages: (messages) => set({ messages }),

  startStreaming: () => set({ isStreaming: true, streamingContent: '' }),

  appendToken: (token) => set(s => ({ streamingContent: s.streamingContent + token })),

  // optionalFinalContent: when provided (e.g. from server's sanitized assistant_message), use it instead of accumulated streamingContent
  finishStreaming: (optionalFinalContent) => {
    const { streamingContent, messages } = get()
    const content = (optionalFinalContent != null && String(optionalFinalContent).trim())
      ? String(optionalFinalContent).trim()
      : streamingContent.trim()
    if (content) {
      set(s => ({
        messages: [...s.messages, {
          id: Date.now() + Math.random(),
          role: 'assistant',
          content,
          type: 'text',
          timestamp: new Date().toISOString(),
        }],
        streamingContent: '',
        isStreaming: false,
      }))
    } else {
      set({ streamingContent: '', isStreaming: false })
    }
  },

  setStage: (stage) => set({ currentStage: stage }),
  setAnalysisResults: (results) => set({ analysisResults: results }),

  clearSession: () => set({
    activeSessionId: null,
    activeThreadId: null,
    messages: [],
    streamingContent: '',
    currentStage: null,
    analysisResults: null,
    isStreaming: false,
  }),
}))

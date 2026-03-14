import api from './axios'

// In dev (Vite proxy): '' (relative) — requests go through Vite to backend
// In prod: VITE_API_URL
const BASE = import.meta.env.VITE_API_URL || ''

export const chatApi = {
  createSession:  ()          => api.post('/chat/sessions'),
  listSessions:   ()          => api.get('/chat/sessions'),
  getSession:     (threadId)  => api.get(`/chat/sessions/${threadId}`),
  deleteSession:  (sessionId) => api.delete(`/chat/sessions/${sessionId}`),
  getResults:     (sessionId) => api.get(`/chat/sessions/${sessionId}/results`),
  getState:       (threadId)  => api.get(`/chat/sessions/${threadId}/state`),

  // SSE uses native fetch because axios doesn't support streaming
  // Must match the Vite proxy routes
  streamMessage: async (payload, handlers) => {
    const { onStage, onToken, onMessage, onDone, onError, onUserMessage } = handlers

    let res
    try {
      res = await fetch(`${BASE}/chat/message`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
      })
    } catch (err) {
      onError?.('Network error — is the backend running?')
      return
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }))
      onError?.(body.error || `Server error ${res.status}`)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()   // keep incomplete last line

      let eventType = null
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6))
            switch (eventType) {
              case 'user_message':      onUserMessage?.(data);        break
              case 'stage':             onStage?.(data);              break
              case 'node_update':       onStage?.(data);              break
              case 'token':             onToken?.(data.token);        break
              case 'assistant_message': onMessage?.(data);            break
              case 'done':              onDone?.(data);               break
              case 'error':             onError?.(data.error);        break
              // ignore :heartbeat comments
            }
          } catch { /* malformed JSON — skip */ }
          eventType = null
        }
      }
    }
  },
}

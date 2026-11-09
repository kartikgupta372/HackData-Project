import api, { API_BASE as BASE } from './axios'

export const chatApi = {
  createSession:  (siteUrl, domain, intent) => api.post('/chat/sessions', {
    ...(siteUrl ? { siteUrl } : {}),
    ...(domain  ? { domain }  : {}),
    ...(intent  ? { intent }  : {}),
  }),
  listSessions:   ()          => api.get('/chat/sessions'),
  getSession:     (threadId)  => api.get(`/chat/sessions/${threadId}`),
  deleteSession:  (sessionId) => api.delete(`/chat/sessions/${sessionId}`),
  getResults:     (sessionId) => api.get(`/chat/sessions/${sessionId}/results`),

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
      onError?.('Cannot reach the server. Check your connection and try again.', { retryable: true })
      return
    }

    if (!res.ok) {
      if (res.status === 401) { window.location.assign('/login'); return }
      const body = await res.json().catch(() => ({ error: 'Request failed' }))
      onError?.(body.error || `Server error ${res.status}`, { retryable: res.status >= 500 || res.status === 429 })
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''
    let eventType = null
    let finished  = false

    while (true) {
      let chunk
      try {
        chunk = await reader.read()
      } catch {
        onError?.('Connection lost while generating. Please try again.', { retryable: true })
        return
      }
      const { done, value } = chunk
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop()

      for (const line of lines) {
        if (line === '') { eventType = null; continue }
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
              case 'done':              finished = true; onDone?.(data); break
              case 'error':             finished = true; onError?.(data.error, { retryable: data.retryable ?? false }); break
            }
          } catch { /* ignore malformed event */ }
        }
      }
    }
    if (!finished) onError?.('The response ended unexpectedly. Please try again.', { retryable: true })
  },
}

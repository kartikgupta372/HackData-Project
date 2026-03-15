import api from './axios'

export const insightsApi = {
  generate:   (data)            => api.post('/insights/generate', data),
  getAll:     (params)          => api.get('/insights', { params }),
  setStatus:  (id, status)      => api.patch(`/insights/${id}/status`, { status }),
  sendToChat: (id)              => api.post(`/insights/${id}/send-to-chat`),
}

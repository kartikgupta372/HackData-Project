import api from './axios'

export const recommendationsApi = {
  track:         (data)           => api.post('/recommendations/track', data),
  getPages:      (params)         => api.get('/recommendations/pages', { params }),
  getProfile:    ()               => api.get('/recommendations/profile'),
  getTopSites:   (params)         => api.get('/recommendations/top-sites', { params }),
  getCards:      (params)         => api.get('/recommendations/cards', { params }),
  generateCards: (data)           => api.post('/recommendations/generate-cards', data),
  cardAction:    (cardId, action) => api.post(`/recommendations/cards/${cardId}/action`, { action }),
  discuss:       (cardId)         => api.post(`/recommendations/cards/${cardId}/discuss`),
  vibePrompt:    (data)           => api.post('/recommendations/vibe-prompt', data),
}

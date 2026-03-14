import api from './axios'

// Single source of truth for all recommendation API calls
export const recommendationsApi = {
  track:      (data)   => api.post('/recommendations/track', data),
  getPages:   (params) => api.get('/recommendations/pages', { params }),
  getProfile: ()       => api.get('/recommendations/profile'),
  getTopSites:(params) => api.get('/recommendations/top-sites', { params }),
}

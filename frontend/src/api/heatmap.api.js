import api from './axios'

// Heatmap API only — recommendationsApi lives in recommendations.api.js
export const heatmapApi = {
  submitSurvey: (data)            => api.post('/heatmap/survey', data),
  predict:      (data)            => api.post('/heatmap/predict', data),
  getHeatmap:   (pageKey, siteUrl)=> api.get(`/heatmap/${encodeURIComponent(pageKey)}`, { params: { siteUrl } }),
  getSessions:  (siteUrl)         => api.get('/heatmap/sessions/summary', { params: { siteUrl } }),
}

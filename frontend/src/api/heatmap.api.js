import api from './axios'

export const heatmapApi = {
  predict:        (data)             => api.post('/heatmap/predict', data),
  getHeatmap:     (pageKey, siteUrl) => api.get(`/heatmap/${encodeURIComponent(pageKey)}`, { params: { siteUrl } }),
  getSessions:    (siteUrl)          => api.get('/heatmap/sessions/summary', { params: { siteUrl } }),
  screenshot:     (data)             => api.post('/heatmap/screenshot', data),
  createSurvey:   (data)             => api.post('/heatmap/create-survey', data),
  getSurveys:     (siteUrl, since = 'today') => api.get('/heatmap/surveys', { params: { siteUrl, since } }),
  getSurvey:      (token)            => api.get(`/heatmap/survey/${token}`),
  getSurveyResults:(token)           => api.get(`/heatmap/survey/${token}/results`),
  computeHeatmap: (token)            => api.post(`/heatmap/compute/${token}`),
  createBundle:   (data)             => api.post('/heatmap/bundle', data),
  getBundles:     ()                 => api.get('/heatmap/bundles'),
  bundleToChat:   (bundleId)         => api.post(`/heatmap/bundle/${bundleId}/send-to-chat`),
  submitSurvey:   (token, data)      => api.post(`/heatmap/survey/${token}/submit`, data),
  getSurveyPublic:(token)            => api.get(`/heatmap/survey/${token}`),
}

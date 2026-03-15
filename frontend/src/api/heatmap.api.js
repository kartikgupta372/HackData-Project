import api from './axios'

export const heatmapApi = {
  // Legacy
  predict:        (data)             => api.post('/heatmap/predict', data),
  getHeatmap:     (pageKey, siteUrl) => api.get(`/heatmap/${encodeURIComponent(pageKey)}`, { params: { siteUrl } }),
  getSessions:    (siteUrl)          => api.get('/heatmap/sessions/summary', { params: { siteUrl } }),
  // Screenshot
  screenshot:     (data)             => api.post('/heatmap/screenshot', data),
  // Surveys
  createSurvey:   (data)             => api.post('/heatmap/create-survey', data),
  // BUG 9 FIX: pass since=today by default so the list is IST-date-aware.
  // Pass since=null explicitly to get all-time surveys.
  getSurveys:     (siteUrl, since = 'today') => api.get('/heatmap/surveys', { params: { siteUrl, since } }),
  getSurvey:      (token)            => api.get(`/heatmap/survey/${token}`),
  getSurveyResults:(token)           => api.get(`/heatmap/survey/${token}/results`),
  computeHeatmap: (token)            => api.post(`/heatmap/compute/${token}`),
  // Bundles
  createBundle:   (data)             => api.post('/heatmap/bundle', data),
  getBundles:     ()                 => api.get('/heatmap/bundles'),
  bundleToChat:   (bundleId)         => api.post(`/heatmap/bundle/${bundleId}/send-to-chat`),
  // Public survey submit (no auth)
  submitSurvey:   (token, data)      => api.post(`/heatmap/survey/${token}/submit`, data),
  // Public survey fetch (no auth) — called from SurveyPage
  getSurveyPublic:(token)            => api.get(`/heatmap/survey/${token}`),
}


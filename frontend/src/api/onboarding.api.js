import api from './axios'

export const onboardingApi = {
  submit:            (data)     => api.post('/onboarding/submit', data),
  getStatus:         ()         => api.get('/onboarding/status'),
  uploadDocuments:   (formData) => api.post('/onboarding/upload-documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
}

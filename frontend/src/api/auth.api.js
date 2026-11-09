import api from './axios'

export const authApi = {
  register:    (data) => api.post('/auth/register', data),
  login:       (data) => api.post('/auth/login', data),
  googleLogin: (credential) => api.post('/auth/google', { credential }),
  providers:   ()     => api.get('/auth/providers'),
  guestLogin:  ()     => api.post('/auth/guest'),
  logout:      ()     => api.post('/auth/logout'),
  me:          ()     => api.get('/auth/me'),
}

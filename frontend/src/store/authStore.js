import { create } from 'zustand'
import { authApi } from '../api/auth.api'
import { onboardingApi } from '../api/onboarding.api'

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  onboardingCompleted: false,
  onboardingData: null,

  checkAuth: async () => {
    try {
      const res = await authApi.me()
      const user = res.data.data.user
      set({ user, isAuthenticated: true, isLoading: false })
      // Fetch onboarding status alongside auth check
      try {
        const ob = await onboardingApi.getStatus()
        set({
          onboardingCompleted: ob.data.data.onboarding_completed ?? false,
          onboardingData: ob.data.data.onboarding_data ?? null,
        })
      } catch { /* non-fatal */ }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (email, password) => {
    const res = await authApi.login({ email, password })
    const user = res.data.data.user
    set({ user, isAuthenticated: true })
    // Fetch onboarding status after login
    try {
      const ob = await onboardingApi.getStatus()
      set({
        onboardingCompleted: ob.data.data.onboarding_completed ?? false,
        onboardingData: ob.data.data.onboarding_data ?? null,
      })
    } catch { /* non-fatal */ }
    return user
  },

  register: async (name, email, password) => {
    const res = await authApi.register({ name, email, password })
    set({ user: res.data.data.user, isAuthenticated: true, onboardingCompleted: false })
    return res.data.data.user
  },

  loginWithGoogle: async (credential) => {
    const res = await authApi.googleLogin(credential)
    const user = res.data.data.user
    set({ user, isAuthenticated: true })
    // Fetch onboarding status after Google login
    try {
      const ob = await onboardingApi.getStatus()
      set({
        onboardingCompleted: ob.data.data.onboarding_completed ?? false,
        onboardingData: ob.data.data.onboarding_data ?? null,
      })
    } catch { /* non-fatal */ }
    return user
  },

  setAuthUser: (user) => {
    set({ user, isAuthenticated: true })
  },

  setOnboardingCompleted: (data) => {
    set({ onboardingCompleted: true, onboardingData: data })
  },

  logout: async () => {
    await authApi.logout().catch(() => {})
    set({ user: null, isAuthenticated: false, onboardingCompleted: false, onboardingData: null })
  },
}))

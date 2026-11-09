import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight, Settings, LogOut, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { useChatStore } from '../../store/chatStore'
import { chatApi } from '../../api/chat.api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'

export default function Sidebar() {
  const { user, logout, onboardingData } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, setActiveFeature } = useUIStore()
  const { activeThreadId, setActiveSession } = useChatStore()
  const qc = useQueryClient()
  const [deletingId, setDeletingId] = useState(null)

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await chatApi.listSessions()
      return res.data.data.sessions
    },
    refetchInterval: 30000,
  })

  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] })
    window.addEventListener('aura:session-created', refresh)
    window.addEventListener('aura:session-updated', refresh)
    return () => {
      window.removeEventListener('aura:session-created', refresh)
      window.removeEventListener('aura:session-updated', refresh)
    }
  }, [qc])
  const sessions = sessionsData ?? []

  const handleNewChat = () => {
    useChatStore.getState().clearSession()
    setActiveFeature('chat')
    window.dispatchEvent(new CustomEvent('aura:request-new-session'))
  }

  const handleSelectSession = async (s) => {
    if (s.thread_id === activeThreadId) return
    setActiveSession(s)
    try {
      const res = await chatApi.getSession(s.thread_id)
      const msgs = res.data.data.session?.messages ?? []
      useChatStore.getState().setMessages(msgs.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        type: m.content_type || 'text',
        timestamp: m.created_at,
      })))
    } catch {}
  }

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation()
    setDeletingId(sessionId)
    try {
      await chatApi.deleteSession(sessionId)
      qc.invalidateQueries({ queryKey: ['sessions'] })
      if (sessions.find(s => s.id === sessionId)?.thread_id === activeThreadId) {
        useChatStore.getState().clearSession()
      }
    } finally {
      setDeletingId(null)
    }
  }

  const w = sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 60 : 260 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Sessions" className="h-screen bg-aura-void border-r border-aura-line flex flex-col shrink-0 relative z-20 overflow-hidden"
    >
      {}
      <div className={clsx('flex items-center h-14 px-4 border-b border-aura-line shrink-0', sidebarCollapsed && 'justify-center px-0')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-aura-accent flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-aura-on-accent" />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="font-display font-bold text-[15px] text-aura-text whitespace-nowrap overflow-hidden"
              >
                Aura Design AI
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* New Chat */}
      <div className={clsx('px-3 py-3 shrink-0', sidebarCollapsed && 'px-2')}>
        <button
          onClick={handleNewChat}
          className={clsx(
            'w-full flex items-center gap-2 text-sm font-medium rounded-md transition-all duration-150',
            'bg-aura-accent hover:bg-aura-accent-glow text-aura-on-accent font-semibold',
            sidebarCollapsed ? 'justify-center p-2' : 'px-3 py-2.5'
          )}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!sidebarCollapsed && <span>New Analysis</span>}
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {!sidebarCollapsed && sessions.length > 0 && (
          <p className="text-xs font-semibold text-aura-muted px-2 py-2">Recent analyses</p>
        )}
        <div className="flex flex-col gap-0.5">
          {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.thread_id === activeThreadId}
              collapsed={sidebarCollapsed}
              isDeleting={deletingId === s.id}
              onSelect={() => handleSelectSession(s)}
              onDelete={(e) => handleDelete(e, s.id)}
            />
          ))}
        </div>
      </div>

      {/* Bottom: settings + user */}
      <div className={clsx('border-t border-aura-line p-2 shrink-0 flex flex-col gap-1', sidebarCollapsed && 'items-center')}>
        <SidebarButton icon={<Settings className="w-4 h-4" />} label="Settings" collapsed={sidebarCollapsed} />
        <SidebarButton
          icon={sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          label="Collapse sidebar"
          collapsed={sidebarCollapsed}
          onClick={toggleSidebar}
        />
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-aura-card border border-aura-border mt-1">
            <div className="w-8 h-8 rounded-full bg-aura-warn/20 border border-aura-warn/40 flex items-center justify-center shrink-0">
              <span className="text-xs font-display font-bold text-aura-warn">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-aura-text truncate">{user.name}</p>
              <p className="text-[11px] text-aura-muted truncate">{user.email}</p>
            </div>
            <button onClick={logout} aria-label="Sign out" title="Sign out" className="text-aura-muted hover:text-aura-error transition-colors p-1.5 rounded-md hover:bg-aura-elevated">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {sidebarCollapsed && (
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="p-2 text-aura-muted hover:text-aura-error transition-colors rounded-md hover:bg-aura-card">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

    </motion.aside>
  )
}

function SessionItem({ session, isActive, collapsed, isDeleting, onSelect, onDelete }) {
  // Fix C: new URL(null) throws — guard with try/catch
  let label = session.title || 'New Analysis'
  if (session.site_url) {
    try { label = new URL(session.site_url).hostname } catch { label = session.site_url }
  }

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'group relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 text-sm',
        isActive
          ? 'bg-aura-elevated text-aura-text'
          : 'text-aura-muted hover:text-aura-text hover:bg-aura-card',
        collapsed && 'justify-center px-0'
      )}
    >
      {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-aura-accent" />}
      <MessageSquare className={clsx('w-3.5 h-3.5 shrink-0', isActive ? 'text-aura-accent' : 'text-aura-faint')} />
      {!collapsed && (
        <>
          <span className="truncate flex-1 text-[13px]">{label}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div
              onClick={isDeleting ? undefined : onDelete}
              className="p-0.5 rounded text-aura-faint hover:text-aura-error transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </div>
          </div>
        </>
      )}
    </button>
  )
}

function SidebarButton({ icon, label, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2.5 w-full rounded-md px-2 py-2 text-aura-muted hover:text-aura-text hover:bg-aura-card transition-all text-sm',
        collapsed && 'justify-center'
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

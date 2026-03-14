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
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
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

  // Refresh sidebar whenever ChatView creates or updates a session
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

  const handleNewChat = async () => {
    const res = await chatApi.createSession()
    const session = res.data.data.session
    qc.invalidateQueries({ queryKey: ['sessions'] })
    setActiveSession(session)
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
      className="h-screen bg-aura-surface border-r border-aura-line flex flex-col shrink-0 relative z-20 overflow-hidden"
    >
      {/* Logo */}
      <div className={clsx('flex items-center h-14 px-4 border-b border-aura-line shrink-0', sidebarCollapsed && 'justify-center px-0')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-aura-accent/20 border border-aura-accent/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-aura-accent" />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="font-display font-bold text-sm text-gradient whitespace-nowrap overflow-hidden"
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
            'bg-aura-accent/10 hover:bg-aura-accent/20 border border-aura-accent/20 hover:border-aura-accent/40',
            'text-aura-accent hover:text-aura-accent-glow',
            sidebarCollapsed ? 'justify-center p-2' : 'px-3 py-2'
          )}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!sidebarCollapsed && <span>New Analysis</span>}
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {!sidebarCollapsed && sessions.length > 0 && (
          <p className="text-[10px] font-mono uppercase tracking-widest text-aura-faint px-2 py-2">Recent</p>
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
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md bg-aura-card border border-aura-line mt-1">
            <div className="w-7 h-7 rounded-full bg-aura-accent/20 border border-aura-accent/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-display font-bold text-aura-accent">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-aura-text truncate">{user.name}</p>
              <p className="text-[10px] text-aura-faint truncate">{user.email}</p>
            </div>
            <button onClick={logout} className="text-aura-faint hover:text-aura-error transition-colors p-1 rounded">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {sidebarCollapsed && (
          <button onClick={logout} className="p-2 text-aura-faint hover:text-aura-error transition-colors rounded-md hover:bg-aura-card">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute top-4 -right-3 w-6 h-6 rounded-full bg-aura-card border border-aura-border flex items-center justify-center text-aura-faint hover:text-aura-text hover:border-aura-accent transition-all z-30"
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>
  )
}

function SessionItem({ session, isActive, collapsed, isDeleting, onSelect, onDelete }) {
  const label = session.site_url
    ? new URL(session.site_url).hostname
    : session.title || 'New Analysis'

  return (
    <button
      onClick={onSelect}
      className={clsx(
        'group w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-all duration-150 text-sm',
        isActive
          ? 'bg-aura-accent/10 text-aura-text border border-aura-accent/20'
          : 'text-aura-muted hover:text-aura-text hover:bg-aura-card',
        collapsed && 'justify-center px-0'
      )}
    >
      <MessageSquare className={clsx('w-3.5 h-3.5 shrink-0', isActive ? 'text-aura-accent' : 'text-aura-faint')} />
      {!collapsed && (
        <>
          <span className="truncate flex-1 text-xs">{label}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="p-0.5 rounded text-aura-faint hover:text-aura-error transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
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

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/lib/auth'
import { useAdvisorModeCtx } from '@/contexts/AdvisorModeContext'
import { useChatContext } from '@/contexts/ChatContext'

interface Props {
  user: SessionUser
  onMenuToggle: () => void
}

const GREEN = '#16A34A'
const GRAY  = '#9ca3af'
const GRAY_LABEL = '#6b7280'

export default function BottomNav({ user, onMenuToggle }: Props) {
  const pathname = usePathname()
  const { advisorMode, initialized } = useAdvisorModeCtx()
  const { chatOpen, setChatOpen } = useChatContext()

  // Optimistic pending tab — set on tap, cleared when pathname settles
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => { setPending(null) }, [pathname])

  // Read search params client-side (SSR-safe)
  const [searchStr, setSearchStr] = useState('')
  useEffect(() => { setSearchStr(window.location.search) }, [pathname])

  // Active state: pending wins over pathname (instant feedback)
  function active(key: 'ordenes' | 'historial' | 'mail' | 'settings'): boolean {
    if (pending) {
      if (key === 'ordenes')   return pending === '/ordenes'
      if (key === 'historial') return pending === '/ordenes?tab=historial'
      if (key === 'mail')      return pending === '/mail'
      if (key === 'settings')  return pending === '/settings'
      return false
    }
    if (key === 'ordenes')   return pathname === '/ordenes' && !searchStr.includes('tab=historial')
    if (key === 'historial') return pathname === '/ordenes' && searchStr.includes('tab=historial')
    if (key === 'mail')      return pathname.startsWith('/mail')
    if (key === 'settings')  return pathname.startsWith('/settings')
    return false
  }

  const isOrdenes   = active('ordenes')
  const isHistorial = active('historial')
  const isMail      = active('mail')
  const isSettings  = active('settings')
  const isChat      = chatOpen && !pending  // chat doesn't have a pathname

  // Visibility
  const visibilityCls = initialized && advisorMode ? 'flex' : 'flex md:hidden'
  const showAdvisorNav = !initialized || advisorMode

  // Shared item class
  const itemCls = 'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors'

  return (
    <nav
      className={`${visibilityCls} fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {showAdvisorNav ? (
        /* ── Modo Asesor: 5 items ── */
        <>
          {/* Órdenes */}
          <Link
            href="/ordenes"
            className={itemCls}
            onClick={() => setPending('/ordenes')}
          >
            <svg className="w-5 h-5" style={{ color: isOrdenes ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isOrdenes ? GREEN : GRAY_LABEL }}>Órdenes</span>
          </Link>

          {/* Historial */}
          <Link
            href="/ordenes?tab=historial"
            className={itemCls}
            onClick={() => setPending('/ordenes?tab=historial')}
          >
            <svg className="w-5 h-5" style={{ color: isHistorial ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isHistorial ? GREEN : GRAY_LABEL }}>Historial</span>
          </Link>

          {/* Mail */}
          <Link
            href="/mail"
            className={itemCls}
            onClick={() => setPending('/mail')}
          >
            <svg className="w-5 h-5" style={{ color: isMail ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isMail ? GREEN : GRAY_LABEL }}>Mail</span>
          </Link>

          {/* Chat */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={itemCls}
          >
            <svg className="w-5 h-5" style={{ color: isChat ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isChat ? GREEN : GRAY_LABEL }}>Chat</span>
          </button>

          {/* Configuración */}
          <Link
            href="/settings"
            className={itemCls}
            onClick={() => setPending('/settings')}
          >
            <svg className="w-5 h-5" style={{ color: isSettings ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isSettings ? GREEN : GRAY_LABEL }}>Config</span>
          </Link>
        </>
      ) : (
        /* ── Standard mode: 3 items ── */
        <>
          <Link
            href="/ordenes"
            className={itemCls}
            onClick={() => setPending('/ordenes')}
          >
            <svg className="w-5 h-5" style={{ color: isOrdenes ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isOrdenes ? GREEN : GRAY_LABEL }}>Órdenes</span>
          </Link>

          <Link
            href="/ordenes?tab=historial"
            className={itemCls}
            onClick={() => setPending('/ordenes?tab=historial')}
          >
            <svg className="w-5 h-5" style={{ color: isHistorial ? GREEN : GRAY }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isHistorial ? GREEN : GRAY_LABEL }}>Historial</span>
          </Link>

          <button
            onClick={onMenuToggle}
            className={itemCls}
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <span className="text-[10px] font-medium text-gray-500">Más</span>
          </button>
        </>
      )}
    </nav>
  )
}

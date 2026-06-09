'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import BottomNav from './BottomNav'
import type { SessionUser } from '@/lib/auth'
import { AdvisorModeContext } from '@/contexts/AdvisorModeContext'
import { ChatProvider } from '@/contexts/ChatContext'
import { useAdvisorMode } from '@/hooks/useAdvisorMode'

interface Props {
  user: SessionUser
  children: React.ReactNode
}

export default function ClientLayout({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { advisorMode, setAdvisorMode, initialized } = useAdvisorMode()

  // Sidebar is hidden in Advisor Mode
  const showSidebar = !initialized || !advisorMode

  // Auto-close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Redirect / → /ordenes when Advisor Mode is active (client-side fallback)
  useEffect(() => {
    if (initialized && advisorMode && pathname === '/') {
      router.replace('/ordenes')
    }
  }, [initialized, advisorMode, pathname, router])

  function toggle() {
    setSidebarOpen((v) => !v)
  }

  // Content area classes:
  // - Advisor mode: always pt-14 (MobileHeader) + pb-16 (BottomNav), no left offset
  // - Standard mode: mobile = pt-14 pb-16, desktop = md:pl-64 no top/bottom
  const contentCls = initialized && advisorMode
    ? 'min-h-screen flex flex-col pt-14 pb-16'
    : 'md:pl-64 min-h-screen flex flex-col pt-14 md:pt-0 pb-16 md:pb-0'

  return (
    <ChatProvider>
      <AdvisorModeContext.Provider value={{ advisorMode, setAdvisorMode, initialized }}>

        {/* Mobile overlay — only when sidebar is shown */}
        {showSidebar && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — hidden entirely in Advisor Mode */}
        {showSidebar && (
          <Sidebar user={user} isOpen={sidebarOpen} onToggle={toggle} />
        )}

        {/* Top header — always visible */}
        <MobileHeader user={user} onMenuToggle={toggle} showHamburger={showSidebar} />

        {/* Main content */}
        <div className={contentCls}>
          <main className="flex-1">{children}</main>
        </div>

        {/* Bottom nav — always visible in Advisor Mode, mobile-only otherwise */}
        <BottomNav user={user} onMenuToggle={toggle} />

      </AdvisorModeContext.Provider>
    </ChatProvider>
  )
}

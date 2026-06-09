'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import BottomNav from './BottomNav'
import type { SessionUser } from '@/lib/auth'

interface Props {
  user: SessionUser
  children: React.ReactNode
}

export default function ClientLayout({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Auto-close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  function toggle() {
    setSidebarOpen((v) => !v)
  }

  return (
    <>
      {/* Mobile overlay — behind sidebar, above content */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar user={user} isOpen={sidebarOpen} onToggle={toggle} />

      {/* Mobile top header */}
      <MobileHeader user={user} onMenuToggle={toggle} />

      {/* Main content — pushed right on desktop, full width on mobile */}
      <div className="md:pl-64 min-h-screen flex flex-col pt-14 md:pt-0 pb-16 md:pb-0">
        <main className="flex-1">{children}</main>
      </div>

      {/* Bottom navigation bar — mobile only */}
      <BottomNav user={user} onMenuToggle={toggle} />
    </>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/lib/auth'

interface Props {
  user: SessionUser
  onMenuToggle: () => void
}

export default function BottomNav({ user, onMenuToggle }: Props) {
  const pathname = usePathname()
  const isOrdenes = pathname.startsWith('/ordenes') || pathname === '/'

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {/* Primary: Enviar Órdenes */}
        <Link
          href="/ordenes"
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] active:bg-gray-50 transition-colors"
        >
          <svg
            className={`w-5 h-5 ${isOrdenes ? 'text-[#16A34A]' : 'text-gray-400'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <span className={`text-[10px] font-medium ${isOrdenes ? 'text-[#16A34A]' : 'text-gray-500'}`}>
            Órdenes
          </span>
        </Link>

        {/* Historial */}
        <Link
          href="/ordenes?tab=historial"
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] active:bg-gray-50 transition-colors"
        >
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-medium text-gray-500">Historial</span>
        </Link>

        {/* Más — opens full menu */}
        <button
          onClick={onMenuToggle}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] active:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <span className="text-[10px] font-medium text-gray-500">Más</span>
        </button>
      </div>
    </nav>
  )
}

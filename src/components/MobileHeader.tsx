'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/lib/auth'

const PAGE_TITLES: [string, string][] = [
  ['/', 'Panel del día'],
  ['/tasks', 'Tareas'],
  ['/clients', 'Clientes'],
  ['/openings', 'Aperturas'],
  ['/banco-central', 'Banco Central'],
  ['/ordenes', 'Enviar órdenes'],
  ['/factsheet', 'Factsheet'],
  ['/propuestas', 'Propuestas'],
  ['/events', 'Agenda'],
  ['/mail', 'Mail'],
  ['/calendar', 'Vencimientos'],
  ['/ceo', 'Dashboard'],
  ['/kpis', 'KPIs'],
  ['/pagos-mensuales', 'Pagos mensuales'],
  ['/impuestos', 'Impuestos'],
  ['/liquidacion-brokers', 'Liquidación'],
  ['/recursos', 'Biblioteca'],
  ['/claves', 'Claves'],
  ['/mi-carpeta', 'Mi carpeta'],
  ['/admin/users', 'Usuarios'],
  ['/sincronizacion', 'Sincronización'],
  ['/settings', 'Configuración'],
]

function getTitle(pathname: string, search: string): string {
  // Special case: /ordenes?tab=historial
  if (pathname === '/ordenes' && search.includes('tab=historial')) return 'Historial de órdenes'
  // Exact match first
  for (const [key, val] of PAGE_TITLES) {
    if (pathname === key) return val
  }
  // Prefix match (skip root '/')
  for (const [key, val] of PAGE_TITLES) {
    if (key !== '/' && pathname.startsWith(key)) return val
  }
  return 'Roble Capital'
}

interface Props {
  user: SessionUser
  onMenuToggle: () => void
}

export default function MobileHeader({ user, onMenuToggle }: Props) {
  const pathname = usePathname()
  // useSearchParams not needed — we can read window.location.search safely here
  // but to avoid hydration mismatch, use a client-only trick:
  const [search, setSearch] = useState('')
  useEffect(() => { setSearch(window.location.search) }, [pathname])
  const title = getTitle(pathname, search)

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-10 flex items-center h-14 px-3 border-b border-white/10"
      style={{ backgroundColor: '#2D3F52' }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuToggle}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        aria-label="Abrir menú"
      >
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Title */}
      <h1 className="flex-1 text-center text-[15px] font-semibold text-white px-2 truncate">
        {title}
      </h1>

      {/* User avatar */}
      <div className="w-9 h-9 flex items-center justify-center shrink-0">
        <div className="w-7 h-7 rounded-full bg-[#16A34A] flex items-center justify-center">
          <span className="text-[11px] font-bold text-white leading-none">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  )
}

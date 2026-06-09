'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/lib/auth'
import { useAdvisorModeCtx } from '@/contexts/AdvisorModeContext'

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
  if (pathname === '/ordenes' && search.includes('tab=historial')) return 'Historial de órdenes'
  for (const [key, val] of PAGE_TITLES) {
    if (pathname === key) return val
  }
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
  const [search, setSearch] = useState('')
  const { advisorMode, setAdvisorMode, initialized } = useAdvisorModeCtx()

  useEffect(() => { setSearch(window.location.search) }, [pathname])

  const title = getTitle(pathname, search)

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-10 flex items-center h-14 px-3 gap-2 border-b border-white/10"
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

      {/* Page title — centered */}
      <h1 className="flex-1 text-center text-[14px] font-semibold text-white truncate">
        {title}
      </h1>

      {/* Modo Asesor toggle */}
      <button
        onClick={() => initialized && setAdvisorMode(!advisorMode)}
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold transition-all shrink-0',
          advisorMode
            ? 'bg-green-500/20 text-green-300'
            : 'bg-white/10 text-white/40',
        ].join(' ')}
        title={advisorMode ? 'Modo Asesor activo — tocar para desactivar' : 'Activar Modo Asesor'}
      >
        {/* Briefcase icon */}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>

        <span className="hidden xs:inline">Asesor</span>

        {/* Mini switch */}
        <div
          className={[
            'relative w-7 h-3.5 rounded-full transition-colors duration-200',
            advisorMode ? 'bg-green-500' : 'bg-white/20',
          ].join(' ')}
        >
          <div
            className={[
              'absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform duration-200',
              advisorMode ? 'translate-x-[14px]' : 'translate-x-0.5',
            ].join(' ')}
          />
        </div>
      </button>

      {/* User avatar */}
      <div className="w-7 h-7 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
        <span className="text-[11px] font-bold text-white leading-none">
          {user.name.charAt(0).toUpperCase()}
        </span>
      </div>
    </header>
  )
}

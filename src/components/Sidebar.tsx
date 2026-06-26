'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import type { SessionUser, Permission } from '@/lib/auth'
import { useAdvisorModeCtx } from '@/contexts/AdvisorModeContext'

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; subtitle: string; icon: (p: { className?: string }) => JSX.Element; permission: Permission }
type NavSection = { label: string; items: NavItem[] }

const nav: NavSection[] = [
  {
    label: 'Acceso rápido',
    items: [
      { href: '/ordenes', label: 'Enviar órdenes', subtitle: 'Órdenes de inversión', icon: OrdersIcon, permission: 'orders' },
    ],
  },
  {
    label: 'Principal',
    items: [
      { href: '/',      label: 'Panel del día', subtitle: 'Resumen de actividad',    icon: GridIcon,    permission: 'panel' },
      { href: '/tasks', label: 'Tareas',        subtitle: 'Pendientes y seguimiento', icon: CheckIcon,   permission: 'tasks' },
    ],
  },
  {
    label: 'Operación',
    items: [
      { href: '/clients',       label: 'Clientes',      subtitle: 'Gestión de clientes',          icon: UsersIcon,   permission: 'clients' },
      { href: '/openings',      label: 'Aperturas',     subtitle: 'Nuevas cuentas',                icon: OpeningIcon, permission: 'openings' },
      { href: '/banco-central', label: 'Banco Central', subtitle: 'Legajos · Monitoreo · Scoring', icon: ShieldIcon,  permission: 'banco_central' },
    ],
  },
  {
    label: 'Inversiones',
    items: [
      { href: '/fondos',     label: 'Fondos',     subtitle: 'Biblioteca de factsheets',icon: FondosIcon,    permission: 'fondos' },
      { href: '/factsheet',  label: 'Factsheet',  subtitle: 'Informe de portafolio',   icon: FactsheetIcon, permission: 'factsheet' },
      { href: '/propuestas', label: 'Propuestas', subtitle: 'Propuestas de inversión', icon: ProposalIcon,  permission: 'proposals' },
    ],
  },
  {
    label: 'Agenda y Mail',
    items: [
      { href: '/events', label: 'Agenda', subtitle: 'Google Calendar y eventos', icon: CalendarIcon, permission: 'calendar' },
      { href: '/mail',   label: 'Mail',   subtitle: 'Gmail y comunicaciones',    icon: MailIcon,     permission: 'calendar' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/pagos-mensuales', label: 'Pagos mensuales', subtitle: 'Control de pagos',    icon: CoinIcon, permission: 'pagos' },
      { href: '/impuestos',       label: 'Impuestos',       subtitle: 'Gestión tributaria',  icon: TaxIcon,  permission: 'impuestos' },
    ],
  },
  {
    label: 'Recursos',
    items: [
      { href: '/recursos',    label: 'Biblioteca', subtitle: 'Documentos y recursos', icon: LibraryIcon,        permission: 'recursos' },
      { href: '/claves',      label: 'Claves',     subtitle: 'Bóveda de accesos',     icon: KeyIcon,            permission: 'claves' },
      { href: '/mi-carpeta',  label: 'Mi carpeta', subtitle: 'Documentos en OneDrive', icon: FolderPersonalIcon, permission: 'panel' },
    ],
  },
  {
    label: 'Dirección',
    items: [
      { href: '/ceo',                 label: 'Dashboard',   subtitle: 'Métricas ejecutivas',   icon: BIIcon,     permission: 'ceo_dashboard' },
      { href: '/kpis',                label: 'KPIs',        subtitle: 'Indicadores clave',      icon: KpiIcon,    permission: 'kpis' },
      { href: '/liquidacion-brokers', label: 'Liquidación', subtitle: 'Brokers y comisiones',   icon: BrokerIcon, permission: 'liquidacion' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/admin/users',     label: 'Usuarios',        subtitle: 'Gestión de acceso',     icon: AdminIcon, permission: 'admin' },
      { href: '/sincronizacion',  label: 'Sincronización',  subtitle: 'SharePoint y OneDrive', icon: SyncIcon,  permission: 'sincronizacion' },
    ],
  },
]

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin:      ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','admin','sincronizacion','factsheet','proposals','orders','fondos'],
  ceo:        ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders','fondos'],
  direccion:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders','fondos'],
  asesor:     ['panel','tasks','clients','openings','calendar','deadlines','recursos','factsheet','proposals','orders','fondos'],
  asistente:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','recursos','orders','fondos'],
  compliance: ['panel','banco_central','calendar','deadlines','recursos'],
}

function canSee(user: SessionUser, permission: Permission): boolean {
  // Custom per-user permissions override role defaults
  if (user.permissions && user.permissions.length > 0) {
    return (user.permissions as Permission[]).includes(permission)
  }
  const perms = ROLE_PERMISSIONS[user.role] ?? []
  return perms.includes(permission)
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  ceo: 'CEO',
  direccion: 'Dirección',
  asesor: 'Asesor',
  asistente: 'Asistente',
  compliance: 'Compliance',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { user: SessionUser; isOpen?: boolean; onToggle?: () => void }

export default function Sidebar({ user, isOpen = false, onToggle }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { advisorMode, setAdvisorMode, initialized, forcedByAdmin } = useAdvisorModeCtx()
  const [searchStr, setSearchStr] = useState('')
  useEffect(() => { setSearchStr(window.location.search) }, [pathname])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const visibleNav = nav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSee(user, item.permission)),
    }))
    .filter((section) => section.items.length > 0)

  // Show simplified nav on mobile when Modo Asesor is on (or not yet initialized = default)
  const mobileSimplified = !initialized || advisorMode

  // Simplified mobile nav items
  const advisorItems = [
    { href: '/ordenes',               label: 'Enviar órdenes', subtitle: 'Crear y enviar instrucciones', icon: OrdersIcon },
    { href: '/ordenes?tab=historial', label: 'Historial',       subtitle: 'Órdenes enviadas',             icon: ClockIcon },
    { href: '/mail',                  label: 'Mail',            subtitle: 'Bandeja de entrada Gmail',     icon: MailIcon },
    { href: '/settings',              label: 'Configuración',   subtitle: 'Cuenta y Gmail',               icon: SettingsIconFn },
  ]

  function advisorIsActive(href: string): boolean {
    if (href === '/ordenes') return pathname === '/ordenes' && !searchStr.includes('tab=historial')
    if (href.includes('historial')) return pathname === '/ordenes' && searchStr.includes('tab=historial')
    if (href === '/mail') return pathname.startsWith('/mail')
    if (href === '/settings') return pathname.startsWith('/settings')
    return false
  }

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 w-64 flex flex-col z-30',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
      style={{ backgroundColor: '#2D3F52' }}
    >
      {/* Logo + mobile close */}
      <div className="h-14 md:h-20 flex items-center justify-between px-4 border-b border-white/10">
        <Image
          src="/download.png"
          alt="Roble Capital"
          width={155}
          height={42}
          className="object-contain"
          style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.92)' }}
          priority
        />
        {/* Close button — only on mobile */}
        <button
          onClick={onToggle}
          className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          aria-label="Cerrar menú"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── MOBILE: simplified Modo Asesor nav ── */}
      {mobileSimplified && (
        <nav className="md:hidden flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {advisorItems.map(({ href, label, subtitle, icon: Icon }) => {
            const isActive = advisorIsActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150',
                  isActive ? 'text-white' : 'hover:bg-white/5',
                ].join(' ')}
                style={isActive ? { backgroundColor: 'rgba(22,163,74,0.15)', borderLeft: '2px solid #16A34A' } : {}}
              >
                <span className="shrink-0" style={{ color: isActive ? '#16A34A' : 'rgba(255,255,255,0.50)' }}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] font-semibold leading-tight" style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.85)' }}>
                    {label}
                  </span>
                  <span className="text-[11px] leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {subtitle}
                  </span>
                </div>
              </Link>
            )
          })}
        </nav>
      )}

      {/* ── DESKTOP full navigation (always) + MOBILE full nav when Modo Asesor is OFF ── */}
      <nav className={[
        'flex-1 overflow-y-auto px-2.5 py-4 space-y-5',
        mobileSimplified ? 'hidden md:block' : 'block',
      ].join(' ')}>
        {visibleNav.map((section) => (
          <div key={section.label}>
            <p className="px-2.5 mb-1 text-[9px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.22)' }}>
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, subtitle, icon: Icon }) => {
                const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150',
                        isActive ? 'text-white' : 'hover:bg-white/5'
                      )}
                      style={isActive ? {
                        backgroundColor: 'rgba(22,163,74,0.15)',
                        borderLeft: '2px solid #16A34A',
                      } : {}}
                    >
                      <span className="shrink-0" style={{ color: isActive ? '#16A34A' : 'rgba(255,255,255,0.45)' }}>
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13.5px] font-semibold leading-tight truncate" style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.82)' }}>
                          {label}
                        </span>
                        <span className="text-[10.5px] leading-tight truncate mt-0.5" style={{ color: isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)' }}>
                          {subtitle}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>{/* end full nav */}

      {/* User footer */}
      <div className="px-3 py-3 border-t border-white/8 space-y-2">
        {/* Modo Asesor indicator / toggle */}
        {forcedByAdmin ? (
          /* Admin-locked: show badge, no toggle */
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600/15">
            <svg className="w-3.5 h-3.5 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span className="text-[11px] font-semibold text-green-300">Modo Asesor</span>
            <span className="ml-auto text-[9px] font-bold text-green-400/60 bg-green-400/10 px-1.5 py-0.5 rounded">activo</span>
          </div>
        ) : (
          /* User-controlled toggle */
          <button
            onClick={() => {
              if (!initialized) return
              const next = !advisorMode
              setAdvisorMode(next)
              if (next) router.push('/ordenes')
            }}
            className={[
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors',
              advisorMode ? 'bg-green-600/15 hover:bg-green-600/20' : 'bg-white/5 hover:bg-white/8',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 min-w-0">
              <svg
                className={`w-3.5 h-3.5 shrink-0 ${advisorMode ? 'text-green-400' : 'text-white/40'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span className={`text-[11px] font-semibold ${advisorMode ? 'text-green-300' : 'text-white/50'}`}>
                Modo Asesor
              </span>
            </div>
            <div className={`relative w-8 h-4 rounded-full transition-colors duration-200 shrink-0 ${advisorMode ? 'bg-green-500' : 'bg-white/20'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform duration-200 ${advisorMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        )}

        {/* User info */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-white/5">
          <div className="w-6 h-6 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/80 truncate">{user.name}</p>
            <p className="text-[9px] text-white/35">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
        </div>
        {/* Settings + Logout row */}
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded flex-1 text-[11px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.28)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
          >
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configuración
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.28)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
            title="Cerrar sesión"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function OrdersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
}
function GridIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
}
function UsersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
}
function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
}
function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function OpeningIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
}
function ShieldIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
}
function BIIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>
}
function KpiIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
}
function CoinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function TaxIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
}
function BrokerIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
}
function LibraryIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
}
function MailIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
}
function AdminIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
function KeyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
}
function SyncIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
}
function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}
function SuitabilityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
function FolderPersonalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25A2.25 2.25 0 004.5 16.5h15a2.25 2.25 0 002.25-2.25V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}
function FondosIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function FactsheetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function ProposalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  )
}
function DocuSignIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  )
}

function SettingsIconFn({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

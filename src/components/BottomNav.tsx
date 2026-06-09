'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SessionUser, Permission } from '@/lib/auth'

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin:      ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','admin','sincronizacion','factsheet','proposals','orders'],
  ceo:        ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders'],
  direccion:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders'],
  asesor:     ['panel','tasks','clients','openings','calendar','deadlines','recursos','factsheet','proposals','orders'],
  asistente:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','recursos','orders'],
  compliance: ['panel','banco_central','calendar','deadlines','recursos'],
}

function canSee(user: SessionUser, permission: Permission): boolean {
  if (user.permissions && user.permissions.length > 0) {
    return (user.permissions as Permission[]).includes(permission)
  }
  return (ROLE_PERMISSIONS[user.role] ?? []).includes(permission)
}

interface Props {
  user: SessionUser
  onMenuToggle: () => void
}

export default function BottomNav({ user, onMenuToggle }: Props) {
  const pathname = usePathname()

  const ALL_ITEMS = [
    { href: '/',        label: 'Inicio',    permission: 'panel'    as Permission, Icon: HomeIcon },
    { href: '/clients', label: 'Clientes',  permission: 'clients'  as Permission, Icon: UsersIcon },
    { href: '/tasks',   label: 'Tareas',    permission: 'tasks'    as Permission, Icon: CheckIcon },
    { href: '/events',  label: 'Agenda',    permission: 'calendar' as Permission, Icon: CalendarIcon },
  ]

  const visibleItems = ALL_ITEMS.filter((item) => canSee(user, item.permission))

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {visibleItems.slice(0, 4).map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] active:bg-gray-50 transition-colors"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-[#16A34A]' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-medium ${active ? 'text-[#16A34A]' : 'text-gray-500'}`}>
                {label}
              </span>
            </Link>
          )
        })}

        {/* Más — opens full sidebar */}
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

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

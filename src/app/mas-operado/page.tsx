import { redirect } from 'next/navigation'
import { getSession, hasPermission, isAdminRole, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { canSeeMenuKey } from '@/lib/auth/menu'
import MasOperadoClient from './MasOperadoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lo más operado' }

export default async function MasOperadoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <MasOperadoClient
      puedeCrearPlantilla={hasPermission(session.role, 'research', session.permissions)}
      puedeUnir={canSeeMenuKey(session.role, 'menu_mas_operado', session.permissions)}
      puedeBuscar={isAdminRole(session.role) || RESEARCH_AUTHOR_ROLES.includes(session.role as any)}
    />
  )
}

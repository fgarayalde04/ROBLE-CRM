import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { listUsers, listAdvisorFolders } from '@/lib/db/users'
import UsersManager from './UsersManager'

export const metadata: Metadata = { title: 'Usuarios' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  noStore()

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/')

  const [allUsers, advisorFolders] = await Promise.all([
    listUsers(),
    listAdvisorFolders(),
  ])

  // Separate pending users (active=false + _pending_approval in permissions)
  const pendingUsers = allUsers.filter(
    u => !u.active && Array.isArray(u.permissions) && u.permissions.includes('_pending_approval')
  )
  const activeUsers = allUsers.filter(
    u => !((!u.active) && Array.isArray(u.permissions) && u.permissions.includes('_pending_approval'))
  )

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Usuarios</h1>
        <p className="mt-0.5 text-sm text-gray-400">Gestión de accesos y roles del sistema</p>
      </div>
      <UsersManager initialUsers={activeUsers} pendingUsers={pendingUsers} currentUserId={session.id} advisorFolders={advisorFolders} />
    </div>
  )
}

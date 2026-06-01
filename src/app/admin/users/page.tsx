import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import UsersManager from './UsersManager'

export const metadata: Metadata = { title: 'Usuarios | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  noStore()

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/')

  const [usersRes, advisorsRes] = await Promise.all([
    supabaseAdmin
      .from('crm_users')
      .select('id, name, email, role, active, permissions, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, created_at, updated_at')
      .order('name'),
    supabaseAdmin
      .from('clients')
      .select('advisor')
      .not('advisor', 'is', null),
  ])

  if (usersRes.error) throw new Error(usersRes.error.message)

  // Separate pending users (active=false + _pending_approval in permissions)
  const allUsers = usersRes.data ?? []
  const pendingUsers = allUsers.filter(
    u => !u.active && Array.isArray(u.permissions) && u.permissions.includes('_pending_approval')
  )
  const activeUsers = allUsers.filter(
    u => !((!u.active) && Array.isArray(u.permissions) && u.permissions.includes('_pending_approval'))
  )

  // Get unique, non-empty advisor folder names sorted alphabetically
  const seen = new Set<string>()
  const advisorFolders: string[] = []
  for (const c of advisorsRes.data ?? []) {
    if (c.advisor && !seen.has(c.advisor)) {
      seen.add(c.advisor)
      advisorFolders.push(c.advisor)
    }
  }
  advisorFolders.sort()

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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type UserRole = 'admin' | 'asesor' | 'asistente' | 'compliance' | 'direccion' | 'ceo'
type Permission = 'panel' | 'tasks' | 'clients' | 'openings' | 'banco_central' | 'calendar' | 'deadlines' | 'ceo_dashboard' | 'kpis' | 'pagos' | 'impuestos' | 'liquidacion' | 'recursos' | 'claves' | 'admin' | 'sincronizacion'

interface CrmUser {
  id: string
  name: string
  email: string | null
  role: UserRole
  active: boolean
  permissions: Permission[] | null
  created_at: string
  updated_at: string | null
}

// ─── Permission definitions ───────────────────────────────────────────────────

const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: 'Principal',
    items: [
      { key: 'panel', label: 'Panel del día' },
      { key: 'tasks', label: 'Tareas' },
    ],
  },
  {
    label: 'Operación',
    items: [
      { key: 'clients', label: 'Clientes' },
      { key: 'openings', label: 'Clientes nuevos / Aperturas' },
      { key: 'banco_central', label: 'Banco Central' },
    ],
  },
  {
    label: 'Agenda',
    items: [
      { key: 'calendar', label: 'Agenda / Calendario' },
      { key: 'deadlines', label: 'Vencimientos' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { key: 'pagos', label: 'Pagos mensuales' },
      { key: 'impuestos', label: 'Impuestos' },
    ],
  },
  {
    label: 'Dirección',
    items: [
      { key: 'ceo_dashboard', label: 'Dashboard financiero' },
      { key: 'kpis', label: 'KPIs internos' },
      { key: 'liquidacion', label: 'Liquidación Brokers' },
      { key: 'recursos', label: 'Biblioteca / Recursos' },
      { key: 'claves', label: 'Claves' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { key: 'admin', label: 'Gestión de usuarios' },
      { key: 'sincronizacion', label: 'Sincronización' },
    ],
  },
]

const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:      ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','admin','sincronizacion'],
  ceo:        ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves'],
  direccion:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','ceo_dashboard','kpis','liquidacion','recursos','claves'],
  asesor:     ['panel','tasks','clients','openings','calendar','deadlines','recursos'],
  asistente:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','recursos'],
  compliance: ['panel','banco_central','calendar','deadlines','recursos'],
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  ceo: 'CEO',
  direccion: 'Dirección',
  asesor: 'Asesor',
  asistente: 'Asistente',
  compliance: 'Compliance',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  ceo: 'bg-[#2D3F52]/10 text-[#2D3F52]',
  direccion: 'bg-indigo-50 text-indigo-700',
  asesor: 'bg-blue-50 text-blue-700',
  asistente: 'bg-gray-100 text-gray-600',
  compliance: 'bg-amber-50 text-amber-700',
}

const ALL_ROLES: UserRole[] = ['admin', 'ceo', 'direccion', 'asesor', 'asistente', 'compliance']

interface PendingUser {
  id: string
  name: string
  email: string | null
  role: string
  active: boolean
  permissions: string[] | null
  created_at: string
  updated_at: string | null
}

interface Props {
  initialUsers: CrmUser[]
  pendingUsers: PendingUser[]
  currentUserId: string
  advisorFolders: string[]
}

type ModalType = 'create' | 'edit' | 'delete' | 'reset_password' | null
type EditTab = 'info' | 'permisos'

export default function UsersManager({ initialUsers, pendingUsers: initialPending, currentUserId, advisorFolders }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<CrmUser[]>(initialUsers)
  const [pending, setPending] = useState<PendingUser[]>(initialPending)
  const [modal, setModal] = useState<ModalType>(null)
  const [selectedUser, setSelectedUser] = useState<CrmUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Create / Edit form state
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'asesor' as UserRole })
  // Permissions state for edit modal
  const [editTab, setEditTab] = useState<EditTab>('info')
  const [customPerms, setCustomPerms] = useState<Permission[] | null>(null)
  // Folder permissions state
  const [seeAllFolders, setSeeAllFolders] = useState(false)
  const [allowedFolders, setAllowedFolders] = useState<string[]>([])
  const [folderPermsLoading, setFolderPermsLoading] = useState(false)
  // Reset password state
  const [newPassword, setNewPassword] = useState('')
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState('')

  function openCreate() {
    setForm({ name: '', email: '', password: '', role: 'asesor' })
    setError('')
    setModal('create')
  }

  async function openEdit(user: CrmUser) {
    setSelectedUser(user)
    setForm({ name: user.name, email: user.email ?? '', password: '', role: user.role })
    setCustomPerms(user.permissions ?? null)
    setEditTab('info')
    setError('')
    setModal('edit')

    // Load folder permissions
    setFolderPermsLoading(true)
    try {
      const res = await fetch(`/api/users/folder-permissions?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setSeeAllFolders(data.see_all_folders ?? false)
        setAllowedFolders(data.folders ?? [])
      }
    } catch {}
    setFolderPermsLoading(false)
  }

  function openDelete(user: CrmUser) {
    setSelectedUser(user)
    setDeleteConfirm('')
    setError('')
    setModal('delete')
  }

  function openResetPassword(user: CrmUser) {
    setSelectedUser(user)
    setNewPassword('')
    setError('')
    setModal('reset_password')
  }

  function closeModal() {
    setModal(null)
    setSelectedUser(null)
    setError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear usuario')
      setUsers((u) => [...u, data].sort((a, b) => a.name.localeCompare(b.name)))
      closeModal()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return
    setLoading(true)
    setError('')
    try {
      const body: any = {
        id: selectedUser.id,
        name: form.name,
        email: form.email,
        role: form.role,
        permissions: customPerms,
      }
      if (form.password) body.password = form.password
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setUsers((u) => u.map((x) => (x.id === data.id ? { ...x, ...data } : x)).sort((a, b) => a.name.localeCompare(b.name)))

      // Save folder permissions
      await fetch('/api/users/folder-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, see_all_folders: seeAllFolders, folders: allowedFolders }),
      })

      closeModal()
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser || !newPassword) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedUser.id, password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al resetear contraseña')
      closeModal()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!selectedUser) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedUser.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar')
      setUsers((u) => u.filter((x) => x.id !== selectedUser.id))
      closeModal()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(user: CrmUser) {
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, active: !user.active }),
      })
      const data = await res.json()
      if (!res.ok) return
      setUsers((u) => u.map((x) => (x.id === data.id ? { ...x, active: data.active } : x)))
    } catch {}
  }

  // ─── Pending approval handlers ────────────────────────────────────────────
  async function handleApprove(userId: string) {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, action: 'approve' }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      // Move from pending to users list
      const approved = pending.find(p => p.id === userId)
      if (approved) {
        setUsers(prev => [...prev, { ...approved, active: true, role: data.role as UserRole, permissions: data.permissions }])
        setPending(prev => prev.filter(p => p.id !== userId))
      }
    } catch { alert('Error al aprobar') }
  }

  async function handleReject(userId: string, name: string) {
    if (!confirm(`Rechazar la solicitud de "${name}"? Se eliminará la cuenta.`)) return
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, action: 'reject' }),
      })
      if (!res.ok) { alert('Error al rechazar'); return }
      setPending(prev => prev.filter(p => p.id !== userId))
    } catch { alert('Error al rechazar') }
  }

  const activeCount = users.filter((u) => u.active).length

  return (
    <>
      {/* ── Solicitudes pendientes ── */}
      {pending.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-[#2D3F52]">Solicitudes pendientes</h2>
            <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
              {pending.length}
            </span>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-amber-50 border-b border-amber-200">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-amber-800 uppercase tracking-wide">Nombre</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-amber-800 uppercase tracking-wide">Email</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-amber-800 uppercase tracking-wide">Dominio</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-amber-800 uppercase tracking-wide">Solicitado</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-amber-800 uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(u => {
                  const domain = u.email?.split('@')[1] ?? '—'
                  const fecha = new Date(u.created_at).toLocaleDateString('es-UY', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })
                  return (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-4 text-sm font-medium text-[#2D3F52]">{u.name}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{u.email ?? '—'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full font-medium">@{domain}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">{fecha}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(u.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleReject(u.id, u.name)}
                            className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats + Create button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{users.length}</span> usuarios totales ·{' '}
            <span className="font-semibold text-emerald-700">{activeCount}</span> activos
          </span>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors"
        >
          + Nuevo usuario
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Rol</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((user) => (
              <tr key={user.id} className={`hover:bg-gray-50/60 transition-colors ${!user.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#2D3F52]/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-[#2D3F52]">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      {user.id === currentUserId && (
                        <p className="text-[10px] text-[#16A34A] font-medium">Tú</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{user.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(user)}
                    disabled={user.id === currentUserId}
                    title={user.id === currentUserId ? 'No podés desactivarte a vos mismo' : user.active ? 'Desactivar' : 'Activar'}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                      user.active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600'
                        : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'
                    } disabled:cursor-not-allowed disabled:hover:bg-emerald-50 disabled:hover:text-emerald-700`}
                  >
                    {user.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => openEdit(user)}
                      className="p-1.5 text-gray-400 hover:text-[#2D3F52] hover:bg-gray-100 rounded transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openResetPassword(user)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                      title="Resetear contraseña"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </button>
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => openDelete(user)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No hay usuarios registrados.
          </div>
        )}
      </div>

      {/* ─────────────────────── MODALS ─────────────────────── */}

      {/* CREATE / EDIT modal */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal
          title={modal === 'create' ? 'Nuevo usuario' : `Editar · ${selectedUser?.name}`}
          onClose={closeModal}
          wide={modal === 'edit'}
        >
          {/* Tabs — only in edit mode */}
          {modal === 'edit' && (
            <div className="flex border-b border-gray-100 mb-4 -mx-5 px-5">
              {(['info', 'permisos'] as EditTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditTab(tab)}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors capitalize ${
                    editTab === tab
                      ? 'border-[#2D3F52] text-[#2D3F52]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab === 'info' ? 'Información' : 'Permisos'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={modal === 'create' ? handleCreate : handleEdit}>
            {/* Info tab */}
            {(modal === 'create' || editTab === 'info') && (
              <div className="space-y-4">
                <Field label="Nombre completo">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus={modal === 'create'}
                    placeholder="Nombre Apellido"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="usuario@roblecapital.com"
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Rol">
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                    className={INPUT_CLS}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </Field>
                {modal === 'create' && (
                  <Field label="Contraseña">
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      required
                      placeholder="Mínimo 8 caracteres"
                      className={INPUT_CLS}
                    />
                  </Field>
                )}
                {modal === 'edit' && (
                  <Field label="Nueva contraseña" hint="Dejar vacío para no cambiar">
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••"
                      className={INPUT_CLS}
                    />
                  </Field>
                )}
              </div>
            )}

            {/* Permisos tab — only in edit mode */}
            {modal === 'edit' && editTab === 'permisos' && (
              <div className="space-y-4">
                {/* Toggle: custom vs role defaults */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Permisos personalizados</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {customPerms
                        ? 'Usando permisos personalizados — ignorando el rol'
                        : `Usando permisos del rol "${ROLE_LABELS[form.role]}"`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (customPerms) {
                        setCustomPerms(null)
                      } else {
                        setCustomPerms([...ROLE_DEFAULT_PERMISSIONS[form.role]])
                      }
                    }}
                    className={`relative w-10 h-5 rounded-full transition-colors ${customPerms ? 'bg-[#2D3F52]' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${customPerms ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Folder access section */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-[9px] font-semibold tracking-widest uppercase text-gray-400">Acceso a carpetas de clientes</p>

                  {folderPermsLoading ? (
                    <p className="text-xs text-gray-400">Cargando...</p>
                  ) : (
                    <>
                      {/* See all toggle */}
                      <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                        <div>
                          <p className="text-xs font-semibold text-gray-700">Ver todas las carpetas</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Sin restricción de asesor</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSeeAllFolders(v => !v)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${seeAllFolders ? 'bg-[#16A34A]' : 'bg-gray-200'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${seeAllFolders ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </label>

                      {/* Per-folder checkboxes */}
                      {!seeAllFolders && (
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {advisorFolders.length === 0 ? (
                            <p className="text-xs text-gray-400 px-2">No hay carpetas de asesores en la base de datos.</p>
                          ) : (
                            advisorFolders.map((folder) => {
                              const checked = allowedFolders.includes(folder)
                              return (
                                <label key={folder} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setAllowedFolders(prev =>
                                      checked ? prev.filter(f => f !== folder) : [...prev, folder]
                                    )}
                                    className="w-3.5 h-3.5 rounded accent-[#2D3F52]"
                                  />
                                  <span className="text-xs text-gray-700">Clientes/<strong>{folder}</strong></span>
                                </label>
                              )
                            })
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {customPerms && (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-[9px] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">{group.label}</p>
                        <div className="space-y-1">
                          {group.items.map(({ key, label }) => {
                            const checked = customPerms.includes(key)
                            return (
                              <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setCustomPerms((prev) =>
                                      prev
                                        ? checked
                                          ? prev.filter((p) => p !== key)
                                          : [...prev, key]
                                        : [key]
                                    )
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-[#2D3F52]"
                                />
                                <span className="text-xs text-gray-700">{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <div className="mt-3"><ErrorMsg msg={error} /></div>}
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={closeModal} className={BTN_SECONDARY}>Cancelar</button>
              <button type="submit" disabled={loading} className={BTN_PRIMARY}>
                {loading ? 'Guardando...' : modal === 'create' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* RESET PASSWORD modal */}
      {modal === 'reset_password' && selectedUser && (
        <Modal title={`Resetear contraseña · ${selectedUser.name}`} onClose={closeModal}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm text-gray-500">
              Ingresá una nueva contraseña para <strong>{selectedUser.name}</strong>. El usuario deberá usarla en el próximo acceso.
            </p>
            <Field label="Nueva contraseña">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                placeholder="Mínimo 8 caracteres"
                className={INPUT_CLS}
              />
            </Field>
            {error && <ErrorMsg msg={error} />}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeModal} className={BTN_SECONDARY}>Cancelar</button>
              <button type="submit" disabled={loading || !newPassword} className={BTN_AMBER}>
                {loading ? 'Guardando...' : 'Resetear contraseña'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* DELETE modal */}
      {modal === 'delete' && selectedUser && (
        <Modal title="Eliminar usuario" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Estás por eliminar al usuario <strong>{selectedUser.name}</strong>. Esta acción no se puede deshacer.
            </p>
            <Field label={`Escribí "${selectedUser.name}" para confirmar`}>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoFocus
                placeholder={selectedUser.name}
                className={INPUT_CLS}
              />
            </Field>
            {error && <ErrorMsg msg={error} />}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeModal} className={BTN_SECONDARY}>Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={loading || deleteConfirm !== selectedUser.name}
                className={BTN_DANGER}
              >
                {loading ? 'Eliminando...' : 'Eliminar usuario'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-xl w-full overflow-hidden ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-xs text-red-700">{msg}</p>
    </div>
  )
}

const INPUT_CLS = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent bg-white'
const BTN_PRIMARY = 'flex-1 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-60'
const BTN_SECONDARY = 'px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors'
const BTN_AMBER = 'flex-1 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60'
const BTN_DANGER = 'flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60'

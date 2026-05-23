import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type UserRole = 'admin' | 'asesor' | 'asistente' | 'compliance' | 'direccion' | 'ceo'

export interface SessionUser {
  id: string
  name: string
  email: string | null
  role: UserRole
  permissions?: Permission[]       // custom per-user permissions; when set, overrides role
  allowed_folders?: string[] | null // null = ver todo; string[] = solo esas carpetas de asesor
}

const COOKIE = 'crm_session'
const EXPIRY = '12h'
export const SESSION_MAX_AGE = 12 * 60 * 60 // 12 horas en segundos

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set in .env.local')
  return new TextEncoder().encode(s)
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

/** Read current session from the request cookies (server components / API routes) */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null
  const user = await verifySession(token)
  if (!user) return null

  // Fetch custom permissions + folder access from DB
  try {
    const { data: userData } = await supabaseAdmin
      .from('crm_users')
      .select('permissions, see_all_folders')
      .eq('id', user.id)
      .maybeSingle()

    const extra: Partial<SessionUser> = {}

    if (userData?.permissions?.length) {
      extra.permissions = userData.permissions as Permission[]
    }

    // Admin always sees all — no folder restriction
    if (user.role === 'admin') {
      extra.allowed_folders = null
    } else if (userData?.see_all_folders) {
      extra.allowed_folders = null
    } else {
      // Load folder permissions for this user
      const { data: folderPerms } = await supabaseAdmin
        .from('user_client_folder_permissions')
        .select('folder_name')
        .eq('user_id', user.id)
        .eq('can_view', true)

      if (folderPerms && folderPerms.length > 0) {
        extra.allowed_folders = folderPerms.map((f: { folder_name: string }) => f.folder_name)
      } else {
        // No folders configured yet → no restriction (show all)
        extra.allowed_folders = null
      }
    }

    return { ...user, ...extra }
  } catch {
    return user
  }
}

export const SESSION_COOKIE = COOKIE

// ─── Role permissions ─────────────────────────────────────────────────────────

export type Permission =
  | 'panel' | 'tasks' | 'clients' | 'openings' | 'banco_central'
  | 'calendar' | 'deadlines' | 'ceo_dashboard' | 'kpis'
  | 'pagos' | 'impuestos' | 'liquidacion' | 'recursos' | 'claves'
  | 'admin' | 'sincronizacion' | 'suitability'

const ROLE_PERMISSIONS: Record<UserRole, Permission[] | ['*']> = {
  admin:      ['*'],
  ceo:        ['panel','clients','openings','tasks','banco_central','calendar','deadlines','ceo_dashboard','kpis','pagos','impuestos','liquidacion','recursos','suitability'],
  direccion:  ['panel','clients','openings','tasks','banco_central','calendar','deadlines','ceo_dashboard','kpis','liquidacion','recursos','suitability'],
  asesor:     ['panel','clients','openings','tasks','calendar','deadlines','recursos','suitability'],
  asistente:  ['panel','clients','openings','tasks','banco_central','calendar','deadlines','recursos'],
  compliance: ['panel','banco_central','calendar','deadlines','recursos','suitability'],
}

export function hasPermission(role: UserRole, permission: Permission, userPermissions?: Permission[]): boolean {
  // Custom per-user permissions override role defaults
  if (userPermissions && userPermissions.length > 0) {
    return userPermissions.includes(permission)
  }
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  if (perms[0] === '*') return true
  return (perms as Permission[]).includes(permission)
}

export function getPermissions(role: UserRole): Permission[] {
  const perms = ROLE_PERMISSIONS[role]
  if (perms[0] === '*') {
    return ['panel','clients','openings','tasks','banco_central','calendar','deadlines','ceo_dashboard','kpis','pagos','impuestos','liquidacion','recursos','admin','claves','sincronizacion','suitability']
  }
  return perms as Permission[]
}

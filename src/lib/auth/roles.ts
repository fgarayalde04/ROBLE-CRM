// Única fuente de verdad de roles y permisos — la usan el menú (cliente), las
// páginas y las APIs (servidor). Sin imports de servidor para poder usarla en
// componentes 'use client'.
//
// Regla: el rol decide QUÉ DATOS ve el usuario y QUÉ ACCIONES puede hacer;
// las pantallas son las mismas para todos.

export type UserRole = 'admin' | 'asesor' | 'asistente' | 'compliance' | 'direccion' | 'ceo'

export type Permission =
  | 'panel' | 'tasks' | 'clients' | 'openings' | 'banco_central'
  | 'calendar' | 'deadlines' | 'ceo_dashboard' | 'kpis'
  | 'pagos' | 'impuestos' | 'liquidacion' | 'recursos' | 'claves'
  | 'admin' | 'sincronizacion' | 'factsheet' | 'proposals' | 'orders' | 'fondos_monitor' | 'research'

export const ALL_PERMISSIONS: Permission[] = [
  'panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos',
  'ceo_dashboard','kpis','liquidacion','recursos','claves','admin','sincronizacion','factsheet',
  'proposals','orders','fondos_monitor','research',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:      ALL_PERMISSIONS,
  ceo:        ['panel','tasks','clients','openings','banco_central','calendar','deadlines','pagos','impuestos','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders','fondos_monitor','research'],
  direccion:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','ceo_dashboard','kpis','liquidacion','recursos','claves','factsheet','proposals','orders','fondos_monitor','research'],
  asesor:     ['panel','tasks','clients','openings','calendar','deadlines','recursos','factsheet','proposals','orders','fondos_monitor','research'],
  asistente:  ['panel','tasks','clients','openings','banco_central','calendar','deadlines','recursos','orders','fondos_monitor','research'],
  compliance: ['panel','banco_central','calendar','deadlines','recursos','research'],
}

/** Permisos efectivos: los personalizados del usuario (si tiene) reemplazan a los del rol. */
export function hasPermission(role: UserRole | string, permission: Permission, userPermissions?: Permission[]): boolean {
  if (userPermissions && userPermissions.length > 0) return userPermissions.includes(permission)
  return (ROLE_PERMISSIONS[role as UserRole] ?? []).includes(permission)
}

export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

/** Dirección/administración: configuración y vistas de toda la empresa. */
export const ADMIN_ROLES: string[] = ['admin', 'ceo', 'direccion']

/** Trading Desk: ven las órdenes de todos y operan sobre ellas. El resto ve y opera solo las propias. */
export const MESA_ROLES: string[] = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']

export const isAdminRole = (role?: string | null) => !!role && ADMIN_ROLES.includes(role)
export const isMesaRole  = (role?: string | null) => !!role && MESA_ROLES.includes(role)

// Única definición del menú lateral: la usan el Sidebar y la pestaña Permisos
// de Usuarios, así lo que se puede tildar es siempre exactamente lo que hay en
// el menú. Sin imports de servidor (se usa en componentes 'use client').
import { ROLE_PERMISSIONS, type Permission, type UserRole } from './roles'

export interface MenuItem {
  // Permiso que muestra este ítem. Único por ítem.
  key: Permission
  // Permiso "de fondo" que el ítem implica (lo usan páginas/APIs y los
  // defaults del rol). Solo cuando difiere de `key`.
  base?: Permission
  href: string
  label: string
  subtitle: string
  // Solo para este rol, aunque se tilde (p.ej. Usuarios: gestión de accesos).
  onlyRole?: UserRole
}

export interface MenuSection {
  label: string
  items: MenuItem[]
}

export const MENU: MenuSection[] = [
  {
    label: 'Acceso rápido',
    items: [
      { key: 'menu_solicitudes', base: 'orders', href: '/solicitudes', label: 'Solicitudes', subtitle: 'Enviar a Trading Desk' },
      { key: 'menu_blotter', base: 'orders', href: '/ordenes?tab=historial', label: 'Blotter', subtitle: 'Historial de órdenes' },
    ],
  },
  {
    label: 'Principal',
    items: [
      { key: 'panel', href: '/', label: 'Panel del día', subtitle: 'Resumen de actividad' },
      { key: 'tasks', href: '/tasks', label: 'Tareas', subtitle: 'Pendientes y seguimiento' },
    ],
  },
  {
    label: 'Operación',
    items: [
      { key: 'clients', href: '/clients', label: 'Clientes', subtitle: 'Gestión de clientes' },
      { key: 'banco_central', href: '/banco-central', label: 'Banco Central', subtitle: 'Legajos · Monitoreo · Scoring' },
    ],
  },
  {
    label: 'Inversiones',
    items: [
      { key: 'fondos_monitor', href: '/fondos-monitor', label: 'Monitor de Fondos', subtitle: 'Rendimientos por ISIN' },
      { key: 'factsheet', href: '/factsheet', label: 'Portafolio', subtitle: 'Posiciones y valor de cartera' },
      { key: 'proposals', href: '/propuestas', label: 'Propuestas', subtitle: 'Propuestas de inversión' },
      { key: 'menu_mas_operado', base: 'orders', href: '/mas-operado', label: 'Lo más operado', subtitle: 'Más comprado y vendido' },
      { key: 'menu_planillas', base: 'admin', href: '/admin/planillas', label: 'Planillas', subtitle: 'Herramientas especiales' },
    ],
  },
  {
    label: 'Agenda y Mail',
    items: [
      { key: 'calendar', href: '/events', label: 'Agenda', subtitle: 'Google Calendar y eventos' },
      { key: 'menu_mail', base: 'calendar', href: '/mail', label: 'Mail', subtitle: 'Gmail y comunicaciones' },
    ],
  },
  {
    label: 'Research',
    items: [
      { key: 'research', href: '/research', label: 'Research & Novedades', subtitle: 'Morning Brief y publicaciones' },
      { key: 'menu_plantillas', base: 'research', href: '/plantillas', label: 'Plantillas', subtitle: 'Fichas, análisis y comparativos' },
    ],
  },
  {
    label: 'Recursos',
    items: [
      { key: 'recursos', href: '/recursos', label: 'Biblioteca', subtitle: 'Documentos y recursos' },
      { key: 'claves', href: '/claves', label: 'Claves', subtitle: 'Bóveda de accesos' },
      { key: 'menu_mi_carpeta', base: 'panel', href: '/mi-carpeta', label: 'Mi carpeta', subtitle: 'Documentos en OneDrive' },
    ],
  },
  {
    label: 'Dirección',
    items: [
      { key: 'ceo_dashboard', href: '/ceo', label: 'Dashboard', subtitle: 'Métricas ejecutivas' },
      { key: 'kpis', href: '/kpis', label: 'KPIs', subtitle: 'Indicadores clave' },
      { key: 'liquidacion', href: '/liquidacion-brokers', label: 'Liquidación', subtitle: 'Brokers y comisiones' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { key: 'menu_usuarios', base: 'admin', href: '/admin/users', label: 'Usuarios', subtitle: 'Gestión de acceso', onlyRole: 'admin' },
      { key: 'sincronizacion', href: '/sincronizacion', label: 'Sincronización', subtitle: 'SharePoint y OneDrive' },
    ],
  },
]

export const MENU_ITEMS: MenuItem[] = MENU.flatMap(s => s.items)

// Permisos que no son un ítem del menú pero siguen existiendo (se muestran
// aparte en el editor).
export const OTHER_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'openings', label: 'Clientes nuevos / Aperturas' },
  { key: 'deadlines', label: 'Vencimientos' },
]

// Permisos personalizados guardados antes de que existieran las claves menu_*:
// ahí cada ítem se decide por su permiso de fondo.
const isLegacyCustom = (perms: Permission[]) => !perms.some(p => p.startsWith('menu_'))

/** ¿Este usuario ve el ítem en el menú (y puede entrar)? */
export function canSeeMenuItem(role: UserRole | string, item: MenuItem, userPermissions?: Permission[] | null): boolean {
  if (item.onlyRole && role !== item.onlyRole) return false
  if (userPermissions && userPermissions.length > 0) {
    return isLegacyCustom(userPermissions)
      ? userPermissions.includes(item.base ?? item.key)
      : userPermissions.includes(item.key)
  }
  return (ROLE_PERMISSIONS[role as UserRole] ?? []).includes(item.base ?? item.key)
}

export function canSeeMenuKey(role: UserRole | string, key: Permission, userPermissions?: Permission[] | null): boolean {
  const item = MENU_ITEMS.find(i => i.key === key)
  return !!item && canSeeMenuItem(role, item, userPermissions)
}

/** Lo que el editor muestra tildado: ítems visibles + otros permisos vigentes. */
export function checkedKeys(role: UserRole | string, userPermissions?: Permission[] | null): Permission[] {
  const effective = userPermissions && userPermissions.length > 0 ? userPermissions : (ROLE_PERMISSIONS[role as UserRole] ?? [])
  return [
    ...MENU_ITEMS.filter(i => canSeeMenuItem(role, i, userPermissions)).map(i => i.key),
    ...OTHER_PERMISSIONS.filter(o => effective.includes(o.key)).map(o => o.key),
  ]
}

/**
 * Lo que se guarda a partir de lo tildado: las claves de los ítems, los
 * permisos de fondo que implican (para páginas y APIs) y los otros permisos.
 * Los de fondo que no son de ningún ítem tildado (p.ej. pagos) se conservan
 * de los permisos vigentes.
 */
export function permissionsToSave(checked: Permission[], role: UserRole | string, previous?: Permission[] | null): Permission[] {
  const effective = previous && previous.length > 0 ? previous : (ROLE_PERMISSIONS[role as UserRole] ?? [])
  const menuKeys = new Set<Permission>(MENU_ITEMS.flatMap(i => [i.key, ...(i.base ? [i.base] : [])]))
  const out = new Set<Permission>(checked)
  for (const i of MENU_ITEMS) if (checked.includes(i.key) && i.base) out.add(i.base)
  for (const p of effective) {
    if (!menuKeys.has(p) && !OTHER_PERMISSIONS.some(o => o.key === p)) out.add(p)
  }
  return Array.from(out)
}

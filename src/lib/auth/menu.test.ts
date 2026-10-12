import { describe, expect, it } from 'vitest'
import { MENU_ITEMS, canSeeMenuItem, checkedKeys, permissionsToSave } from './menu'
import { ROLE_PERMISSIONS, hasPermission, type Permission, type UserRole } from './roles'

const ROLES = Object.keys(ROLE_PERMISSIONS) as UserRole[]
const visible = (role: UserRole, perms?: Permission[] | null) =>
  MENU_ITEMS.filter(i => canSeeMenuItem(role, i, perms)).map(i => i.label)

describe('menú y permisos', () => {
  it('con los permisos del rol, cada rol ve lo mismo que antes', () => {
    for (const role of ROLES) {
      const before = MENU_ITEMS.filter(i => hasPermission(role, i.base ?? i.key)).map(i => i.label)
      expect(visible(role)).toEqual(before)
    }
  })

  it('permisos personalizados viejos (sin menu_*) siguen valiendo por el permiso de fondo', () => {
    const legacy: Permission[] = ['panel', 'orders', 'calendar']
    expect(visible('asesor', legacy)).toEqual(['Solicitudes', 'Blotter', 'Panel del día', 'Lo más operado', 'Agenda', 'Mail', 'Mi carpeta'])
  })

  it('cada ítem se puede ocultar por separado', () => {
    const checked = checkedKeys('asesor', null).filter(k => k !== 'menu_blotter' && k !== 'menu_mail')
    const saved = permissionsToSave(checked, 'asesor', null)
    const v = visible('asesor', saved)
    expect(v).toContain('Solicitudes')
    expect(v).not.toContain('Blotter')
    expect(v).toContain('Agenda')
    expect(v).not.toContain('Mail')
    // El permiso de fondo de Solicitudes sigue para las APIs de órdenes.
    expect(saved).toContain('orders')
  })

  it('Planillas se puede habilitar a otro rol; Usuarios queda solo para admin', () => {
    const saved = permissionsToSave([...checkedKeys('asistente', null), 'menu_planillas', 'menu_usuarios'], 'asistente', null)
    expect(visible('asistente', saved)).toContain('Planillas')
    expect(visible('asistente', saved)).not.toContain('Usuarios')
  })

  it('al guardar conserva permisos de fondo que no son del menú (pagos, impuestos)', () => {
    expect(permissionsToSave(['panel'], 'ceo', null)).toEqual(expect.arrayContaining(['panel', 'pagos', 'impuestos']))
  })
})

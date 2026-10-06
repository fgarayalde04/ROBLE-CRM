import { pool } from './pool'

// Cierre del día de Órdenes (solicitudes): qué entró, qué se ejecutó, qué se
// rechazó/canceló en el día (hora de Montevideo) y qué quedó abierto al cierre.
// scope = null → todas las órdenes (admin/asistentes); si no, las del asesor.

export interface OrdenCierre {
  id: string
  solicitud_id: string | null
  estado: string
  tipo_operacion: string | null
  instrumento_nombre: string | null
  monto: number | null
  cantidad: number | null
  moneda: string | null
  client_name: string | null
  asesor: string | null
  asesor_user_id: string | null
  created_at: string
  ejecutado_at: string | null
  cancelado_at: string | null
  aprobacion_at: string | null
}

export interface CierreDia {
  fecha: string
  ingresadas: OrdenCierre[]
  ejecutadas: OrdenCierre[]
  rechazadas: OrdenCierre[]
  canceladas: OrdenCierre[]
  pendientes: OrdenCierre[]
}

export const ESTADOS_CERRADOS = ['ejecutada', 'cancelada', 'rechazada_cliente']
export const ESPERANDO_CLIENTE = ['mail_enviado']

const COLS = `
  s.id, s.solicitud_id, s.estado, s.tipo_operacion, s.instrumento_nombre, s.monto, s.cantidad, s.moneda,
  s.client_name, s.asesor, coalesce(s.asesor_id, u.id) as asesor_user_id,
  s.created_at, s.ejecutado_at, s.cancelado_at, s.aprobacion_at`

// Órdenes viejas sin asesor_id: se asocian al usuario por nombre.
const FROM = `from solicitudes s
  left join lateral (select id from crm_users where s.asesor_id is null and name = s.asesor limit 1) u on true`

/** Hoy en Montevideo, YYYY-MM-DD. */
export function hoyMontevideo(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
}

export async function getCierreDia(fecha: string, scope: { userId: string; userName: string } | null): Promise<CierreDia> {
  const desde = `${fecha}T00:00:00-03:00`
  const params: unknown[] = [desde]
  let scopeSql = ''
  if (scope) {
    params.push(scope.userId, scope.userName)
    scopeSql = `and (s.asesor_id = $2 or (s.asesor_id is null and s.asesor = $3))`
  }
  const enDia = (col: string) => `(${col} >= $1::timestamptz and ${col} < $1::timestamptz + interval '1 day')`

  const { rows } = await pool.query<OrdenCierre & { _ingresada: boolean; _abierta: boolean }>(
    `select ${COLS},
            ${enDia('s.created_at')} as _ingresada,
            (s.estado <> all($${params.length + 1}::text[]) and s.created_at < $1::timestamptz + interval '1 day') as _abierta
       ${FROM}
      where (
              ${enDia('s.created_at')} or ${enDia('s.ejecutado_at')} or ${enDia('s.cancelado_at')}
              or (s.estado = 'rechazada_cliente' and ${enDia('s.aprobacion_at')})
              or (s.estado <> all($${params.length + 1}::text[]) and s.created_at < $1::timestamptz + interval '1 day')
            )
            ${scopeSql}
      order by s.created_at desc`,
    [...params, ESTADOS_CERRADOS]
  )

  const enFecha = (v: string | null) => !!v && hoyMontevideo(new Date(v)) === fecha
  const strip = ({ _ingresada, _abierta, ...o }: OrdenCierre & { _ingresada: boolean; _abierta: boolean }) => o

  return {
    fecha,
    ingresadas: rows.filter((r) => r._ingresada).map(strip),
    ejecutadas: rows.filter((r) => r.estado === 'ejecutada' && enFecha(r.ejecutado_at)).map(strip),
    rechazadas: rows.filter((r) => r.estado === 'rechazada_cliente' && enFecha(r.aprobacion_at)).map(strip),
    canceladas: rows.filter((r) => r.estado === 'cancelada' && enFecha(r.cancelado_at)).map(strip),
    pendientes: rows.filter((r) => r._abierta).map(strip),
  }
}

/** Una línea para el push: "Hoy: 4 ingresadas · 3 ejecutadas. Quedan 2 abiertas (1 esperando al cliente)." */
export function resumenCierre(c: CierreDia): string | null {
  const partes = [
    c.ingresadas.length && `${c.ingresadas.length} ${c.ingresadas.length === 1 ? 'ingresada' : 'ingresadas'}`,
    c.ejecutadas.length && `${c.ejecutadas.length} ${c.ejecutadas.length === 1 ? 'ejecutada' : 'ejecutadas'}`,
    c.rechazadas.length && `${c.rechazadas.length} ${c.rechazadas.length === 1 ? 'rechazada por el cliente' : 'rechazadas por el cliente'}`,
    c.canceladas.length && `${c.canceladas.length} ${c.canceladas.length === 1 ? 'cancelada' : 'canceladas'}`,
  ].filter(Boolean) as string[]
  const esperando = c.pendientes.filter((p) => ESPERANDO_CLIENTE.includes(p.estado)).length
  if (partes.length === 0 && c.pendientes.length === 0) return null
  const hoy = partes.length ? `Hoy: ${partes.join(' · ')}.` : 'Hoy no hubo movimientos.'
  const abiertas = c.pendientes.length
    ? ` ${c.pendientes.length === 1 ? 'Queda 1 abierta' : `Quedan ${c.pendientes.length} abiertas`}${esperando ? ` (${esperando} esperando al cliente)` : ''}.`
    : ' No quedan órdenes abiertas.'
  return hoy + abiertas
}

import { describe, it, expect } from 'vitest'
import { resumenCierre, hoyMontevideo, type CierreDia, type OrdenCierre } from './db/cierreOrdenes'

const o = (estado: string): OrdenCierre => ({
  id: estado, solicitud_id: null, estado, tipo_operacion: 'compra', instrumento_nombre: null, monto: null,
  cantidad: null, moneda: null, client_name: null, asesor: null, asesor_user_id: null,
  created_at: '2026-10-01T12:00:00Z', ejecutado_at: null, cancelado_at: null, aprobacion_at: null,
})
const vacio: CierreDia = { fecha: '2026-10-01', ingresadas: [], ejecutadas: [], rechazadas: [], canceladas: [], pendientes: [] }

describe('resumenCierre', () => {
  it('sin nada no manda aviso', () => {
    expect(resumenCierre(vacio)).toBeNull()
  })
  it('arma la línea con lo del día y lo abierto', () => {
    expect(resumenCierre({
      ...vacio,
      ingresadas: [o('ejecutada'), o('mail_enviado')],
      ejecutadas: [o('ejecutada')],
      pendientes: [o('mail_enviado'), o('en_revision')],
    })).toBe('Hoy: 2 ingresadas · 1 ejecutada. Quedan 2 abiertas (1 esperando al cliente).')
  })
  it('solo abiertas de días anteriores', () => {
    expect(resumenCierre({ ...vacio, pendientes: [o('en_revision')] }))
      .toBe('Hoy no hubo movimientos. Queda 1 abierta.')
  })
})

describe('hoyMontevideo', () => {
  it('usa la hora de Uruguay (UTC-3)', () => {
    expect(hoyMontevideo(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
  })
})

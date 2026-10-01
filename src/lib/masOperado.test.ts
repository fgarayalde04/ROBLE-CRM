import { describe, it, expect } from 'vitest'
import { armarRanking, operacionesDeSolicitud } from './db/masOperado'
import { labelRango, mesParaInforme, moverPeriodo, periodoMes, periodoSemana } from './masOperado/periodos'

const fondo = (fondo: string, cusipIsin: string, operacion: 'compra' | 'venta', extra: Record<string, string> = {}) =>
  ({ type: 'fondos', fondo, cusipIsin, operacion, monto: '10000', moneda: 'USD', clase: 'Acumulativa', ...extra })

describe('operacionesDeSolicitud', () => {
  it('una operación por activo de la orden, sin montos', () => {
    const ops = operacionesDeSolicitud({
      tipo_operacion: 'compra', client_number: '123',
      assets_json: [
        fondo('PIMCO Income', 'IE00B87KCF77', 'compra'),
        { type: 'bonos', descripcion: 'Petrobras 2030', cusipIsin: 'US71647NBM02', operacion: 'venta', cantidad: '50000', cupon: '5,125%', maturity: '10/09/2030', moneda: 'USD' },
      ],
    })
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ clase: 'fondos', lado: 'compra', nombre: 'PIMCO Income', claseFondo: 'Acumulativa', cliente: '123' })
    expect(ops[1]).toMatchObject({ clase: 'bonos', lado: 'venta', cupon: '5,125%', vencimiento: '10/09/2030' })
  })
  it('sin activos usa el encabezado; rescate cuenta como venta', () => {
    const ops = operacionesDeSolicitud({ tipo_operacion: 'rescate', instrumento_tipo: 'fondos', instrumento_nombre: 'Fondo X', client_name: 'Ana' })
    expect(ops).toEqual([expect.objectContaining({ clase: 'fondos', lado: 'venta', nombre: 'Fondo X', cliente: 'Ana' })])
  })
  it('assets_json como texto', () => {
    expect(operacionesDeSolicitud({ assets_json: JSON.stringify([fondo('A', '', 'venta')]) })).toHaveLength(1)
  })
})

describe('armarRanking', () => {
  it('agrupa por ISIN, ordena por órdenes y cuenta clientes distintos', () => {
    const ops = [
      ...operacionesDeSolicitud({ client_number: '1', assets_json: [fondo('PIMCO Income E Acc', 'ie00b87kcf77', 'compra')] }),
      ...operacionesDeSolicitud({ client_number: '1', assets_json: [fondo('PIMCO Income', 'IE00B87KCF77', 'compra')] }),
      ...operacionesDeSolicitud({ client_number: '2', assets_json: [fondo('PIMCO Income', 'IE00B87KCF77', 'compra')] }),
      ...operacionesDeSolicitud({ client_number: '3', assets_json: [fondo('Otro', 'LU0000000001', 'compra'), fondo('Otro', 'LU0000000001', 'venta')] }),
    ]
    const r = armarRanking(ops, 10)
    expect(r.fondos.totales).toEqual({ compras: 4, ventas: 1 })
    expect(r.fondos.compras[0]).toMatchObject({ nombre: 'PIMCO Income', isin: 'IE00B87KCF77', operaciones: 3, clientes: 2 })
    expect(r.fondos.compras[1]).toMatchObject({ nombre: 'Otro', operaciones: 1 })
    expect(r.fondos.ventas).toHaveLength(1)
    expect(r.bonos.compras).toEqual([])
  })
  it('sin ISIN agrupa por nombre normalizado', () => {
    const ops = operacionesDeSolicitud({ assets_json: [fondo('Fondo Ñandú', '', 'compra'), fondo('fondo  ñandu', '', 'compra')] })
    expect(armarRanking(ops, 10).fondos.compras[0].operaciones).toBe(2)
  })
})

describe('periodos', () => {
  it('mes y semana (lunes a domingo)', () => {
    expect(periodoMes('2026-09-15')).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30', label: 'Septiembre 2026' })
    expect(periodoSemana('2026-10-01')).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-04' })
    expect(moverPeriodo(periodoMes('2026-01-10'), -1)).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
  })
  it('el informe del mes en la primera semana toma el mes anterior', () => {
    expect(mesParaInforme('2026-10-01').label).toBe('Septiembre 2026')
    expect(mesParaInforme('2026-10-20').label).toBe('Octubre 2026')
  })
  it('etiqueta de un rango', () => {
    expect(labelRango('2026-09-01', '2026-09-30')).toBe('Septiembre 2026')
    expect(labelRango('2026-09-03', '2026-09-10')).toBe('Del 03/09/2026 al 10/09/2026')
  })
})

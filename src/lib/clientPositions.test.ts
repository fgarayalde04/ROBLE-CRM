import { describe, it, expect } from 'vitest'
import { parseNumero, tipoDesdeProducto, itemsDeSolicitud } from './db/clientPositions'
import { calcularRiesgoCartera, compararConPerfil } from './riskGroups'

describe('parseNumero', () => {
  it('lee formatos de Excel y formularios', () => {
    expect(parseNumero(103260)).toBe(103260)
    expect(parseNumero('1,746,646.37')).toBe(1746646.37)
    expect(parseNumero('1.746.646,37')).toBe(1746646.37)
    expect(parseNumero('50000.5')).toBe(50000.5)
    expect(parseNumero('100,000')).toBe(100000)
    expect(parseNumero('$ 1,000')).toBe(1000)
    expect(parseNumero('-')).toBeNull()
    expect(parseNumero('')).toBeNull()
  })
})

describe('tipoDesdeProducto', () => {
  it('reconoce los tipos de los exports', () => {
    expect(tipoDesdeProducto('Corporate Fixed Income')).toBe('bono')
    expect(tipoDesdeProducto('Mutual Funds')).toBe('fondo')
    expect(tipoDesdeProducto('Cash, MMF and BDP')).toBe('cash')
    expect(tipoDesdeProducto('Equities')).toBe('accion')
    expect(tipoDesdeProducto('Exchange Traded Funds')).toBe('accion')
    expect(tipoDesdeProducto('', 'BANK DEPOSIT PROGRAM')).toBe('cash')
    expect(tipoDesdeProducto('')).toBeNull()
  })
})

describe('riesgo de la cartera', () => {
  it('promedio ponderado por monto, sin contar lo sin clasificar', () => {
    const r = calcularRiesgoCartera([
      { monto: 60000, puntaje: 3, grupo: 'rf_ig' },
      { monto: 40000, puntaje: 8, grupo: 'rv_especifica' },
      { monto: 10000, puntaje: null, grupo: null },
      { monto: 0, puntaje: 10, grupo: 'especulativo' },
    ])
    expect(r.puntaje).toBe(5)
    expect(r.perfil).toBe('moderado')
    expect(r.montoTotal).toBe(110000)
    expect(r.montoClasificado).toBe(100000)
    expect(r.composicion.map(c => c.grupo)).toEqual(['rf_ig', 'rv_especifica', 'sin_clasificar'])
  })
  it('compara contra el tope del perfil asignado', () => {
    expect(compararConPerfil('conservador', 3)).toBe('dentro')
    expect(compararConPerfil('conservador', 3.1)).toBe('excedido')
    expect(compararConPerfil('moderado_agresivo', 7)).toBe('dentro')
    expect(compararConPerfil(null, 5)).toBe('sin_perfil')
    expect(compararConPerfil('agresivo', null)).toBe('sin_posiciones')
  })
})

describe('activos de una solicitud', () => {
  it('lee los bloques del formulario y saltea los cancelados', () => {
    const items = itemsDeSolicitud({
      tipo_operacion: 'compra',
      assets_json: [
        { type: 'acciones', nombre: 'Apple', ticker: 'AAPL', cantidad: '100', cantidadTipo: 'acciones', operacion: 'compra' },
        { type: 'fondos', fondo: 'PIMCO Income', cusipIsin: 'IE00B7KFL990', monto: '50000', operacion: 'venta' },
        { type: 'bonos', descripcion: 'YPF 2029', cusipIsin: 'P989MJBY6', cantidad: 'TOTAL', operacion: 'venta' },
        { type: 'acciones', nombre: 'X', ticker: 'X', cantidad: '5', cantidadTipo: 'acciones', operacion: 'compra', cancelada: true },
      ],
    })
    expect(items.length).toBe(3)
    expect(items[0]).toEqual(expect.objectContaining({ tipo: 'accion', symbol: 'AAPL', cantidad: 100, operacion: 'compra' }))
    expect(items[1]).toEqual(expect.objectContaining({ tipo: 'fondo', ident: 'IE00B7KFL990', monto: 50000, operacion: 'venta' }))
    expect(items[2]).toEqual(expect.objectContaining({ tipo: 'bono', total: true, cantidad: null }))
  })
  it('solicitud sin bloques usa los campos generales', () => {
    const [it0] = itemsDeSolicitud({ tipo_operacion: 'venta', instrumento_tipo: 'bonos', instrumento_nombre: 'UST 2030', cusip_isin: '91282CAA9', cantidad: '10000' })
    expect(it0).toEqual(expect.objectContaining({ tipo: 'bono', operacion: 'venta', cantidad: 10000 }))
  })
})

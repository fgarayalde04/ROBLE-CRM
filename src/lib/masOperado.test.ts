import { describe, it, expect } from 'vitest'
import { armarRanking, familiaFondo, nombreFondoMostrado, nombreSinClase, operacionesDeSolicitud } from './db/masOperado'
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
    expect(r.fondos.compras[0]).toMatchObject({ nombre: 'PIMCO INCOME', isin: 'IE00B87KCF77', operaciones: 3, clientes: 2 })
    expect(r.fondos.compras[0].variantes).toHaveLength(1)
    expect(r.fondos.compras[1]).toMatchObject({ nombre: 'OTRO', operaciones: 1 })
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

describe('todo hasta hoy', () => {
  it('arranca antes de cualquier orden y no se mueve', async () => {
    const { periodoTodo, INICIO_HISTORICO } = await import('./masOperado/periodos')
    const p = periodoTodo('2026-10-01')
    expect(p).toMatchObject({ desde: INICIO_HISTORICO, hasta: '2026-10-01', label: 'Todo hasta hoy' })
    expect(moverPeriodo(p, -1)).toBe(p)
    expect(labelRango(INICIO_HISTORICO, '2026-10-01')).toBe('Hasta el 01/10/2026')
  })
})

describe('unir clases del mismo fondo', () => {
  it('saca la clase, la moneda y Acc/Dist del nombre', () => {
    expect(nombreSinClase('PIMCO GIS Income Fund E Acc USD')).toBe('PIMCO GIS Income Fund')
    expect(nombreSinClase('PIMCO GIS Income Fund Inst Acc')).toBe('PIMCO GIS Income Fund')
    expect(nombreSinClase('Jupiter Dynamic Bond I2 (USD Hedged) Dist')).toBe('Jupiter Dynamic Bond')
    expect(nombreSinClase('Fondo A')).toBe('Fondo A')
  })
  it('cuenta las clases como un solo fondo y guarda el detalle', () => {
    const ops = operacionesDeSolicitud({ client_number: '1', assets_json: [
      fondo('PIMCO GIS Income Fund E Acc USD', 'IE00B7KFL990', 'compra'),
      fondo('PIMCO GIS Income Fund E Acc USD', 'IE00B7KFL990', 'compra'),
      fondo('PIMCO GIS Income Fund Inst Acc', 'IE00B87KCF77', 'compra'),
      fondo('Otro Fondo Global', 'LU0000000001', 'compra'),
      fondo('Otro Fondo Global', 'LU0000000001', 'compra'),
    ] })
    const unidos = armarRanking(ops, 10).fondos.compras
    expect(unidos[0]).toMatchObject({ nombre: 'PIMCO GIS INCOME', operaciones: 3, isin: 'IE00B7KFL990' })
    expect(unidos[0].variantes).toHaveLength(2)
    expect(unidos[1]).toMatchObject({ nombre: 'OTRO FONDO GLOBAL', isin: 'LU0000000001' })
    expect(unidos[1].variantes).toHaveLength(1)
    expect(armarRanking(ops, 10, false).fondos.compras).toHaveLength(3)
  })
})

describe('nombres reales de las órdenes', () => {
  const mismo = (a: string, b: string) => expect(familiaFondo(a)).toBe(familiaFondo(b))
  it('corta desde CLASS / CL y saca paréntesis e ISIN', () => {
    expect(nombreSinClase('SOLITAIRE GLOBAL BOND FUND CLASS UO (USD) ISIN LI1228564368')).toBe('SOLITAIRE GLOBAL BOND FUND')
    expect(nombreSinClase('THORNBURG GLOBAL INVT PLC EQUITY INCOME BUILDER FD CL A USD')).toBe('THORNBURG GLOBAL INVT PLC EQUITY INCOME BUILDER')
    expect(nombreSinClase('NUVEEN WINSLOW SOCIALLY AWARE U.S. LARGE-CAP GROWTH FUND A (USD)')).toBe('NUVEEN WINSLOW SOCIALLY AWARE U.S. LARGE-CAP GROWTH FUND')
  })
  it('une clases, paraguas y abreviaturas del mismo fondo', () => {
    mismo('SOLITAIRE GLOBAL BOND FUND CLASS N (USD) ISIN LI1228564350', 'SOLITAIRE GLOBAL BOND FUND CLASS UO (USD) ISIN LI1228564368')
    mismo('ROBECO HIGH YIELD BONDS FUND CLASS D3H (USD)', 'ROBECO HIGH YIELD BONDS FUND CLASS MH (USD)')
    mismo('AB FCP I AMERICAN INCOME FUND CLASS I2 (USD)', 'AB AMERICAN INCOME FUND CLASS A (USD)')
    mismo('VONTOBEL EMERGING MARKETS CORP BOND FUND CLASS B1 (USD)', 'VONTOBEL EMERGING MARKETS CORPORATE BOND FUND CL U1 (USD)')
    mismo('PIMCO - INCOME', 'PIMCO INCOME FUND CLASS E (ACC)(USD)')
  })
  it('une variantes de escritura y de gestora', () => {
    mismo('NEUBERGER BERMAN GLOBAL PRIVATE EQUITY ACCESS FUND', 'NEUBERGER GLOBAL PRIVATE EQUITY ACCESS FUND CLASS LM (USD)')
    mismo('MFS MERIDIAN PRUDENT WEALTH FUND CLASS A1 (USD)', 'MFS PRUDENT WEALTH')
    mismo('JANUS HENDERSON BALANCED FUND CLASS A (ACC)(USD)', 'JANUS BALANCED')
    mismo('ROBECO GLOBAL CONSUMER TRENDS EQUITIES FUND', 'ROBECO GLOBAL CONSUMER TRENDS')
    mismo('AEGON HIGH YIELD GLOBAL BOND FUND CLASS D (ACC)(USD)', 'AEGON GLOBAL HIGH YIELD')
    mismo('PIMCO BALANCED INCOME AND GROWTH FUND CLASS E (ACC)(USD)', 'PIMCO BALANCED INCOME & GROWTH')
    mismo('PIMCO US SHORT TERM', 'PIMCO U.S. SHORT-TERM FUND')
    mismo('FRANKLIN USD SHORT-TERM MONEY MARKET', 'FRANKLIN U.S. DOLLAR SHORT-TERM MONEY MARKET FUND CLASS A (ACC)(USD)')
    mismo('NEUBERGER STRATEGIC INCOME MANDATO PPAL', 'NEUBERGER STRATEGIC INCOME FUND CLASS A (ACC)(USD)')
  })
  it('nombre en un solo formato', () => {
    expect(nombreFondoMostrado('Jupiter - Dynamic Bond Fund Class A (USD)')).toBe('JUPITER DYNAMIC BOND')
    expect(nombreFondoMostrado('PIMCO INCOME FUND CLASS E (ACC)(USD)')).toBe('PIMCO INCOME')
  })
  it('no une fondos distintos', () => {
    expect(familiaFondo('PIMCO INCOME FUND')).not.toBe(familiaFondo('PIMCO STRATEGIC INCOME FUND'))
    expect(familiaFondo('BGF EMERGING MARKETS BOND FUND')).not.toBe(familiaFondo('BGF EMERGING MARKETS CORPORATE BOND FUND'))
    expect(familiaFondo('MORGAN STANLEY GLOBAL BRANDS')).not.toBe(familiaFondo('MORGAN STANLEY GLOBAL OPPORTUNITY'))
    expect(familiaFondo('MAN GLG GLOBAL INVESTMENT GRADE OPPORTUNITIES FUND')).not.toBe(familiaFondo('MAN GLG HIGH YIELD OPPORTUNITIES FUND'))
    expect(familiaFondo('PIMCO INCOME FUND CLASS E (ACC)(USD)')).not.toBe(familiaFondo('PIMCO LOW DURATION INCOME FUND CLASS E (ACC)(USD)'))
    expect(familiaFondo('AB GLOBAL HIGH YIELD FUND CLASS A2 (USD)')).not.toBe(familiaFondo('AB SICAV I SHORT DURATION HIGH YIELD FUND CLASS A2'))
    expect(familiaFondo('JPMORGAN U.S. VALUE FUND CLASS A (ACC)(USD)')).not.toBe(familiaFondo('MFS MERIDIAN U.S. VALUE FUND CLASS A1 (USD)'))
  })
})

describe('igual que el Blotter', () => {
  it('no cuenta un activo cancelado suelto; sin nombre usa el ticker', () => {
    const ops = operacionesDeSolicitud({
      tipo_operacion: 'compra',
      assets_json: [
        { type: 'acciones', nombre: '', ticker: 'qubt', operacion: 'compra' },
        { type: 'acciones', nombre: 'Apple', ticker: 'AAPL', operacion: 'compra', cancelada: true },
      ],
    })
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ nombre: 'QUBT', ticker: 'qubt' })
  })
  it('una orden sin nombre igual cuenta', () => {
    expect(operacionesDeSolicitud({ tipo_operacion: 'venta', instrumento_tipo: 'acciones' })[0].nombre).toBe('SIN NOMBRE')
  })
  it('Thornburg: Investment y Equity Income Builder son el mismo fondo', () => {
    expect(familiaFondo('THORNBURG INVESTMENT INCOME BUILDER FUND CLASS I (USD)'))
      .toBe(familiaFondo('THORNBURG GLOBAL INVT PLC EQUITY INCOME BUILDER FD CL A USD'))
  })
})

describe('armado automático de fin de mes', () => {
  it('el día 1 arma el informe del mes anterior', async () => {
    const { mesDelInforme } = await import('./plantillas/autoMensual')
    expect(mesDelInforme('2026-10-01')).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30', label: 'Septiembre 2026' })
    expect(mesDelInforme('2027-01-01')).toMatchObject({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
})

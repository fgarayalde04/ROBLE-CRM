import { describe, it, expect } from 'vitest'
import { classifyInstrument, classifyText, ratingTier, perfilFromPuntaje } from './riskGroups'
import { categoriaDeCelda } from './fundMonitor/davinciScraper'

const fondo = (nombre: string, extra: Record<string, string> = {}) =>
  classifyInstrument({ tipo_activo: 'fondo', nombre, ...extra })

describe('perfiles', () => {
  it('conservador 1-3, moderado 4-6, agresivo 7-10', () => {
    expect(perfilFromPuntaje(3)).toBe('conservador')
    expect(perfilFromPuntaje(4)).toBe('moderado')
    expect(perfilFromPuntaje(6)).toBe('moderado')
    expect(perfilFromPuntaje(7)).toBe('agresivo')
  })
})

describe('fondos con categoría del Monitor', () => {
  const m = (cat: string, sub: string) =>
    fondo('X', { monitor_categoria: cat, monitor_subcategoria: sub }).grupo
  it('renta fija', () => {
    expect(m('RENTA FIJA', 'CORTO PLAZO')).toBe('liquidez')
    expect(m('RENTA FIJA', 'USA')).toBe('rf_ig')
    expect(m('RENTA FIJA', 'TASA FLOTANTE')).toBe('rf_ig')
    expect(m('RENTA FIJA', 'GLOBALES + MONEDAS')).toBe('rf_ar')
    expect(m('RENTA FIJA', 'Short duration High Yield')).toBe('rf_ar')
    expect(m('RENTA FIJA', 'ASIA')).toBe('rf_ar')
  })
  it('mixtos y alternativos', () => {
    expect(m('BALANCEADOS / MULTI-ASSET', '')).toBe('mixtos')
    expect(m('BALANCEADOS / MULTI-ASSET', 'PRIVATE DEBT')).toBe('mixtos')
    expect(m('BALANCEADOS / MULTI-ASSET', 'PRIVATE EQUITY')).toBe('rv_especifica')
  })
  it('renta variable', () => {
    expect(m('RENTA VARIABLE', 'GLOBALES')).toBe('rv_desarrollada')
    expect(m('RENTA VARIABLE', 'Large Cap Value')).toBe('rv_desarrollada')
    expect(m('RENTA VARIABLE', 'Large Cap Growth')).toBe('rv_especifica')
    expect(m('RENTA VARIABLE', 'TEMATICOS')).toBe('rv_especifica')
    expect(m('RENTA VARIABLE', 'CHINA')).toBe('rv_especifica')
    expect(m('REAL ESTATE', '')).toBe('rv_desarrollada')
    expect(m('COMMODITIES', '')).toBe('rv_desarrollada')
  })
  it('money market siempre es liquidez', () => {
    expect(fondo('FTIF-USD S/T MM-A ACC USD', { monitor_categoria: 'RENTA FIJA', monitor_subcategoria: 'CORTO PLAZO' }).grupo).toBe('liquidez')
  })
})

describe('fondos fuera del Monitor (por nombre)', () => {
  it('reconoce abreviaturas de Bloomberg y queda a revisar', () => {
    const r = fondo('JUPITER GBL HGH YLD BD-UAHSC')
    expect(r.grupo).toBe('rf_ar')
    expect(r.fuente).toBe('nombre')
    expect(r.revisar).toBe(true)
    expect(fondo('BLACKROCK GL-EMK COR BD-A2US').grupo).toBe('rf_ar')
    expect(fondo('MFS MER-US CORP BD-A1 USD').grupo).toBe('rf_ig')
    expect(fondo('JPM US TECHNOLOGY A USD').grupo).toBe('rv_especifica')
    expect(fondo('BLACKSTONE PRIVATE CREDIT FUND').grupo).toBe('mixtos')
  })
  it('usa la categoría cargada antes que el nombre', () => {
    const r = fondo('ALGO RARO FUND', { categoria: 'Renta Fija Global' })
    expect(r.grupo).toBe('rf_ig')
    expect(r.fuente).toBe('categoria')
  })
  it('sin pistas → sin clasificar, a revisar', () => {
    const r = fondo('XYZ SICAV A1')
    expect(r.grupo).toBeNull()
    expect(r.revisar).toBe(true)
  })
})

describe('bonos', () => {
  it('toma el rating más bajo', () => {
    expect(ratingTier('BBB+/Baa1')).toBe('ig')
    expect(ratingTier('BB+ / B1')).toBe('hy')
    expect(ratingTier('BBB- / Ba1')).toBe('hy')
    expect(ratingTier('Caa2')).toBe('ccc')
    expect(ratingTier('SD')).toBe('default')
    expect(ratingTier('NR')).toBeNull()
  })
  it('grupos por rating', () => {
    const b = (nombre: string, rating?: string, isin?: string) =>
      classifyInstrument({ tipo_activo: 'bono', nombre, rating, isin }).grupo
    expect(b('URUGUAY 5.1 2050', 'BBB+')).toBe('rf_ig')
    expect(b('PEMEX 6.7 2032', 'BB+')).toBe('rf_ar')
    expect(b('YPF 8.5 2029', 'CCC+')).toBe('rv_especifica')
    expect(b('BANCO X AT1 PERP', 'BBB-')).toBe('rf_ar')
    expect(b('US TREASURY N/B 4 2030')).toBe('rf_ig')
    expect(b('ARGENT 4.125 2035', undefined, 'US040114HT09')).toBe('rv_especifica')
    expect(b('ALGUN CORP 5 2031')).toBeNull()
  })
})

describe('acciones', () => {
  const a = (nombre: string, isin?: string) => classifyInstrument({ tipo_activo: 'accion', nombre, isin })
  it('por país del ISIN', () => {
    expect(a('APPLE INC', 'US0378331005').grupo).toBe('rv_desarrollada')
    expect(a('PETROBRAS', 'BRPETRACNPR6').grupo).toBe('rv_especifica')
    expect(a('SIN ISIN').revisar).toBe(true)
  })
  it('ETFs por nombre', () => {
    expect(a('PROSHARES ULTRAPRO QQQ', 'US74347X8314').grupo).toBe('especulativo')
    expect(a('ISHARES CORE US AGGREGATE BOND ETF', 'US4642872265').grupo).toBe('rf_ig')
  })
})

describe('classifyText', () => {
  it('no confunde un fondo de acciones "income" con renta fija', () => {
    expect(classifyText('Global Equity Income')).toBe('rv_desarrollada')
  })
})

describe('categoría Morningstar de Davinci', () => {
  it('se extrae de la celda', () => {
    expect(categoriaDeCelda('Robeco High Yield Bonds DH USD★★★ EAA Fund Global High Yield Bond')).toBe('EAA Fund Global High Yield Bond')
    expect(categoriaDeCelda('Fondo Nuevo X Acc EAA Fund USD Moderate Allocation📄')).toBe('EAA Fund USD Moderate Allocation')
    expect(categoriaDeCelda('Oaktree Strategic Credit IDV📄')).toBeNull()
  })
  it('clasifica las categorías típicas', () => {
    expect(classifyText('EAA Fund Global High Yield Bond')).toBe('rf_ar')
    expect(classifyText('EAA Fund USD Corporate Bond')).toBe('rf_ig')
    expect(classifyText('EAA Fund Money Market - USD')).toBe('liquidez')
    expect(classifyText('EAA Fund USD Moderate Allocation')).toBe('mixtos')
    expect(classifyText('EAA Fund Alt - Long/Short Equity')).toBe('mixtos')
    expect(classifyText('EAA Fund US Large-Cap Growth Equity')).toBe('rv_especifica')
    expect(classifyText('EAA Fund Global Large-Cap Blend Equity')).toBe('rv_desarrollada')
    expect(classifyText('EAA Fund Global Emerging Markets Equity')).toBe('rv_especifica')
    expect(classifyText('EAA Fund Sector Equity Technology')).toBe('rv_especifica')
    expect(classifyText('EAA Fund Property - Indirect Global')).toBe('rv_desarrollada')
    expect(classifyText('EAA Fund Convertible Bond - Global')).toBe('rf_ar')
  })
})

import { describe, it, expect } from 'vitest'
import { parseIncomingCash, parseDescription, IncomingCashError } from './parse'
import { summarize, calendarWarnings, nextPaymentLabel, notesText, bondSubline, maturityLabel, payDatesLabel } from './calc'
import type { CouponCalendar } from './types'

// Mismos pagos que el Incoming Cash de la prueba de aceptación (cuenta y nombre
// reemplazados), con las filas de subtotales y vacías intercaladas.
const AS_OF = '2026-10-02'
const BONDS: [string, string, number, number][] = [
  ['61747YEV3', 'MORGAN STANLEY SR NT FIXED/FLTG VARIABL 10/18/28 B/E DTD 10/18/22 CLB     CLB 10/18/27 @100.000', 2990.6, 95000],
  ['46647PDW3', 'JPMORGAN CHASE & CO SR NT FIXED TO FLTG RATE VARIABL 10/22/27 B/E DTD 10/23/23 CLB   CLB 10/22/26 @100.000', 3035, 100000],
  ['95000U3G6', 'WELLS FARGO & CO MEDIUM TERM SR NTS VARIABL 10/23/29 B/E DTD 10/23/23 CLB     CLB 10/23/28 @100.000', 3939.38, 125000],
  ['06738ECG8', 'BARCLAYS PLC ISIN#US06738ECG89  6.224% 05/09/34 B/E DTD 05/09/23     N/C', 6224, 200000],
  ['06051GLC1', 'BANK AMER CORP SR NT FIXED/FLTG VARIABL 11/10/28 B/E DTD 11/10/22 CLB     CLB 11/10/27 @100.000', 3102, 100000],
  ['404280BL2', 'HSBC HOLDINGS PLC ISIN#US404280BL25  6.000% B/E DTD 05/22/17 CLB     CLB 05/22/27 @100.000', 6000, 200000],
  ['17327CAR4', 'CITIGROUP INC VARIABL 05/25/34 B/E DTD 05/25/23 CLB       CLB 05/25/33 @100.000', 3087, 100000],
]
const DATES = [
  ['2026-10-18', '2027-04-18'], ['2026-10-22', '2027-04-22'], ['2026-10-23', '2027-04-23'],
  ['2026-11-09', '2027-05-09'], ['2026-11-10', '2027-05-10'], ['2026-11-22', '2027-05-22'], ['2026-11-25', '2027-05-25'],
]

function grid(extra: unknown[][] = []): unknown[][] {
  const rows: unknown[][] = [
    ['Account #                  :', 'TEST001'],
    ['Account Short Name:', 'CLIENTE'],
    ['Base CCY:', 'USD'],
    [],
    ['PAY DATE', 'DISTRIBUTION TYPE', 'CUSIP', 'SECURITY DESCRIPTION', 'PROJECTED CASH\n(BASE CCY)', 'PROJECTED REINVESTED CASH\n(BASE CCY)', 'AS OF DATE', 'QUANTITY'],
  ]
  const pays = BONDS.flatMap(([cusip, desc, amt, qty], i) => DATES[i].map((d) => ({ d, cusip, desc, amt, qty })))
  pays.sort((a, b) => a.d.localeCompare(b.d))
  for (const p of pays) {
    rows.push([new Date(`${p.d}T00:00:00Z`), 'BOND INT', p.cusip, p.desc, p.amt, 0, new Date(`${AS_OF}T00:00:00Z`), p.qty])
    rows.push([null, null, null, 'Sub-total:', p.amt, 0])
    rows.push([null, null, null, null, ''])
  }
  rows.push(...extra)
  rows.push([null, null, null, 'Account Total:', 56755.96, null])
  return rows
}

const calendar = (g = grid()): CouponCalendar => ({ ...parseIncomingCash(g), clientName: 'CLIENTE', advisor: 'Asesor', docDate: '2026-10-05' })

describe('Calendario de Cupones — prueba de aceptación', () => {
  it('da 7 bonos, nominal 920.000, renta 56.755,96 y rendimiento 6,17%', () => {
    const cal = calendar()
    const s = summarize(cal)
    expect(cal.bonds).toHaveLength(7)
    expect(s.nominal).toBe(920000)
    expect(s.annual).toBeCloseTo(56755.96, 2)
    expect((s.currentYield * 100).toFixed(2)).toBe('6.17')
    expect(s.monthTotals[3]).toBeCloseTo(9964.98, 2) // abril
    expect(s.monthTotals[9]).toBeCloseTo(9964.98, 2) // octubre
    expect(s.monthTotals[4]).toBeCloseTo(18413, 2) // mayo
    expect(s.monthTotals[10]).toBeCloseTo(18413, 2) // noviembre
    expect(s.monthsWithPayment).toBe(4)
    expect(nextPaymentLabel(s.next)).toBe('18 Oct 2026 · Morgan Stanley · USD 2.990,60')
  })

  it('ordena por mes y día del primer pago del año y arma las columnas como el ejemplo', () => {
    const cal = calendar()
    expect(cal.bonds.map((b) => b.issuer)).toEqual([
      'MORGAN STANLEY', 'JPMORGAN CHASE & CO', 'WELLS FARGO & CO', 'BARCLAYS PLC', 'BANK OF AMERICA CORP', 'HSBC HOLDINGS PLC', 'CITIGROUP INC',
    ])
    const [ms, , wf, barclays, , hsbc] = cal.bonds
    expect(bondSubline(ms)).toBe('CUSIP 61747YEV3 · FIJA/FLOT. 10/18/28 · CLB 10/18/27')
    expect(bondSubline(barclays)).toBe('ISIN US06738ECG89 · 6.224% 05/09/34 · N/C')
    expect(bondSubline(hsbc)).toBe('ISIN US404280BL25 · 6.000% PERPETUO · CLB 05/22/27')
    expect(maturityLabel(ms)).toBe('2028 / Oct / 18')
    expect(maturityLabel(hsbc)).toBe('Perpetuo')
    expect(payDatesLabel(ms)).toBe('18 Abr · 18 Oct')
    expect(payDatesLabel(barclays)).toBe('09 May · 09 Nov')
    expect(wf.couponRate).toBeCloseTo(0.06303008, 8)
  })

  it('valida contra el Account Total y avisa del call de JPMorgan dentro de 12 meses', () => {
    const w = calendarWarnings(calendar())
    expect(w.find((x) => x.level === 'ok')?.text).toMatch(/coincide/)
    expect(w.filter((x) => x.level === 'error')).toHaveLength(0)
    expect(w.some((x) => x.text.startsWith('JPMORGAN CHASE & CO: tiene call'))).toBe(true)
  })

  it('notas con los callables ordenados por fecha y la fuente', () => {
    const n = notesText({ ...calendar(), accountNumber: 'ROJ901495' })
    expect(n).toContain('(JPMorgan callable desde 10/22/26; HSBC desde 05/22/27; Morgan Stanley desde 10/18/27; Bank of America desde 11/10/27; Wells Fargo desde 10/23/28; Citigroup desde 05/25/33)')
    expect(n).toContain('Fuente: Projected Cash Flow, cuenta ROJ901495, al 02/10/2026.')
  })
})

describe('Calendario de Cupones — casos borde', () => {
  it('saca otros tipos de la grilla y los avisa', () => {
    const cal = calendar(grid([[new Date('2026-12-01T00:00:00Z'), 'DIVIDEND', '123456789', 'ACME CORP COM', 50, 0, new Date(`${AS_OF}T00:00:00Z`), 100]]))
    expect(cal.bonds).toHaveLength(7)
    expect(cal.others).toHaveLength(1)
    expect(calendarWarnings(cal)[0].text).toMatch(/DIVIDEND/)
  })

  it('un solo pago pide confirmar la frecuencia', () => {
    const g = grid().filter((r) => !(r[2] === '17327CAR4' && String((r[0] as Date)?.toISOString?.()).startsWith('2027')))
    const cal = calendar(g)
    const citi = cal.bonds.find((b) => b.cusip === '17327CAR4')!
    expect(citi.needsFrequency).toBe(true)
    expect(citi.payMonths).toEqual([5, 11])
    expect(calendarWarnings(cal).some((w) => w.level === 'error' && /Confirmá la frecuencia/.test(w.text))).toBe(true)
  })

  it('rechaza archivos sin la estructura esperada', () => {
    expect(() => parseIncomingCash([['Nombre', 'Apellido'], ['a', 'b']])).toThrow(IncomingCashError)
  })

  it('emisor, vencimiento y call de otras descripciones', () => {
    const pae = parseDescription('PAN AMERICAN ENERGY LLC REG S BOND ISIN#USE7S78BAC65  8.500% 04/30/32 REG DTD 04/30/24   N/C')
    expect(pae).toMatchObject({ issuer: 'PAN AMERICAN ENERGY LLC', isin: 'USE7S78BAC65', rate: 0.085, maturity: '2032-04-30', nonCallable: true })
    const jef = parseDescription('JEFFERIES FINL GROUP INC SR NT  6.200% 04/14/34 B/E DTD 04/16/24 CLB     CLB 01/14/34 @100.000')
    expect(jef).toMatchObject({ issuer: 'JEFFERIES FINANCIAL GROUP INC', maturity: '2034-04-14', callDate: '2034-01-14', fixedFloat: false })
  })
})

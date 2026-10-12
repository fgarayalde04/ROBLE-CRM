import { describe, expect, it } from 'vitest'
import { parsePershingTradeText } from '@/lib/portfolio/activityParser'
import { reconcile } from './reconcile'
import type { OpenPosition } from './types'
import type { PershingUnrealizedRow } from './pershingUnrealizedParser'

const pershingRow = (over: Partial<PershingUnrealizedRow>): PershingUnrealizedRow => ({
  cusip: '111', description: 'ACME CORP', quantity: 30, originalTotalCost: 3000, marketValue: 4500,
  unitCost: 100, assetCategory: 'Common Stocks', tradeDate: null,
  lots: [
    { quantity: 10, unitCost: 90, tradeDate: '2025-01-10' },
    { quantity: 20, unitCost: 105, tradeDate: '2026-03-05' },
  ],
  ...over,
})

const open: OpenPosition = {
  id: '1', analyst: 'INDIO', ticker: 'ACME', cusip: '111', description: 'ACME CORP', source: 'pershing',
  lots: [{ quantity: 10, unitCost: 90, tradeDate: '2025-01-10' }], lastPrice: 140,
}

describe('reconcile trade date / last price', () => {
  it('compra nueva de Pershing entra con su fecha real y el last price', () => {
    const plan = reconcile([open], [pershingRow({})], [], [], [])
    const lots = plan.changes.filter(c => c.kind === 'new_lot')
    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({ newLot: { quantity: 20, tradeDate: '2026-03-05', unitCost: 105 }, newLastPrice: 150 })
  })

  it('ticker nuevo trae todos los lotes con fecha y last price', () => {
    const plan = reconcile([], [pershingRow({})], [], [], [])
    expect(plan.pendingQuestions[0]).toMatchObject({ type: 'assign_analyst', lastPrice: 150 })
    expect((plan.pendingQuestions[0] as any).lots).toHaveLength(2)
  })

  it('Morgan nuevo: costo real del Holdings y fecha de la compra en el Activity', () => {
    const pos: any = { symbol: 'XYZ', name: 'XYZ INC', securityType: 'Stocks / Options', quantity: 5, price: 20, marketValue: 100, cusip: '222' }
    const activity: any = [{ tradeDate: '2026-08-12', settleDate: null, activityType: 'Bought', description: 'XYZ', symbol: 'XYZ', cusip: null, quantity: 5, price: 12, amount: -60 }]
    const plan = reconcile([], [], [pos], [], activity, [{ cusip: '222', costBasis: 60 } as any])
    expect(plan.pendingQuestions[0]).toMatchObject({ lastPrice: 20, unitCost: 12, tradeDate: '2026-08-12' })
  })
})

describe('compraventa dentro del período', () => {
  const act = (over: any) => ({ settleDate: null, cusip: null, price: null, description: 'NIKE INC CL B', symbol: 'NKE', ...over })
  const nkeActivity: any = [
    act({ tradeDate: '2026-09-02', activityType: 'Bought', quantity: 100, price: 70, amount: -7000 }),
    act({ tradeDate: '2026-09-20', activityType: 'Sold', quantity: -100, price: 80, amount: 8000 }),
  ]

  it('ticker comprado y vendido en el mes pregunta el analista con el cierre armado', () => {
    const plan = reconcile([], [], [], [], nkeActivity)
    expect(plan.pendingQuestions).toHaveLength(1)
    expect(plan.pendingQuestions[0]).toMatchObject({
      type: 'roundtrip_close', ticker: 'NKE', quantity: 100, costBasis: 7000, saleProceeds: 8000,
      openingDate: '2026-09-02', closingDate: '2026-09-20',
    })
  })

  it('no la vuelve a proponer si ya está en cerradas', () => {
    const closed: any = [{ ticker: 'NKE', closingDate: '09/20/2026', quantity: 100, year: 2026 }]
    const plan = reconcile([], [], [], [], nkeActivity, [], new Map(), closed)
    expect(plan.pendingQuestions).toHaveLength(0)
  })

  it('posición abierta que compró y vendió la misma cantidad registra el cierre sin tocarla', () => {
    const nke: OpenPosition = { id: '2', analyst: 'CHINO', ticker: 'NKE', cusip: null, description: 'NIKE INC CL B', source: 'morgan',
      lots: [{ quantity: 50, unitCost: 90, tradeDate: '2025-05-01' }], lastPrice: 75 }
    const pos: any = { symbol: 'NKE', name: 'NIKE', securityType: 'Stocks / Options', quantity: 50, price: 78, cusip: null }
    const plan = reconcile([nke], [], [pos], [], nkeActivity)
    expect(plan.changes.find(c => c.kind === 'roundtrip_closed')).toMatchObject({ analyst: 'CHINO', quantity: 100, costBasis: 7000 })
    expect(plan.changes.some(c => c.kind === 'price_update')).toBe(true)
  })

  it('ignora fondos money market', () => {
    const mmf: any = [
      act({ symbol: 'DUTG', tradeDate: '2026-09-02', activityType: 'MONEY FUND PURCHASE', quantity: 10, amount: -10 }),
      act({ symbol: 'DUTG', tradeDate: '2026-09-03', activityType: 'MONEY FUND SALE', quantity: 10, amount: 10 }),
    ]
    expect(reconcile([], [], [], mmf, []).pendingQuestions).toHaveLength(0)
  })
})

describe('Activity de Pershing (cantidad y precio en el texto de ACTIVITY)', () => {
  // Así llegan del parser las filas de Pershing: sin columna de cantidad.
  const pershing = (date: string, text: string, amount: number, symbol = 'NKE'): any => ({
    tradeDate: date, settleDate: null, activityType: text, description: 'NIKE INC CL B SOLICITED ORDER',
    symbol, cusip: '654106103', quantity: null, price: null, amount,
  })

  it('lee cantidad y precio del texto', () => {
    expect(parsePershingTradeText('Sell -3000.00000 share(s) of NKE at 32.570000000')).toEqual({
      side: 'sell', quantity: -3000, price: 32.57, symbol: 'NKE', isShares: true,
    })
    expect(parsePershingTradeText('Buy 200000.00000 parValue of PEMX5677787 at 88.418000000')?.isShares).toBe(false)
    expect(parsePershingTradeText('CASH DIVIDEND RECEIVED')).toBeNull()
  })

  const withQty = (r: any) => {
    const t = parsePershingTradeText(r.activityType)!
    return { ...r, quantity: t.quantity, price: t.price }
  }

  it('compraventa de Pershing en el período pregunta chino/indio', () => {
    const rows = [
      withQty(pershing('2026-09-30', 'Buy 3000.00000 share(s) of NKE at 35.657019000', -107061.06)),
      withQty(pershing('2026-10-02', 'Sell -3000.00000 share(s) of NKE at 32.570000000', 97617.98)),
    ]
    const plan = reconcile([], [], [], rows, [], [], new Map(), [], '2026-09-10')
    expect(plan.pendingQuestions).toHaveLength(1)
    expect(plan.pendingQuestions[0]).toMatchObject({
      type: 'roundtrip_close', ticker: 'NKE', quantity: 3000, costBasis: 107061.06, saleProceeds: 97617.98,
      openingDate: '2026-09-30', closingDate: '2026-10-02', source: 'pershing',
    })
  })

  it('ignora lo operado antes del período', () => {
    const rows = [
      withQty(pershing('2026-05-01', 'Buy 100.00000 share(s) of NKE at 70', -7000)),
      withQty(pershing('2026-05-20', 'Sell -100.00000 share(s) of NKE at 80', 8000)),
    ]
    expect(reconcile([], [], [], rows, [], [], new Map(), [], '2026-09-10').pendingQuestions).toHaveLength(0)
  })

  it('dos compraventas del mismo ticker en el período son dos cierres', () => {
    const rows = [
      withQty(pershing('2026-09-12', 'Buy 100.00000 share(s) of LUNR at 30', -3000, 'LUNR')),
      withQty(pershing('2026-09-15', 'Sell -100.00000 share(s) of LUNR at 33', 3300, 'LUNR')),
      withQty(pershing('2026-09-20', 'Buy 50.00000 share(s) of LUNR at 31', -1550, 'LUNR')),
      withQty(pershing('2026-09-25', 'Sell -50.00000 share(s) of LUNR at 35', 1750, 'LUNR')),
    ]
    const qs = reconcile([], [], [], rows, [], [], new Map(), [], '2026-09-10').pendingQuestions
    expect(qs.map(q => q.type === 'roundtrip_close' && [q.quantity, q.closingDate])).toEqual([[100, '2026-09-15'], [50, '2026-09-25']])
  })
})

describe('Unrealized de Pershing con Symbol (sin CUSIP)', () => {
  it('matchea por símbolo y completa lotes sin fecha', () => {
    const seeded: OpenPosition = { id: '9', analyst: 'INDIO', ticker: 'AMPX', cusip: null, description: 'AMPRIUS TECH', source: 'pershing',
      lots: [{ quantity: 4700, unitCost: 12.77, tradeDate: null }], lastPrice: 10 }
    const row = pershingRow({ cusip: '', symbol: 'AMPX', description: 'AMPRIUS TECHNOLOGIES INC COM', quantity: 4700, originalTotalCost: 60037.73, marketValue: 47533.45,
      lots: [{ quantity: 2270, unitCost: 13.33, tradeDate: '2025-10-16' }, { quantity: 2430, unitCost: 12.25, tradeDate: '2025-10-17' }] })
    const plan = reconcile([seeded], [row], [], [], [])
    expect(plan.pendingQuestions).toHaveLength(0)
    expect(plan.changes.find(c => c.kind === 'position_fix')).toMatchObject({ id: '9', newLots: row.lots })
    expect(plan.changes.find(c => c.kind === 'price_update')).toMatchObject({ ticker: 'AMPX', cusip: '' })
  })

  it('ticker nuevo usa el Symbol del archivo y toma ADRs', () => {
    const row = pershingRow({ cusip: '', symbol: 'WKEY', assetCategory: 'American Depository Receipt / Global Depository Receipt (Common)' })
    expect(reconcile([], [row], [], [], []).pendingQuestions[0]).toMatchObject({ type: 'assign_analyst', suggestedTicker: 'WKEY', cusip: null })
  })
})

import { describe, expect, it } from 'vitest'
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

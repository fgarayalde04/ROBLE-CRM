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

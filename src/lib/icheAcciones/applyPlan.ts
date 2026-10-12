import type { PositionsStore } from './db'
import type { ClosedPosition, GenerateRequest, PreviewRow } from './types'

/**
 * Aplica a la base un plan de reconciliación ya confirmado: primero los
 * cambios automáticos y después las respuestas del usuario. Compartido por
 * todas las planillas de acciones (Iche, Albojer) — cada una con su store.
 * Devuelve los avisos acumulados (los del plan + los que surjan acá).
 */
export async function applyPlan(store: PositionsStore, { plan, answers }: GenerateRequest): Promise<string[]> {
  const warnings = [...plan.warnings]

  const openBefore = await store.getOpenPositions()
  const findOpen = (ticker: string, analyst: string) => openBefore.find(p => p.ticker === ticker && p.analyst === analyst)

  // 1) Aplicar los cambios que no necesitaban pregunta.
  for (const change of plan.changes) {
    switch (change.kind) {
      case 'unchanged':
        break
      case 'position_fix': {
        await store.fixPosition(change.id, change.newTicker, change.newLots)
        const cached = openBefore.find(p => p.id === change.id)
        if (cached) {
          if (change.newTicker) cached.ticker = change.newTicker
          if (change.newLots) cached.lots = change.newLots
        }
        break
      }
      case 'price_update':
        await store.updateLastPrice(change.ticker, change.analyst, change.newLastPrice)
        if (change.cusip) await store.backfillCusip(change.ticker, change.analyst, change.cusip)
        break
      case 'new_lot':
        await store.addLotToPosition(change.ticker, change.analyst, change.newLot, change.newLastPrice)
        if (change.cusip) await store.backfillCusip(change.ticker, change.analyst, change.cusip)
        break
      case 'closed_matched': {
        const pos = findOpen(change.ticker, change.analyst)
        if (!pos) { warnings.push(`${change.ticker}: no se encontró la posición abierta al aplicar el cierre, se omitió.`); break }
        const openingDate = pos.lots.length === 1 ? (pos.lots[0].tradeDate ?? 'Multiple') : 'Multiple'
        const costBasis = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        await store.closePosition(change.ticker, change.analyst, Number(change.closingDate.slice(0, 4)), {
          openingDate,
          costBasis,
          closingDate: change.closingDate,
          quantity: change.quantity,
          saleProceeds: change.saleProceeds,
          description: pos.description,
        })
        break
      }
      case 'roundtrip_closed':
        await store.insertClosedPosition(change.ticker, change.analyst, Number(change.closingDate.slice(0, 4)), change)
        break
      case 'quantity_mismatch':
        // Ya quedó como warning — no se aplica ningún cambio automático.
        break
    }
  }

  // 2) Aplicar las respuestas del usuario a las preguntas pendientes.
  for (const q of plan.pendingQuestions) {
    const answer = answers[q.id]
    if (!answer) { warnings.push(`Pregunta "${q.id}" sin responder — se omitió.`); continue }

    if (q.type === 'assign_analyst') {
      const ticker = (answer.ticker ?? q.suggestedTicker).trim().toUpperCase()
      if (!answer.analyst) { warnings.push(`${ticker}: falta el analista (chino/indio) — se omitió.`); continue }
      await store.createOpenPosition({
        analyst: answer.analyst,
        ticker,
        cusip: q.cusip,
        description: q.description,
        lots: q.lots?.length ? q.lots : [{ quantity: q.quantity, unitCost: q.unitCost, tradeDate: q.tradeDate }],
        lastPrice: q.lastPrice ?? null,
        source: q.source,
      })
    } else if (q.type === 'unmatched_close') {
      if (answer.resolution === 'closed_with_details' && answer.closeDetails) {
        const pos = findOpen(q.ticker, q.analyst)
        if (!pos) { warnings.push(`${q.ticker}: no se encontró la posición al cerrar manualmente.`); continue }
        const openingDate = pos.lots.length === 1 ? (pos.lots[0].tradeDate ?? 'Multiple') : 'Multiple'
        const costBasis = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        await store.closePosition(q.ticker, q.analyst, Number(answer.closeDetails.closingDate.slice(0, 4)), {
          openingDate,
          costBasis,
          closingDate: answer.closeDetails.closingDate,
          quantity: answer.closeDetails.quantity,
          saleProceeds: answer.closeDetails.proceeds,
          description: q.description,
        })
      }
      // 'leave_as_is' -> no se toca, la posición sigue abierta tal cual.
    } else if (q.type === 'roundtrip_close') {
      if (answer.resolution === 'ignore') continue
      if (!answer.analyst) { warnings.push(`${q.ticker}: falta el analista de la compraventa — se omitió.`); continue }
      await store.insertClosedPosition(q.ticker, answer.analyst, Number(q.closingDate.slice(0, 4)), q)
    }
  }

  return warnings
}

// Cierres que entraron en esta corrida, para mostrarlos en el preview.
export function newClosesPreview({ plan, answers }: GenerateRequest, closedAfter: ClosedPosition[]): PreviewRow[] {
  const isNewClose = (c: { ticker: string; closingDate: string }) =>
    plan.changes.some(ch => (ch.kind === 'closed_matched' || ch.kind === 'roundtrip_closed') && ch.ticker === c.ticker && ch.closingDate === c.closingDate) ||
    plan.pendingQuestions.some(q =>
      (q.type === 'roundtrip_close' && q.ticker === c.ticker && q.closingDate === c.closingDate && !!answers[q.id]?.analyst && answers[q.id]?.resolution !== 'ignore') ||
      (q.type === 'unmatched_close' && q.ticker === c.ticker && answers[q.id]?.resolution === 'closed_with_details' && answers[q.id]?.closeDetails?.closingDate === c.closingDate)
    )
  return closedAfter.filter(isNewClose).map(c => ({
    ticker: c.ticker,
    description: c.description,
    quantity: c.quantity,
    originalTotalCost: c.costBasis,
    marketValue: c.saleProceeds,
    gainLoss: c.saleProceeds - c.costBasis,
    gainLossPct: c.costBasis !== 0 ? (c.saleProceeds - c.costBasis) / c.costBasis : 0,
  }))
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile } from '@/lib/microsoft/graph'
import { getIcheClientFolder } from '@/lib/icheAcciones/clientLookup'
import {
  addLotToPosition,
  backfillCusip,
  closePosition,
  createOpenPosition,
  getClosedPositions,
  getOpenPositions,
  logGeneration,
  updateLastPrice,
} from '@/lib/icheAcciones/db'
import { generateWorkbook } from '@/lib/icheAcciones/excelGenerator'
import { monthNameEs } from '@/lib/icheAcciones/monthNameEs'
import type { GenerateRequest, GenerateResponse } from '@/lib/icheAcciones/types'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = (await req.json()) as GenerateRequest
  const { plan, answers } = body
  const warnings = [...plan.warnings]

  const openBefore = await getOpenPositions()
  const findOpen = (ticker: string, analyst: string) => openBefore.find(p => p.ticker === ticker && p.analyst === analyst)

  // 1) Aplicar los cambios que no necesitaban pregunta.
  for (const change of plan.changes) {
    switch (change.kind) {
      case 'unchanged':
        break
      case 'price_update':
        await updateLastPrice(change.ticker, change.analyst, change.newLastPrice)
        if (change.cusip) await backfillCusip(change.ticker, change.analyst, change.cusip)
        break
      case 'new_lot':
        await addLotToPosition(change.ticker, change.analyst, change.newLot, change.newLastPrice)
        if (change.cusip) await backfillCusip(change.ticker, change.analyst, change.cusip)
        break
      case 'closed_matched': {
        const pos = findOpen(change.ticker, change.analyst)
        if (!pos) { warnings.push(`${change.ticker}: no se encontró la posición abierta al aplicar el cierre, se omitió.`); break }
        const openingDate = pos.lots.length === 1 ? (pos.lots[0].tradeDate ?? 'Multiple') : 'Multiple'
        const costBasis = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        await closePosition(change.ticker, change.analyst, Number(change.closingDate.slice(0, 4)), {
          openingDate,
          costBasis,
          closingDate: change.closingDate,
          quantity: change.quantity,
          saleProceeds: change.saleProceeds,
          description: pos.description,
        })
        break
      }
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
      await createOpenPosition({
        analyst: answer.analyst,
        ticker,
        cusip: q.cusip,
        description: q.description,
        lots: [{ quantity: q.quantity, unitCost: q.unitCost, tradeDate: q.tradeDate }],
        lastPrice: null,
        source: q.source,
      })
    } else if (q.type === 'unmatched_close') {
      if (answer.resolution === 'closed_with_details' && answer.closeDetails) {
        const pos = findOpen(q.ticker, q.analyst)
        if (!pos) { warnings.push(`${q.ticker}: no se encontró la posición al cerrar manualmente.`); continue }
        const openingDate = pos.lots.length === 1 ? (pos.lots[0].tradeDate ?? 'Multiple') : 'Multiple'
        const costBasis = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
        await closePosition(q.ticker, q.analyst, Number(answer.closeDetails.closingDate.slice(0, 4)), {
          openingDate,
          costBasis,
          closingDate: answer.closeDetails.closingDate,
          quantity: answer.closeDetails.quantity,
          saleProceeds: answer.closeDetails.proceeds,
          description: q.description,
        })
      }
      // 'leave_as_is' -> no se toca, la posición sigue abierta tal cual.
    }
  }

  // 3) Redibujar el workbook completo con el estado ya actualizado.
  const [openAfter, closedAfter] = await Promise.all([getOpenPositions(), getClosedPositions()])
  const { buffer, preview } = await generateWorkbook(openAfter, closedAfter)

  const fileName = `Iche Acciones ${monthNameEs(new Date())}.xlsx`

  let uploadedItem: GenerateResponse['uploadedItem'] = { id: '', webUrl: null }
  try {
    const clientFolder = await getIcheClientFolder()
    const token = await getGraphToken()
    const item = await uploadFile(
      clientFolder.driveId,
      clientFolder.itemId,
      fileName,
      buffer.buffer as ArrayBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      token
    )
    uploadedItem = { id: item.id, webUrl: item.webUrl ?? null }
  } catch (err: any) {
    warnings.push(`No se pudo subir el archivo a OneDrive: ${err.message}`)
  }

  const nuevosCierres = closedAfter
    .filter(c => plan.changes.some(ch => ch.kind === 'closed_matched' && ch.ticker === c.ticker))
    .map(c => ({
      ticker: c.ticker,
      description: c.description,
      quantity: c.quantity,
      originalTotalCost: c.costBasis,
      marketValue: c.saleProceeds,
      gainLoss: c.saleProceeds - c.costBasis,
      gainLossPct: c.costBasis !== 0 ? (c.saleProceeds - c.costBasis) / c.costBasis : 0,
    }))
  const fullPreview = { ...preview, nuevosCierres }

  // Se guarda el preview aunque falle la subida a OneDrive: los cambios en
  // la base ya se aplicaron, así que igual conviene poder verlo después.
  await logGeneration(fileName, uploadedItem, session.id ?? null, fullPreview, warnings)

  const response: GenerateResponse = {
    fileName,
    uploadedItem,
    fileBase64: buffer.toString('base64'),
    preview: fullPreview,
    warnings,
  }
  return NextResponse.json(response)
}

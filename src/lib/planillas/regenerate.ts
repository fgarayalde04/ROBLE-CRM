import { getGraphToken, uploadFile } from '@/lib/microsoft/graph'
import { getAlbojerClientFolder } from '@/lib/albojer/clientLookup'
import { albojerFileName, generateAlbojerWorkbook } from '@/lib/albojer/excelGenerator'
import { analystSummary } from '@/lib/icheAcciones/applyPlan'
import { getIcheClientFolder } from '@/lib/icheAcciones/clientLookup'
import { positionsStore, type PositionsBook } from '@/lib/icheAcciones/db'
import { generateWorkbook } from '@/lib/icheAcciones/excelGenerator'
import { monthNameEs } from '@/lib/icheAcciones/monthNameEs'

/**
 * Redibuja la planilla desde la base sin aplicar cambios (p.ej. después de
 * corregir un analista a mano), la sube a OneDrive y registra la corrida con
 * su preview y su Excel. Equivale a "Actualizar con los datos actuales".
 */
export async function regeneratePlanilla(book: PositionsBook, userId: string | null = null) {
  const store = positionsStore(book)
  const [open, closed] = await Promise.all([store.getOpenPositions(), store.getClosedPositions()])
  const now = new Date()
  const { buffer, preview } = book === 'iche' ? await generateWorkbook(open, closed) : await generateAlbojerWorkbook(open, closed)
  const fileName = book === 'iche' ? `Iche Acciones ${monthNameEs(now)}.xlsx` : albojerFileName(now)

  const warnings: string[] = []
  let uploadedItem = { id: '', webUrl: null as string | null }
  try {
    const folder = book === 'iche' ? await getIcheClientFolder() : await getAlbojerClientFolder()
    const item = await uploadFile(folder.driveId, folder.itemId, fileName, buffer.buffer as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', await getGraphToken())
    uploadedItem = { id: item.id, webUrl: item.webUrl ?? null }
  } catch (err: any) {
    warnings.push(`No se pudo subir el archivo a OneDrive: ${err.message}`)
  }

  const fullPreview = { ...preview, nuevosCierres: [], porAnalista: analystSummary(open, closed) }
  await store.logGeneration(fileName, uploadedItem, userId, fullPreview, warnings, buffer)
  return { book, fileName, uploaded: !!uploadedItem.id, webUrl: uploadedItem.webUrl, warnings }
}

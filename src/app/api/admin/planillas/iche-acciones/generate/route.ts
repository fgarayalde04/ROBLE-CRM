import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile } from '@/lib/microsoft/graph'
import { getIcheClientFolder } from '@/lib/icheAcciones/clientLookup'
import { analystSummary, applyPlan, newClosesPreview } from '@/lib/icheAcciones/applyPlan'
import { getClosedPositions, getOpenPositions, logGeneration, positionsStore } from '@/lib/icheAcciones/db'
import { generateWorkbook } from '@/lib/icheAcciones/excelGenerator'
import { monthNameEs } from '@/lib/icheAcciones/monthNameEs'
import type { GenerateRequest, GenerateResponse } from '@/lib/icheAcciones/types'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = (await req.json()) as GenerateRequest
  const warnings = await applyPlan(positionsStore('iche'), body)

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

  const nuevosCierres = newClosesPreview(body, closedAfter)
  const fullPreview = { ...preview, nuevosCierres, porAnalista: analystSummary(openAfter, closedAfter) }

  // Se guarda el preview aunque falle la subida a OneDrive: los cambios en
  // la base ya se aplicaron, así que igual conviene poder verlo después.
  await logGeneration(fileName, uploadedItem, session.id ?? null, fullPreview, warnings, buffer)

  const response: GenerateResponse = {
    fileName,
    uploadedItem,
    fileBase64: buffer.toString('base64'),
    preview: fullPreview,
    warnings,
  }
  return NextResponse.json(response)
}

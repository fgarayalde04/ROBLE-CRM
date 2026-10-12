import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile } from '@/lib/microsoft/graph'
import { getAlbojerClientFolder } from '@/lib/albojer/clientLookup'
import { albojerFileName, generateAlbojerWorkbook } from '@/lib/albojer/excelGenerator'
import { applyPlan, newClosesPreview } from '@/lib/icheAcciones/applyPlan'
import { positionsStore } from '@/lib/icheAcciones/db'
import type { GenerateRequest, GenerateResponse } from '@/lib/icheAcciones/types'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = (await req.json()) as GenerateRequest
  const store = positionsStore('albojer')
  const warnings = await applyPlan(store, body)

  const [openAfter, closedAfter] = await Promise.all([store.getOpenPositions(), store.getClosedPositions()])
  const { buffer, preview } = await generateAlbojerWorkbook(openAfter, closedAfter)
  const fileName = albojerFileName(new Date())

  let uploadedItem: GenerateResponse['uploadedItem'] = { id: '', webUrl: null }
  try {
    const folder = await getAlbojerClientFolder()
    const token = await getGraphToken()
    const item = await uploadFile(folder.driveId, folder.itemId, fileName, buffer.buffer as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', token)
    uploadedItem = { id: item.id, webUrl: item.webUrl ?? null }
  } catch (err: any) {
    warnings.push(`No se pudo subir el archivo a OneDrive: ${err.message}`)
  }

  const fullPreview = { ...preview, nuevosCierres: newClosesPreview(body, closedAfter) }
  await store.logGeneration(fileName, uploadedItem, session.id ?? null, fullPreview, warnings)

  const response: GenerateResponse = { fileName, uploadedItem, fileBase64: buffer.toString('base64'), preview: fullPreview, warnings }
  return NextResponse.json(response)
}

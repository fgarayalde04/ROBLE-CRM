import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createFolder, getGraphToken, listFolderChildren, uploadFile } from '@/lib/microsoft/graph'
import { parseActivityExcel } from '@/lib/portfolio/activityParser'
import { parseMorganHoldingsExcel } from '@/lib/portfolio/morganParser'
import { getIcheClientFolder } from '@/lib/icheAcciones/clientLookup'
import { getOpenPositions } from '@/lib/icheAcciones/db'
import { detectAll } from '@/lib/icheAcciones/detectFileKind'
import { parsePershingUnrealizedExcel } from '@/lib/icheAcciones/pershingUnrealizedParser'
import { reconcile } from '@/lib/icheAcciones/reconcile'
import type { ReconcileResponse } from '@/lib/icheAcciones/types'

const KIND_LABEL: Record<string, string> = {
  pershing_unrealized: 'Unrealized Gain/Loss de Pershing',
  pershing_activity: 'Activity de Pershing',
  morgan_holdings: 'Holdings de Morgan Stanley',
  morgan_activity: 'Activity de Morgan Stanley',
}

async function getOrCreateDatedFolder(driveId: string, parentId: string, token: string) {
  const dateStr = new Date().toISOString().slice(0, 10)
  const children = await listFolderChildren(driveId, parentId, token)
  const existing = children.find(c => c.name === dateStr && c.folder)
  if (existing) return existing
  return createFolder(driveId, parentId, dateStr, token)
}

async function getOrCreateInputFolder(driveId: string, rootItemId: string, token: string) {
  const children = await listFolderChildren(driveId, rootItemId, token)
  const existing = children.find(c => c.name === 'INPUT UNREALIZED' && c.folder)
  if (existing) return existing
  return createFolder(driveId, rootItemId, 'INPUT UNREALIZED', token)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const form = await req.formData()
  const fileEntries = form.getAll('files') as File[]
  if (fileEntries.length !== 4) {
    return NextResponse.json({ error: `Se esperaban 4 archivos, llegaron ${fileEntries.length}` }, { status: 400 })
  }

  const buffers = await Promise.all(fileEntries.map(f => f.arrayBuffer()))
  const files = fileEntries.map((f, i) => ({ fileName: f.name, buffer: buffers[i] }))

  const { results, missing, duplicated } = detectAll(files)
  if (missing.length > 0 || duplicated.length > 0) {
    const parts: string[] = []
    if (missing.length) parts.push(`Falta: ${missing.map(k => KIND_LABEL[k] ?? k).join(', ')}`)
    if (duplicated.length) parts.push(`Hay más de un archivo para: ${duplicated.map(k => KIND_LABEL[k] ?? k).join(', ')}`)
    return NextResponse.json({
      error: `No se pudieron identificar los 4 archivos correctamente. ${parts.join('. ')}. Detectado: ${results.map(r => `${r.fileName} → ${KIND_LABEL[r.kind] ?? 'desconocido'}`).join('; ')}`,
    }, { status: 400 })
  }

  const byKind = new Map(results.map((r, i) => [r.kind, files[i].buffer]))
  const pershingUnrealizedBuf = byKind.get('pershing_unrealized')!
  const pershingActivityBuf = byKind.get('pershing_activity')!
  const morganHoldingsBuf = byKind.get('morgan_holdings')!
  const morganActivityBuf = byKind.get('morgan_activity')!

  let clientFolder
  try {
    clientFolder = await getIcheClientFolder()
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  let inputsFolderInfo: ReconcileResponse['plan']['inputsFolder'] = null
  try {
    const token = await getGraphToken()
    const inputRoot = await getOrCreateInputFolder(clientFolder.driveId, clientFolder.itemId, token)
    const datedFolder = await getOrCreateDatedFolder(clientFolder.driveId, inputRoot.id, token)
    await Promise.all(
      results.map((r, i) =>
        uploadFile(
          clientFolder!.driveId,
          datedFolder.id,
          r.fileName,
          files[i].buffer,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          token
        )
      )
    )
    inputsFolderInfo = { driveItemId: datedFolder.id, webUrl: datedFolder.webUrl ?? null }
  } catch (err: any) {
    // Archivar los inputs es un respaldo, no bloqueante — si OneDrive falla acá
    // igual se puede seguir con la reconciliación.
    console.error('No se pudieron archivar los inputs en OneDrive:', err.message)
  }

  const pershingUnrealized = parsePershingUnrealizedExcel(pershingUnrealizedBuf)
  const pershingActivity = parseActivityExcel(pershingActivityBuf)
  const morganHoldings = parseMorganHoldingsExcel(morganHoldingsBuf)
  const morganActivity = parseActivityExcel(morganActivityBuf)

  const currentOpen = await getOpenPositions()

  const plan = reconcile(
    currentOpen,
    pershingUnrealized.rows,
    morganHoldings.portfolio.positions,
    pershingActivity.rows,
    morganActivity.rows
  )
  plan.inputsFolder = inputsFolderInfo
  plan.warnings.push(...pershingUnrealized.warnings, ...pershingActivity.warnings, ...morganHoldings.portfolio.warnings, ...morganActivity.warnings)

  const response: ReconcileResponse = { plan, needsInput: plan.pendingQuestions.length > 0 }
  return NextResponse.json(response)
}

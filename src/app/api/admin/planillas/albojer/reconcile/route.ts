import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createFolder, getGraphToken, listFolderChildren, uploadFile } from '@/lib/microsoft/graph'
import { parseActivityExcel } from '@/lib/portfolio/activityParser'
import { getAlbojerClientFolder } from '@/lib/albojer/clientLookup'
import { getCusipTickerMap, positionsStore } from '@/lib/icheAcciones/db'
import { detectAll } from '@/lib/icheAcciones/detectFileKind'
import { parsePershingUnrealizedExcel } from '@/lib/icheAcciones/pershingUnrealizedParser'
import { reconcile } from '@/lib/icheAcciones/reconcile'
import type { IcheFileKind, ReconcileResponse } from '@/lib/icheAcciones/types'

// Albojer opera solo en Pershing: alcanza con el Unrealized y el Activity.
const REQUIRED: IcheFileKind[] = ['pershing_unrealized', 'pershing_activity']

const KIND_LABEL: Record<string, string> = {
  pershing_unrealized: 'Unrealized Gain/Loss de Pershing',
  pershing_activity: 'Activity de Pershing',
}

async function getOrCreateChild(driveId: string, parentId: string, name: string, token: string) {
  const children = await listFolderChildren(driveId, parentId, token)
  return children.find(c => c.name === name && c.folder) ?? createFolder(driveId, parentId, name, token)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const form = await req.formData()
  const fileEntries = form.getAll('files') as File[]
  if (fileEntries.length !== REQUIRED.length) {
    return NextResponse.json({ error: `Se esperaban ${REQUIRED.length} archivos, llegaron ${fileEntries.length}` }, { status: 400 })
  }

  const buffers = await Promise.all(fileEntries.map(f => f.arrayBuffer()))
  const files = fileEntries.map((f, i) => ({ fileName: f.name, buffer: buffers[i] }))

  const { results, missing, duplicated } = detectAll(files, REQUIRED)
  if (missing.length > 0 || duplicated.length > 0) {
    const parts: string[] = []
    if (missing.length) parts.push(`Falta: ${missing.map(k => KIND_LABEL[k] ?? k).join(', ')}`)
    if (duplicated.length) parts.push(`Hay más de un archivo para: ${duplicated.map(k => KIND_LABEL[k] ?? k).join(', ')}`)
    return NextResponse.json({
      error: `No se pudieron identificar los archivos. ${parts.join('. ')}. Detectado: ${results.map(r => `${r.fileName} → ${KIND_LABEL[r.kind] ?? 'desconocido'}`).join('; ')}`,
    }, { status: 400 })
  }

  const byKind = new Map(results.map((r, i) => [r.kind, files[i].buffer]))

  // Archivar los inputs en OneDrive es un respaldo, no bloqueante.
  let inputsFolderInfo: ReconcileResponse['plan']['inputsFolder'] = null
  try {
    const folder = await getAlbojerClientFolder()
    const token = await getGraphToken()
    const inputRoot = await getOrCreateChild(folder.driveId, folder.itemId, 'INPUT ALBOJER', token)
    const dated = await getOrCreateChild(folder.driveId, inputRoot.id, new Date().toISOString().slice(0, 10), token)
    await Promise.all(results.map((r, i) =>
      uploadFile(folder.driveId, dated.id, r.fileName, files[i].buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', token)
    ))
    inputsFolderInfo = { driveItemId: dated.id, webUrl: dated.webUrl ?? null }
  } catch (err: any) {
    console.error('Albojer: no se pudieron archivar los inputs en OneDrive:', err.message)
  }

  const unrealized = parsePershingUnrealizedExcel(byKind.get('pershing_unrealized')!)
  const activity = parseActivityExcel(byKind.get('pershing_activity')!)

  const store = positionsStore('albojer')
  const [currentOpen, closedPositions, periodStart, knownTickers] = await Promise.all([
    store.getOpenPositions(),
    store.getClosedPositions(),
    store.getPeriodStart(),
    getCusipTickerMap().catch(() => new Map<string, string>()),
  ])

  const plan = reconcile(currentOpen, unrealized.rows, [], activity.rows, [], [], knownTickers, closedPositions, periodStart)
  plan.inputsFolder = inputsFolderInfo
  plan.warnings.push(...unrealized.warnings, ...activity.warnings)
  if (unrealized.accountNumber && unrealized.accountNumber !== 'ROJ900554') {
    plan.warnings.unshift(`Ojo: el Unrealized es de la cuenta ${unrealized.accountNumber}, no de ROJ900554 (Albojer).`)
  }

  const response: ReconcileResponse = { plan, needsInput: plan.pendingQuestions.length > 0 }
  return NextResponse.json(response)
}

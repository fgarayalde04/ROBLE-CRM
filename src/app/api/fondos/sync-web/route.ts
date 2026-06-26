import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile, createFolder } from '@/lib/microsoft/graph'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { scrapeDirectByISIN, BROWSER_SCRAPERS, genericSearch } from '@/lib/fondos/scrapers'
import { getBrowser, closeBrowser } from '@/lib/fondos/browser'

export const dynamic  = 'force-dynamic'
export const maxDuration = 300  // 5 min (Vercel Pro)

const DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''

// ── OneDrive helpers ──────────────────────────────────────────────────────────

const folderCache: Record<string, string> = {}

async function getOrCreateFolder(token: string, parentId: string, name: string) {
  const key = `${parentId}/${name}`
  if (folderCache[key]) return folderCache[key]
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const d = await res.json()
      const found = (d.value ?? []).find((i: any) => i.folder && i.name === name)
      if (found) { folderCache[key] = found.id; return found.id }
    }
  } catch { /* fallthrough */ }
  const f = await createFolder(DRIVE_ID, parentId, name, token)
  folderCache[key] = f.id
  return f.id
}

async function getFondosRoot(token: string) {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/Fondos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return (await res.json()).id
  } catch { /* fallthrough */ }
  const root = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()
  return (await createFolder(DRIVE_ID, root.id, 'Fondos', token)).id
}

async function uploadToOneDrive(
  token: string, rootId: string,
  managerName: string, filename: string, bytes: Buffer
): Promise<string | null> {
  try {
    const folderId = await getOrCreateFolder(token, rootId, managerName)
    const safe     = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
    const item     = await uploadFile(DRIVE_ID, folderId, safe, bytes.buffer as ArrayBuffer, 'application/pdf', token)
    return item.webUrl ?? null
  } catch { return null }
}

// ── Main handler ──────────────────────────────────────────────────────────────
// Accepts optional ?slug=xxx to process only one gestora, or ?limit=N to cap funds.

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const slugFilter = searchParams.get('slug')   // optional: process single gestora
  const limit      = parseInt(searchParams.get('limit') ?? '30')  // max funds per run

  // Load managers
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name')

  if (!managers?.length) {
    return NextResponse.json({ error: 'No hay gestoras. Ejecutá fondos_carga.sql en Supabase primero.' }, { status: 500 })
  }

  const managerMap = Object.fromEntries(managers.map(m => [m.slug, m]))

  // Load funds without current factsheet
  let fundQuery = supabaseAdmin
    .from('fondos')
    .select('id, isin, name, asset_manager_id')
    .not('isin', 'is', null)

  const { data: allFondos } = await fundQuery

  const { data: covered } = await supabaseAdmin
    .from('factsheets')
    .select('fondo_id')
    .eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))

  // Build work queue: [ { fondo, manager } ] excluding already-covered
  type WorkItem = { fondo: { id: string; isin: string; name: string }; manager: { id: string; slug: string; name: string } }
  const queue: WorkItem[] = []

  for (const f of allFondos ?? []) {
    if (coveredIds.has(f.id)) continue
    const mgr = managers.find(m => m.id === f.asset_manager_id)
    if (!mgr) continue
    if (slugFilter && mgr.slug !== slugFilter) continue
    queue.push({ fondo: { id: f.id, isin: f.isin!, name: f.name }, manager: mgr })
  }

  const batch = queue.slice(0, limit)

  // OneDrive setup
  let msToken: string | null = null
  let rootId:  string | null = null
  try {
    msToken = await getGraphToken()
    rootId  = await getFondosRoot(msToken)
  } catch { /* no OneDrive */ }

  // Browser setup (lazy, shared across batch)
  let browserOpened = false

  const results: { isin: string; fund: string; manager: string; status: 'ok' | 'skip' | 'fail'; source?: string; error?: string }[] = []
  let totalImported = 0

  for (const { fondo, manager } of batch) {
    const { isin, id: fondoId, name: fundName } = fondo
    const { id: managerId, slug, name: managerName } = manager

    // ── Step 1: Try direct URL pattern ──────────────────────────────────────
    let scrapeResult = await scrapeDirectByISIN(slug, isin)

    // ── Step 2: Try browser (gestora-specific or generic) ───────────────────
    if (!scrapeResult) {
      const browser = await getBrowser()
      if (browser) {
        browserOpened = true
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          acceptDownloads: true,
        })
        const page = await context.newPage()
        page.setDefaultTimeout(15000)

        try {
          let bytes: Buffer | null = null

          const specificScraper = BROWSER_SCRAPERS[slug]
          if (specificScraper) {
            bytes = await specificScraper(page, isin)
          }

          // Fallback: generic search on gestora's website
          if (!bytes) {
            const mgr = managerMap[slug]
            if (mgr) {
              const website = (mgr as any).website
              if (website) {
                const baseUrl = website.startsWith('http') ? website : `https://${website}`
                bytes = await genericSearch(page, isin, baseUrl)
              }
            }
          }

          if (bytes && bytes.length > 10000) {
            scrapeResult = {
              isin,
              bytes,
              filename: `${slug}_${isin}_factsheet.pdf`,
              source: 'browser',
            }
          }
        } catch (e: any) {
          results.push({ isin, fund: fundName, manager: managerName, status: 'fail', error: e.message })
          await context.close()
          continue
        } finally {
          await context.close()
        }
      }
    }

    if (!scrapeResult) {
      results.push({ isin, fund: fundName, manager: managerName, status: 'skip' })
      continue
    }

    // ── Step 3: Upload to OneDrive + save to DB ──────────────────────────────
    try {
      let pdfUrl: string | null = null
      if (msToken && rootId) {
        pdfUrl = await uploadToOneDrive(msToken, rootId, managerName, scrapeResult.filename, scrapeResult.bytes)
      }

      // Mark previous latest as stale
      await supabaseAdmin
        .from('factsheets')
        .update({ is_latest: false })
        .eq('fondo_id', fondoId)
        .eq('is_latest', true)

      await supabaseAdmin.from('factsheets').insert({
        fondo_id:         fondoId,
        asset_manager_id: managerId,
        file_name:        scrapeResult.filename,
        pdf_url:          pdfUrl,
        is_latest:        true,
        imported_by:      'web-sync',
      })

      results.push({ isin, fund: fundName, manager: managerName, status: 'ok', source: scrapeResult.source })
      totalImported++
    } catch (e: any) {
      results.push({ isin, fund: fundName, manager: managerName, status: 'fail', error: e.message })
    }
  }

  if (browserOpened) await closeBrowser()

  const pending = queue.length - batch.length

  return NextResponse.json({
    imported: totalImported,
    tried: batch.length,
    pending,
    message: pending > 0
      ? `${totalImported} importados. Quedan ${pending} fondos — volvé a ejecutar para continuar.`
      : `Completado: ${totalImported} factsheets importados de ${batch.length} fondos procesados.`,
    results,
  })
}

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const DRIVE_ID = process.env.CLIENTES_DRIVE_ID

// ── Microsoft Graph ───────────────────────────────────────────────────────────

async function getMsToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  const d = await res.json()
  if (!d.access_token) throw new Error('Graph token failed: ' + JSON.stringify(d))
  return d.access_token
}

async function getOrCreateFolder(token, parentId, name) {
  const enc = encodeURIComponent(name)
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${enc}'&$select=id,name,folder`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (r.ok) {
    const d = await r.json()
    const found = (d.value ?? []).find(i => i.folder && i.name === name)
    if (found) return found.id
  }
  const cr = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    }
  )
  return (await cr.json()).id
}

async function uploadToOneDrive(token, folderId, filename, buffer) {
  const safe = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodeURIComponent(safe)}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
      body: buffer,
    }
  )
  if (!r.ok) throw new Error(`Upload failed ${r.status}`)
  return await r.json()
}

// ── Fundinfo scraper (primary source) ────────────────────────────────────────
// fundinfo.com is the main factsheet distributor for most major asset managers.

async function scrapeFundinfo(page, isin) {
  try {
    await page.goto(`https://fundinfo.com/en/search?query=${isin}&types=documents`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForTimeout(3000)

    // Accept cookies
    const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Agree"), [id*="accept-all"], [class*="accept-all"]').first()
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click().catch(() => {})
      await page.waitForTimeout(1500)
    }

    // Intercept PDF downloads triggered by clicking factsheet links
    const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).catch(() => null)

    // Click the first download button that is inside a search result row
    // and associated with a "Factsheet" document type
    const clicked = await page.evaluate(() => {
      // Find result rows/cards that mention "factsheet" in their visible text
      const allEls = Array.from(document.querySelectorAll('*'))
      const factsheetContainers = allEls.filter(el => {
        const text = el.textContent?.toLowerCase() ?? ''
        // Must contain "factsheet" but not be a huge container (limit to small elements)
        return text.includes('factsheet') && el.children.length < 20 && el.tagName !== 'BODY' && el.tagName !== 'HTML'
      })

      // Within those containers, find the nearest download/PDF link
      for (const container of factsheetContainers) {
        const links = Array.from(container.querySelectorAll('a[href], button'))
        for (const link of links) {
          const href = (link instanceof HTMLAnchorElement ? link.href : '').toLowerCase()
          const text = (link.textContent ?? '').toLowerCase().trim()
          // Skip fundinfo's own navigation links and user guides
          if (href.includes('user-guide') || href.includes('userguide') || href.includes('/about') || href.includes('/legal')) continue
          if (text === 'download' || text === 'pdf' || href.includes('.pdf') || text.includes('download')) {
            ;(link as HTMLElement).click()
            return true
          }
        }
      }
      return false
    })

    if (clicked) {
      const download = await downloadPromise
      if (download) {
        const stream = await download.createReadStream()
        const chunks = []
        for await (const chunk of stream) chunks.push(Buffer.from(chunk))
        const buf = Buffer.concat(chunks)
        if (buf.length > 5000) return buf
      }
    }

    // Fallback: look for external PDF URLs in result area only
    const pdfUrl = await page.evaluate(() => {
      // Only look inside main content area, not header/footer
      const main = document.querySelector('main, [role="main"], #content, .content, #results, .results, .search-results') ?? document.body
      const links = Array.from(main.querySelectorAll('a[href]'))
      const hit = links.find(a => {
        const href = (a.href ?? '').toLowerCase()
        const text = (a.textContent ?? '').toLowerCase().trim()
        // Must be an external PDF (not fundinfo.com itself) or a fundinfo download endpoint
        const isExternal = !href.includes('fundinfo.com')
        const isFundinfoDownload = href.includes('fundinfo.com') && (href.includes('/download') || href.includes('/document'))
        if (!isExternal && !isFundinfoDownload) return false
        return href.endsWith('.pdf') || text === 'pdf' || text === 'download'
      })
      return hit?.href ?? null
    })

    if (pdfUrl) return await downloadBuffer(pdfUrl)

  } catch {
    // silent
  }
  return null
}

// ── Per-gestora direct URL fallback ──────────────────────────────────────────
// Used when fundinfo doesn't have the fund.

const DIRECT_PATTERNS = {
  blackrock: isin => [
    `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
    `https://www.blackrock.com/cache/api/pdfgen/isr_ie/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
    `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}.pdf`,
  ],
  pimco: isin => [
    `https://www.pimco.com/handlers/displaydocument.ashx?type=FS&id=${isin}`,
    `https://www.pimco.com/en-eu/handlers/displaydocument.ashx?type=FS&id=${isin}`,
  ],
  mfs: isin => [
    `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/factsheet/${isin}-factsheet-en.pdf`,
    `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/factsheet/${isin.toLowerCase()}-factsheet-en.pdf`,
  ],
  'janus-henderson': isin => [
    `https://documents.janushenderson.com/document/en-gb/factsheet/${isin}.pdf`,
    `https://documents.janushenderson.com/document/en-lu/factsheet/${isin}.pdf`,
  ],
  mg: isin => [
    `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_en_factsheet.pdf`,
  ],
  robeco: isin => [
    `https://www.robeco.com/docm/dooi/robeco-${isin}-factsheet.pdf`,
    `https://www.robeco.com/docm/dooi/robeco-${isin.toLowerCase()}-factsheet.pdf`,
  ],
  'ninety-one': isin => [
    `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/${isin}.pdf`,
    `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/gsf/${isin}.pdf`,
  ],
  vontobel: isin => [
    `https://am.vontobel.com/-/media/am-vontobel/documents/factsheets/${isin}.pdf`,
    `https://am.vontobel.com/-/media/am-vontobel/documents/fund-factsheets/${isin}.pdf`,
  ],
}

async function tryDirectPatterns(slug, isin) {
  const patterns = DIRECT_PATTERNS[slug]
  if (!patterns) return null
  for (const url of patterns(isin)) {
    const buf = await downloadBuffer(url)
    if (buf) return buf
  }
  return null
}

// ── HTTP download helper ──────────────────────────────────────────────────────

async function downloadBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('pdf') && !ct.includes('octet-stream')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 5000 ? buf : null
  } catch { return null }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting factsheet sync via fundinfo.com...')

  const { data: managers } = await supabase.from('asset_managers').select('id, slug, name')
  const { data: allFondos } = await supabase.from('fondos').select('id, isin, name, asset_manager_id').not('isin', 'is', null)
  const { data: covered }   = await supabase.from('factsheets').select('fondo_id').eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))
  const queue = (allFondos ?? [])
    .filter(f => !coveredIds.has(f.id))
    .map(f => {
      const mgr = managers.find(m => m.id === f.asset_manager_id)
      return mgr ? { ...f, managerSlug: mgr.slug, managerName: mgr.name, managerId: mgr.id } : null
    })
    .filter(Boolean)

  console.log(`📋 ${queue.length} funds to process`)
  if (queue.length === 0) { console.log('✅ All funds have factsheets'); return }

  // OneDrive
  let msToken = null, rootId = null
  try {
    msToken = await getMsToken()
    const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/Fondos`, {
      headers: { Authorization: `Bearer ${msToken}` }
    })
    if (r.ok) {
      rootId = (await r.json()).id
    } else {
      const root = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`, {
        headers: { Authorization: `Bearer ${msToken}` }
      })).json()
      const cr = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${root.id}/children`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fondos', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
      })
      rootId = (await cr.json()).id
    }
    console.log('✅ OneDrive connected')
  } catch (e) {
    console.warn('⚠️  OneDrive unavailable:', e.message)
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })

  const results = []
  let imported = 0
  let skipped  = 0
  const folderCache = {}

  for (const fund of queue) {
    let pdfBuf = null
    let source = ''

    // 1. Try fundinfo.com (covers most major gestoras)
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    try {
      pdfBuf = await scrapeFundinfo(page, fund.isin)
      if (pdfBuf) source = 'fundinfo'
    } catch (e) {
      console.warn(`  ⚠️  fundinfo error ${fund.isin}:`, e.message)
    } finally {
      await page.close()
    }

    // 2. Fallback: direct URL patterns
    if (!pdfBuf) {
      pdfBuf = await tryDirectPatterns(fund.managerSlug, fund.isin)
      if (pdfBuf) source = 'direct'
    }

    if (!pdfBuf) {
      skipped++
      results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'not-found' })
      console.log(`  ✗ ${fund.isin} — ${fund.managerName}`)
      continue
    }

    // Upload to OneDrive + save to Supabase
    let pdfUrl = null
    try {
      if (msToken && rootId) {
        if (!folderCache[fund.managerName]) {
          folderCache[fund.managerName] = await getOrCreateFolder(msToken, rootId, fund.managerName)
        }
        const uploaded = await uploadToOneDrive(
          msToken,
          folderCache[fund.managerName],
          `${fund.managerSlug}_${fund.isin}_factsheet.pdf`,
          pdfBuf
        )
        pdfUrl = uploaded.webUrl
      }
    } catch (e) {
      console.warn(`  ⚠️  OneDrive upload failed ${fund.isin}:`, e.message)
    }

    await supabase.from('factsheets').update({ is_latest: false }).eq('fondo_id', fund.id).eq('is_latest', true)
    await supabase.from('factsheets').insert({
      fondo_id: fund.id,
      asset_manager_id: fund.managerId,
      file_name: `${fund.managerSlug}_${fund.isin}_factsheet.pdf`,
      pdf_url: pdfUrl,
      is_latest: true,
      imported_by: `github-actions/${source}`,
    })

    imported++
    results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'ok', source, url: pdfUrl })
    console.log(`  ✓ [${source}] ${fund.isin} — ${fund.name}`)
  }

  await browser.close()

  const summary = { date: new Date().toISOString(), total: queue.length, imported, skipped, results }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`\n🏁 Done: ${imported} imported, ${skipped} not found`)
}

main().catch(e => { console.error(e); process.exit(1) })

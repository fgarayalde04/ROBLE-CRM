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

async function ensureFolder(token, parentId, name) {
  const enc = encodeURIComponent(name)
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${enc}'&$select=id,name`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (r.ok) {
    const d = await r.json()
    const found = (d.value ?? []).find(i => i.name === name)
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
  const created = await cr.json()
  if (!created.id) throw new Error(`Folder create failed: ${JSON.stringify(created)}`)
  return created.id
}

async function uploadToOneDrive(token, folderId, filename, buffer) {
  const safe = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodeURIComponent(safe)}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: buffer }
  )
  if (!r.ok) throw new Error(`Upload failed ${r.status}: ${await r.text()}`)
  return await r.json()
}

// ── Playwright helpers ────────────────────────────────────────────────────────

async function sessionGet(page, url) {
  try {
    const res = await page.request.get(url, {
      headers: { Accept: 'application/pdf,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 25000,
    })
    if (!res.ok()) return null
    const ct = res.headers()['content-type'] ?? ''
    if (!ct.includes('pdf') && !ct.includes('octet') && !ct.includes('binary')) return null
    const body = await res.body()
    return body.length > 5000 ? body : null
  } catch { return null }
}

async function captureDownload(page, clickFn, timeout = 18000) {
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout }), clickFn()])
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const buf = Buffer.concat(chunks)
    return buf.length > 5000 ? buf : null
  } catch { return null }
}

async function dismissCookies(page) {
  for (const sel of [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("I Accept")',
    'button:has-text("Agree")',
    '[class*="accept-all"]',
    '[id*="accept"]',
  ]) {
    const btn = page.locator(sel).first()
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(600)
      return
    }
  }
}

// ── Gestora scrapers ──────────────────────────────────────────────────────────
// Each entry: setup(page) = visit homepage once; download(page, isin) = get PDF

const SCRAPERS = {

  'janus-henderson': {
    setup: async (page) => {
      await page.goto('https://www.janushenderson.com/en-gb/professional/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://documents.janushenderson.com/document/en-gb/factsheet/${isin}.pdf`,
        `https://documents.janushenderson.com/document/en-lu/factsheet/${isin}.pdf`,
        `https://documents.janushenderson.com/document/en-us/factsheet/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'ninety-one': {
    setup: async (page) => {
      await page.goto('https://www.ninetyone.com/en/luxembourg', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/${isin}.pdf`,
        `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/gsf/${isin}.pdf`,
        `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/gsf/${isin.toLowerCase()}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  pimco: {
    setup: async (page) => {
      await page.goto('https://www.pimco.com/en-eu/our-firm/literature', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.pimco.com/handlers/displaydocument.ashx?type=FS&id=${isin}`,
        `https://www.pimco.com/en-eu/handlers/displaydocument.ashx?type=FS&id=${isin}`,
        `https://www.pimco.com/en-gb/handlers/displaydocument.ashx?type=FS&id=${isin}`,
        `https://www.pimco.com/content/dam/pimco/pdf/factsheet/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'neuberger-berman': {
    setup: async (page) => {
      await page.goto('https://www.nb.com/en/global/ucits', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.nb.com/-/media/nb/documents/factsheets/${isin}.pdf`,
        `https://www.nb.com/-/media/nb/documents/factsheets/ucits/${isin}.pdf`,
        `https://www.nb.com/-/media/nb/documents/ucits/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  robeco: {
    setup: async (page) => {
      await page.goto('https://www.robeco.com/en-lu/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.robeco.com/docm/dooi/robeco-${isin}-factsheet.pdf`,
        `https://www.robeco.com/docm/dooi/robeco-${isin.toLowerCase()}-factsheet.pdf`,
        `https://www.robeco.com/docm/dooi/${isin}-factsheet.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  vontobel: {
    setup: async (page) => {
      await page.goto('https://am.vontobel.com/en', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://am.vontobel.com/-/media/am-vontobel/documents/factsheets/${isin}.pdf`,
        `https://am.vontobel.com/-/media/am-vontobel/documents/fund-factsheets/${isin}.pdf`,
        `https://am.vontobel.com/-/media/am-vontobel/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  mg: {
    setup: async (page) => {
      await page.goto('https://www.mandg.com/investments/professional-investor/en-gb', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_en_factsheet.pdf`,
        `https://www.mandg.com/dam/investments/literature/factsheets/${isin}.pdf`,
        `https://www.mandg.com/dam/investments/literature/en/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  blackrock: {
    setup: async (page) => {
      await page.goto('https://www.blackrock.com/lu/individual', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
        `https://www.blackrock.com/cache/api/pdfgen/isr_ie/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
        `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  mfs: {
    setup: async (page) => {
      await page.goto('https://www.mfs.com/en-gb/financial-professional/funds/meridian/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      try {
        await page.goto(`https://www.mfs.com/en-gb/financial-professional/funds/meridian/share-class/${isin}/`, {
          waitUntil: 'domcontentloaded', timeout: 20000,
        })
        await page.waitForTimeout(1500)
        const buf = await captureDownload(page, async () => {
          const link = page.locator('a:has-text("Factsheet"), a:has-text("Fund Factsheet"), a[href*="factsheet"]').first()
          if (await link.isVisible({ timeout: 3000 }).catch(() => false)) await link.click()
        })
        if (buf) return buf
      } catch { }
      for (const url of [
        `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/factsheet/${isin.toLowerCase()}-factsheet-en.pdf`,
        `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/${isin}-factsheet-en.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'franklin-templeton': {
    setup: async (page) => {
      await page.goto('https://www.franklintempleton.lu/en-lu/investor', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.franklintempleton.lu/content/dam/ftinternational/literature/en/fact-sheets/${isin}.pdf`,
        `https://www.franklintempleton.ie/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
        `https://www.franklintempleton.com/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
        `https://www.franklintempleton.lu/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  schroders: {
    setup: async (page) => {
      await page.goto('https://www.schroders.com/en-lu/lu/professional/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.schroders.com/-/media/schroders/documents/factsheets/${isin}.pdf`,
        `https://www.schroders.com/en-lu/documents/${isin}/factsheet`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      try {
        await page.goto(`https://www.schroders.com/en-lu/lu/professional/funds/fund-centre/?isin=${isin}`, {
          waitUntil: 'networkidle', timeout: 20000,
        })
        await page.waitForTimeout(1500)
        const buf = await captureDownload(page, async () => {
          const link = page.locator('a:has-text("Factsheet"), a[href*="factsheet"]').first()
          if (await link.isVisible({ timeout: 4000 }).catch(() => false)) await link.click()
        })
        if (buf) return buf
      } catch { }
      return null
    },
  },

  'jp-morgan-am': {
    setup: async (page) => {
      await page.goto('https://am.jpmorgan.com/lu/en/asset-management/institutional/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/en/literature/factsheets/${isin}-en-factsheet.pdf`,
        `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/lu/en/literature/factsheet/${isin}.pdf`,
        `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/en/literature/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  jupiter: {
    setup: async (page) => {
      await page.goto('https://www.jupiteram.com/lu/en/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.jupiteram.com/-/media/jupiter/files/factsheets/${isin}.pdf`,
        `https://www.jupiteram.com/-/media/jupiter/files/${isin}-factsheet.pdf`,
        `https://www.jupiteram.com/-/media/jupiter/files/factsheets/${isin.toLowerCase()}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  barings: {
    setup: async (page) => {
      await page.goto('https://www.barings.com/en-gb/investor/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.barings.com/-/media/barings/documents/factsheets/${isin}.pdf`,
        `https://www.barings.com/-/media/barings/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  amundi: {
    setup: async (page) => {
      await page.goto('https://www.amundi.com/int/Institutional', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.amundi.com/document/factsheet/${isin}.pdf`,
        `https://www.amundi.com/doc/factsheet/${isin}.pdf`,
        `https://www.amundi.com/-/media/amundi/documents/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  pictet: {
    setup: async (page) => {
      await page.goto('https://www.assetmanagement.pictet/en/institutional', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.assetmanagement.pictet/-/media/pictet/documents/factsheets/${isin}.pdf`,
        `https://www.assetmanagement.pictet/en/institutional/fund-centre/factsheet/${isin}`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'man-group': {
    setup: async (page) => {
      await page.goto('https://www.man.com/fund-centre', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      try {
        await page.goto(`https://www.man.com/fund-documents?isin=${isin}`, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(1500)
        const buf = await captureDownload(page, async () => {
          const link = page.locator('a:has-text("Factsheet"), a[href*="factsheet"]').first()
          if (await link.isVisible({ timeout: 4000 }).catch(() => false)) await link.click()
        })
        if (buf) return buf
      } catch { }
      return null
    },
  },

  muzinich: {
    setup: async (page) => {
      await page.goto('https://www.muzinich.com/ie/en/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.muzinich.com/-/media/muzinich/documents/factsheets/${isin}.pdf`,
        `https://www.muzinich.com/-/media/muzinich/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  lazard: {
    setup: async (page) => {
      await page.goto('https://www.lazardassetmanagement.com/uk/en_gb/individual', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.lazardassetmanagement.com/-/media/lazard/documents/factsheets/${isin}.pdf`,
        `https://www.lazardassetmanagement.com/-/media/lazard/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'ab-bernstein': {
    setup: async (page) => {
      await page.goto('https://www.alliancebernstein.com/gb/en/individual/funds.html', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.alliancebernstein.com/-/media/ab/documents/factsheets/${isin}.pdf`,
        `https://www.alliancebernstein.com/-/media/ab/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  nuveen: {
    setup: async (page) => {
      await page.goto('https://www.nuveen.com/en-gb/professional', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.nuveen.com/-/media/nuveen/documents/factsheets/${isin}.pdf`,
        `https://www.nuveen.com/-/media/nuveen/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  wellington: {
    setup: async (page) => {
      await page.goto('https://www.wellington.com/en-gb/intermediary', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.wellington.com/-/media/wellington/documents/factsheets/${isin}.pdf`,
        `https://www.wellington.com/en-gb/intermediary/funds/fund-factsheet/${isin}`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  invesco: {
    setup: async (page) => {
      await page.goto('https://www.invesco.eu/en', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.invesco.com/content/dam/invesco/emea/en/fund-literature/${isin}.pdf`,
        `https://www.invesco.eu/-/media/invesco/documents/factsheets/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  fidelity: {
    setup: async (page) => {
      await page.goto('https://www.fidelityinternational.com/en-gb/professional/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      try {
        await page.goto(`https://www.fidelityinternational.com/funds/fund/isin-${isin}/`, {
          waitUntil: 'domcontentloaded', timeout: 20000,
        })
        await page.waitForTimeout(1500)
        const buf = await captureDownload(page, async () => {
          const link = page.locator('a:has-text("Factsheet"), a[href*="factsheet"]').first()
          if (await link.isVisible({ timeout: 4000 }).catch(() => false)) await link.click()
        })
        if (buf) return buf
      } catch { }
      return null
    },
  },

  'morgan-stanley': {
    setup: async (page) => {
      await page.goto('https://www.morganstanley.com/im/en-gb/intermediary-investor', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.morganstanley.com/im/content/dam/mim/documents/factsheets/${isin}.pdf`,
        `https://www.morganstanley.com/im/content/dam/mim/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  gam: {
    setup: async (page) => {
      await page.goto('https://www.gam.com/en/individual/fund-centre', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.gam.com/-/media/gam/documents/factsheets/${isin}.pdf`,
        `https://www.gam.com/-/media/gam/documents/factsheets/en/${isin}.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  federated: {
    setup: async (page) => {
      await page.goto('https://www.hermes-investment.com/uk/en/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.hermes-investment.com/-/media/hermes/documents/factsheets/${isin}.pdf`,
        `https://www.federatedinvestors.com/file/${isin}-factsheet.pdf`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'lord-abbett': {
    setup: async (page) => {
      await page.goto('https://www.lordabbett.com/en-us/financial-advisor.html', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      return await sessionGet(page, `https://www.lordabbett.com/-/media/lord-abbett/documents/factsheets/${isin}.pdf`)
    },
  },

  'eaton-vance': {
    setup: async (page) => {
      await page.goto('https://www.eatonvance.com/individual-investors/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      return await sessionGet(page, `https://www.eatonvance.com/literature/factsheets/${isin}.pdf`)
    },
  },

  'edmond-rothschild': {
    setup: async (page) => {
      await page.goto('https://www.edmond-de-rothschild.com/en/investment-management/funds', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      for (const url of [
        `https://www.edmond-de-rothschild.com/-/media/edmond-rothschild/documents/factsheets/${isin}.pdf`,
        `https://funds.edmond-de-rothschild.com/en/factsheet/${isin}`,
      ]) {
        const buf = await sessionGet(page, url)
        if (buf) return buf
      }
      return null
    },
  },

  'new-capital': {
    setup: async (page) => {
      await page.goto('https://newcapitalfunds.com/en/fund-centre', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      return await sessionGet(page, `https://newcapitalfunds.com/-/media/new-capital/documents/factsheets/${isin}.pdf`)
    },
  },

  'pacific-am': {
    setup: async (page) => {
      await page.goto('https://www.pacificassetmanagement.com/', { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissCookies(page)
    },
    download: async (page, isin) => {
      return await sessionGet(page, `https://www.pacificassetmanagement.com/-/media/documents/factsheets/${isin}.pdf`)
    },
  },
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting factsheet sync (per-gestora browser sessions)…')

  const { data: managers } = await supabase.from('asset_managers').select('id, slug, name')
  const { data: allFondos } = await supabase.from('fondos').select('id, isin, name, asset_manager_id').not('isin', 'is', null)
  const { data: covered }   = await supabase.from('factsheets').select('fondo_id').eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))
  const enriched = (allFondos ?? [])
    .filter(f => !coveredIds.has(f.id))
    .map(f => {
      const mgr = (managers ?? []).find(m => m.id === f.asset_manager_id)
      return mgr ? { ...f, managerSlug: mgr.slug, managerName: mgr.name } : null
    })
    .filter(Boolean)

  // Group by gestora slug
  const byManager = {}
  for (const f of enriched) {
    if (!byManager[f.managerSlug]) byManager[f.managerSlug] = []
    byManager[f.managerSlug].push(f)
  }

  const totalFunds = enriched.length
  const gestoras = Object.keys(byManager)
  console.log(`📋 ${totalFunds} funds across ${gestoras.length} gestoras`)
  if (totalFunds === 0) { console.log('✅ Nothing to do'); return }

  // OneDrive setup
  let msToken = null, fondosRootId = null
  try {
    msToken = await getMsToken()
    const rootRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`, {
      headers: { Authorization: `Bearer ${msToken}` }
    })
    const root = await rootRes.json()
    fondosRootId = await ensureFolder(msToken, root.id, 'Fondos')
    console.log('✅ OneDrive ready')
  } catch (e) {
    console.warn('⚠️  OneDrive unavailable:', e.message)
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })

  const results = []
  let imported = 0, skipped = 0
  const folderCache = {}

  for (const [slug, funds] of Object.entries(byManager)) {
    const scraper = SCRAPERS[slug]
    if (!scraper) {
      console.log(`\n⚪ ${slug}: no scraper (${funds.length} fondos skipped)`)
      for (const f of funds) {
        skipped++
        results.push({ isin: f.isin, fund: f.name, manager: f.managerName, status: 'no-scraper' })
      }
      continue
    }

    console.log(`\n🔍 ${slug} — ${funds.length} fondos`)
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    page.setDefaultTimeout(20000)

    try {
      await scraper.setup(page)
      console.log('  → session OK')
    } catch (e) {
      console.warn(`  ⚠️  Setup failed: ${e.message.slice(0, 80)}`)
      await page.close()
      for (const f of funds) {
        skipped++
        results.push({ isin: f.isin, fund: f.name, manager: f.managerName, status: 'setup-failed' })
      }
      continue
    }

    for (const fund of funds) {
      let pdfBuf = null
      try {
        pdfBuf = await scraper.download(page, fund.isin)
      } catch (e) {
        console.warn(`  ⚠️  ${fund.isin}: ${e.message.slice(0, 80)}`)
      }

      if (!pdfBuf) {
        skipped++
        results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'not-found' })
        console.log(`  ✗ ${fund.isin}`)
        continue
      }

      let pdfUrl = null
      try {
        if (msToken && fondosRootId) {
          if (!folderCache[fund.managerName]) {
            folderCache[fund.managerName] = await ensureFolder(msToken, fondosRootId, fund.managerName)
          }
          const filename = `${slug}_${fund.isin}_factsheet.pdf`
          const uploaded = await uploadToOneDrive(msToken, folderCache[fund.managerName], filename, pdfBuf)
          pdfUrl = uploaded.webUrl
        }
      } catch (e) {
        console.warn(`  ⚠️  Upload ${fund.isin}: ${e.message}`)
      }

      const mgrId = (managers ?? []).find(m => m.slug === slug)?.id
      await supabase.from('factsheets').update({ is_latest: false }).eq('fondo_id', fund.id).eq('is_latest', true)
      await supabase.from('factsheets').insert({
        fondo_id: fund.id,
        asset_manager_id: mgrId,
        file_name: `${slug}_${fund.isin}_factsheet.pdf`,
        pdf_url: pdfUrl,
        is_latest: true,
        imported_by: 'github-actions',
      })

      imported++
      results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'ok', url: pdfUrl })
      console.log(`  ✓ ${fund.isin} — ${fund.name}`)
    }

    await page.close()
  }

  await browser.close()

  const summary = { date: new Date().toISOString(), total: totalFunds, imported, skipped, results }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`\n🏁 Done: ${imported} imported, ${skipped} not found`)
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Factsheet scrapers for each asset manager.
 * Strategy 1: Direct URL patterns (fast, no browser).
 * Strategy 2: Playwright headless browser (for SPAs).
 *
 * Each scraper returns the raw PDF bytes or null.
 */

import type { Page } from 'playwright-core'

export type ScrapeResult = {
  isin: string
  bytes: Buffer
  filename: string
  source: 'direct' | 'browser'
}

// ── Strategy 1: Direct URL patterns ──────────────────────────────────────────
// Try each URL with a HEAD request; download the first one that returns a PDF.

const DIRECT_PATTERNS: Record<string, (isin: string) => string[]> = {
  blackrock: isin => [
    `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
    `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}.pdf`,
    `https://www.blackrock.com/cache/api/pdfgen/isr_ie/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
  ],
  pimco: isin => [
    `https://www.pimco.com/en-eu/handlers/displaydocument.ashx?type=FS&id=${isin}`,
    `https://www.pimco.com/handlers/displaydocument.ashx?type=FS&id=${isin}`,
  ],
  'franklin-templeton': isin => [
    `https://www.franklintempleton.lu/content/dam/ftinternational/literature/en/fact-sheets/${isin}.pdf`,
    `https://www.franklintempleton.com/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
    `https://www.franklintempleton.lu/content/dam/ftinternational/literature/en/${isin}.pdf`,
    `https://www.franklintempleton.ie/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
  ],
  schroders: isin => [
    `https://www.schroders.com/en-lu/documents/${isin}/factsheet`,
    `https://www.schroders.com/api/document/${isin}/factsheet`,
  ],
  'janus-henderson': isin => [
    `https://documents.janushenderson.com/document/en-gb/factsheet/${isin}.pdf`,
    `https://documents.janushenderson.com/document/en-us/factsheet/${isin}.pdf`,
    `https://documents.janushenderson.com/document/en-lu/factsheet/${isin}.pdf`,
  ],
  mg: isin => [
    `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_en_factsheet.pdf`,
    `https://www.mandg.com/dam/investments/literature/factsheets/${isin}.pdf`,
    `https://www.mandg.com/dam/investments/literature/en/factsheets/${isin}.pdf`,
  ],
  'jp-morgan-am': isin => [
    `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/en/literature/factsheets/${isin}-en-factsheet.pdf`,
    `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/lu/en/literature/factsheet/${isin}.pdf`,
    `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/en/literature/${isin}-factsheet.pdf`,
  ],
  mfs: isin => [
    `https://www.mfs.com/en-gb/financial-professional/funds/meridian/documents/${isin}-factsheet-en.pdf`,
    `https://www.mfs.com/en-us/financial-professional/funds/meridian/documents/${isin}-factsheet-en.pdf`,
    `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/factsheet/${isin}.pdf`,
  ],
  robeco: isin => [
    `https://www.robeco.com/docm/dooi/robeco-${isin}-factsheet.pdf`,
    `https://www.robeco.com/api/funds/${isin}/factsheet`,
  ],
  'ninety-one': isin => [
    `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/${isin}.pdf`,
    `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/gsf/${isin}.pdf`,
    `https://ninetyone.com/-/media/ninety-one/files/factsheets/${isin}.pdf`,
  ],
  'neuberger-berman': isin => [
    `https://www.nb.com/-/media/nb/documents/factsheets/${isin}.pdf`,
    `https://www.nb.com/-/media/nb/documents/factsheets/ucits/${isin}.pdf`,
    `https://www.nb.com/content/dam/nb/documents/factsheets/${isin}.pdf`,
  ],
  vontobel: isin => [
    `https://am.vontobel.com/-/media/am-vontobel/documents/factsheets/${isin}.pdf`,
    `https://am.vontobel.com/-/media/am-vontobel/documents/fund-factsheets/${isin}.pdf`,
    `https://am.vontobel.com/en/documents/factsheets/${isin}.pdf`,
  ],
  amundi: isin => [
    `https://www.amundi.com/document/factsheet/${isin}.pdf`,
    `https://www.amundi.com/doc/factsheet/${isin}.pdf`,
    `https://marketing.amundi.com/document/${isin}/factsheet.pdf`,
  ],
  barings: isin => [
    `https://www.barings.com/-/media/barings/documents/factsheets/${isin}.pdf`,
    `https://www.barings.com/-/media/barings/documents/${isin}-factsheet.pdf`,
  ],
  jupiter: isin => [
    `https://www.jupiteram.com/-/media/jupiter/files/factsheets/${isin}.pdf`,
    `https://www.jupiteram.com/-/media/jupiter/files/${isin}-factsheet.pdf`,
    `https://www.jupiteram.com/en/funds/documents/${isin}/factsheet.pdf`,
  ],
  muzinich: isin => [
    `https://www.muzinich.com/-/media/muzinich/documents/factsheets/${isin}.pdf`,
    `https://www.muzinich.com/documents/factsheets/${isin}.pdf`,
  ],
  lazard: isin => [
    `https://www.lazardassetmanagement.com/-/media/lazard/documents/factsheets/${isin}.pdf`,
    `https://www.lazardassetmanagement.com/us/en_us/funds/fact-sheets/${isin}.pdf`,
  ],
  aegon: isin => [
    `https://www.aegonam.com/-/media/files/factsheets/${isin}.pdf`,
    `https://www.aegonam.com/document-library/factsheet/${isin}.pdf`,
  ],
  aberdeen: isin => [
    `https://www.abrdn.com/-/media/abrdn/documents/factsheets/${isin}.pdf`,
    `https://www.abrdn.com/-/media/abrdn/documents/fund-factsheets/${isin}.pdf`,
  ],
  'ab-bernstein': isin => [
    `https://www.alliancebernstein.com/-/media/ab/documents/factsheets/${isin}.pdf`,
    `https://www.alliancebernstein.com/library/html/OtherLanguages/factsheets/${isin}.pdf`,
  ],
  gam: isin => [
    `https://www.gam.com/-/media/gam/documents/factsheets/${isin}.pdf`,
    `https://www.gam.com/-/media/gam/documents/${isin}-factsheet.pdf`,
  ],
  pictet: isin => [
    `https://www.assetmanagement.pictet/-/media/pictet/documents/factsheets/${isin}.pdf`,
    `https://www.assetmanagement.pictet/documents/factsheet/${isin}.pdf`,
  ],
  'man-group': isin => [
    `https://www.man.com/-/media/man/documents/factsheets/${isin}.pdf`,
    `https://www.man.com/factsheet/${isin}.pdf`,
  ],
  nuveen: isin => [
    `https://www.nuveen.com/-/media/nuveen/documents/factsheets/${isin}.pdf`,
    `https://www.nuveen.com/content/dam/nuveen/documents/${isin}.pdf`,
  ],
  'lord-abbett': isin => [
    `https://www.lordabbett.com/content/dam/lordabbett/documents/factsheets/${isin}.pdf`,
  ],
  'eaton-vance': isin => [
    `https://www.eatonvance.com/-/media/eatonvance/documents/factsheets/${isin}.pdf`,
  ],
  dnca: isin => [
    `https://www.dnca-investments.com/-/media/dnca/documents/factsheets/${isin}.pdf`,
    `https://www.dnca-investments.com/documents/factsheets/${isin}.pdf`,
  ],
  federated: isin => [
    `https://www.federatedhermes.com/-/media/federated/documents/factsheets/${isin}.pdf`,
  ],
  'edmond-rothschild': isin => [
    `https://www.edmond-de-rothschild.com/-/media/documents/factsheets/${isin}.pdf`,
    `https://www.edmond-de-rothschild.com/en/documents/factsheets/${isin}.pdf`,
  ],
  h2o: isin => [
    `https://www.h2o-am.com/-/media/h2o/documents/factsheets/${isin}.pdf`,
    `https://www.h2o-am.com/documents/${isin}/factsheet.pdf`,
  ],
  moneda: isin => [
    `https://www.moneda.com/documents/factsheets/${isin}.pdf`,
  ],
  credicorp: isin => [
    `https://www.credicorpcapital.com/documents/factsheets/${isin}.pdf`,
  ],
  'pacific-am': isin => [
    `https://www.pacific-am.com/-/media/pacific/documents/factsheets/${isin}.pdf`,
    `https://www.pacific-am.com/documents/${isin}/factsheet.pdf`,
  ],
  'new-capital': isin => [
    `https://www.newcapitalfunds.com/-/media/documents/factsheets/${isin}.pdf`,
  ],
  thornburg: isin => [
    `https://www.thornburg.com/-/media/thornburg/documents/factsheets/${isin}.pdf`,
    `https://www.thornburg.com/content/dam/thornburg/documents/${isin}-factsheet.pdf`,
  ],
  nomura: isin => [
    `https://www.nomura-am.com/documents/factsheets/${isin}.pdf`,
  ],
  pinebridge: isin => [
    `https://www.pinebridge.com/-/media/pinebridge/documents/factsheets/${isin}.pdf`,
  ],
  putnam: isin => [
    `https://www.putnam.com/-/media/putnam/documents/factsheets/${isin}.pdf`,
    `https://www.putnam.com/literature/pdf/factsheet/${isin}.pdf`,
  ],
  solitaire: isin => [
    `https://www.solitaire-funds.com/documents/factsheets/${isin}.pdf`,
  ],
  vinci: isin => [
    `https://www.vincicompass.com/documents/factsheets/${isin}.pdf`,
  ],
  virtus: isin => [
    `https://www.virtus.com/-/media/virtus/documents/factsheets/${isin}.pdf`,
  ],
  wcm: isin => [
    `https://www.wcminvest.com/documents/factsheets/${isin}.pdf`,
  ],
  doubleline: isin => [
    `https://www.doubleline.com/-/media/doubleline/documents/factsheets/${isin}.pdf`,
  ],
  compass: isin => [
    `https://www.cgcompass.com/documents/factsheets/${isin}.pdf`,
  ],
  'morgan-stanley': isin => [
    `https://www.morganstanley.com/im/content/dam/mim/documents/factsheets/${isin}.pdf`,
    `https://www.morganstanley.com/im/-/media/morgan-stanley-im/documents/${isin}.pdf`,
  ],
}

async function tryDirectUrl(isin: string, urls: string[]): Promise<{ url: string; bytes: Buffer } | null> {
  for (const url of urls) {
    try {
      const head = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RobleCapital/1.0)' },
        signal: AbortSignal.timeout(5000),
      })
      const ct = head.headers.get('content-type') ?? ''
      if (head.ok && (ct.includes('pdf') || ct.includes('octet-stream'))) {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RobleCapital/1.0)' },
          signal: AbortSignal.timeout(20000),
        })
        if (res.ok) return { url, bytes: Buffer.from(await res.arrayBuffer()) }
      }
    } catch { /* try next */ }
  }
  return null
}

export async function scrapeDirectByISIN(
  slug: string,
  isin: string,
): Promise<ScrapeResult | null> {
  const patterns = DIRECT_PATTERNS[slug]
  if (!patterns) return null

  const hit = await tryDirectUrl(isin, patterns(isin))
  if (!hit) return null

  const filename = `${slug}_${isin}_factsheet.pdf`
  return { isin, bytes: hit.bytes, filename, source: 'direct' }
}

// ── Strategy 2: Playwright browser scrapers ───────────────────────────────────
// Generic recipe + per-gestora overrides.

export type BrowserScraper = (page: Page, isin: string) => Promise<Buffer | null>

// Wait for first PDF download when clicking a link
async function interceptPDF(page: Page, clickAction: () => Promise<void>): Promise<Buffer | null> {
  return new Promise(async (resolve) => {
    let resolved = false

    // Intercept navigation to PDF URL
    page.on('response', async (response) => {
      if (resolved) return
      const ct = response.headers()['content-type'] ?? ''
      const url = response.url()
      if ((ct.includes('pdf') || url.endsWith('.pdf')) && response.status() === 200) {
        try {
          const body = await response.body()
          if (body.length > 10000) {
            resolved = true
            resolve(body)
          }
        } catch { /* ignore */ }
      }
    })

    // Also listen for downloads
    page.context().on('page', (newPage) => {
      newPage.on('response', async (response) => {
        if (resolved) return
        const ct = response.headers()['content-type'] ?? ''
        if (ct.includes('pdf') && response.status() === 200) {
          try {
            const body = await response.body()
            if (body.length > 10000) {
              resolved = true
              resolve(body)
            }
          } catch { /* ignore */ }
        }
      })
    })

    try {
      await clickAction()
    } catch { /* navigation errors are expected */ }

    // Timeout
    setTimeout(() => { if (!resolved) { resolved = true; resolve(null) } }, 15000)
  })
}

// Generic recipe: search for ISIN on the gestora's site and find a factsheet PDF
async function genericSearch(page: Page, isin: string, baseUrl: string): Promise<Buffer | null> {
  try {
    // Navigate to the site
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Try to find a search box
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="busca" i]',
      'input[placeholder*="isin" i]',
      'input[placeholder*="fund" i]',
      'input[name="q"]',
      'input[name="search"]',
      '#search',
      '.search-input',
    ]

    let searchInput = null
    for (const sel of searchSelectors) {
      try {
        searchInput = await page.waitForSelector(sel, { timeout: 2000 })
        if (searchInput) break
      } catch { /* try next */ }
    }

    if (!searchInput) return null

    // Type ISIN
    await searchInput.fill(isin)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)

    // Look for PDF links containing factsheet-related keywords
    const pdfLinks = await page.evaluate((isin) => {
      const links = Array.from(document.querySelectorAll('a[href]'))
      return links
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href => {
          const lower = href.toLowerCase()
          return lower.endsWith('.pdf') &&
            (lower.includes('factsheet') || lower.includes('fact-sheet') || lower.includes('fact_sheet') || lower.includes(isin.toLowerCase()))
        })
    }, isin)

    if (!pdfLinks.length) return null

    // Download the first matching PDF
    const res = await fetch(pdfLinks[0], {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 10000) return buf
    }
  } catch { /* ignore */ }

  return null
}

// Per-gestora browser recipes
const BROWSER_SCRAPERS: Record<string, BrowserScraper> = {

  pimco: async (page, isin) => {
    try {
      // PIMCO EU factsheet portal
      await page.goto(`https://www.pimco.com/en-eu/investments/gis/`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      // Search by ISIN
      const search = await page.$('input[placeholder*="search" i], input[placeholder*="ISIN" i], input[type="search"]')
      if (search) {
        await search.fill(isin)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(3000)
      }
      // Look for factsheet download link
      const pdfUrl = await page.evaluate((isin) => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const href = a.href?.toLowerCase() ?? ''
          const text = a.textContent?.toLowerCase() ?? ''
          return (href.includes('factsheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      }, isin)
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  blackrock: async (page, isin) => {
    try {
      await page.goto(`https://www.blackrock.com/uk/individual/products/${isin}/`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const href = a.href?.toLowerCase() ?? ''
          const text = a.textContent?.toLowerCase() ?? ''
          return (text.includes('fact sheet') || text.includes('factsheet')) && (href.includes('.pdf') || href.includes('pdfgen'))
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  'jp-morgan-am': async (page, isin) => {
    try {
      await page.goto(`https://am.jpmorgan.com/gb/en/asset-management/adv/products/?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  'franklin-templeton': async (page, isin) => {
    try {
      await page.goto(`https://www.franklintempleton.com/investments/options/${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  schroders: async (page, isin) => {
    try {
      await page.goto(`https://www.schroders.com/en/global/individual/funds/fund-centre/fund-details/?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  mfs: async (page, isin) => {
    try {
      await page.goto(`https://www.mfs.com/en-gb/financial-professional/funds.html?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(3000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  'janus-henderson': async (page, isin) => {
    try {
      await page.goto(`https://www.janushenderson.com/en-gb/investor/funds/?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(3000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  'ninety-one': async (page, isin) => {
    try {
      await page.goto(`https://www.ninetyone.com/en/international/funds/funds-listing?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  amundi: async (page, isin) => {
    try {
      await page.goto(`https://www.amundi.com/product/${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(3000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet') || text.includes('fiche')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  mg: async (page, isin) => {
    try {
      await page.goto(`https://www.mandg.com/investments/professional-investor/en-gb/funds/${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  robeco: async (page, isin) => {
    try {
      await page.goto(`https://www.robeco.com/en-us/funds/detail?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(3000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  'neuberger-berman': async (page, isin) => {
    try {
      await page.goto(`https://www.nb.com/en/global/funds?isin=${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(3000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  vontobel: async (page, isin) => {
    try {
      await page.goto(`https://am.vontobel.com/en/funds/${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },

  barings: async (page, isin) => {
    try {
      await page.goto(`https://www.barings.com/en/investor/funds/${isin}`, {
        waitUntil: 'networkidle', timeout: 20000,
      })
      await page.waitForTimeout(2000)
      const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
        const match = links.find(a => {
          const text = (a.textContent ?? '').toLowerCase()
          const href = (a.href ?? '').toLowerCase()
          return (text.includes('fact sheet') || text.includes('factsheet')) && href.includes('.pdf')
        })
        return match?.href ?? null
      })
      if (pdfUrl) {
        const res = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
    return null
  },
}

// ── Public API ────────────────────────────────────────────────────────────────

export { DIRECT_PATTERNS, BROWSER_SCRAPERS, genericSearch }

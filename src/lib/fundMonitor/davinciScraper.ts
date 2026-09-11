/**
 * Scraper de Davinci Fund Intelligence (fund-tool.davinci-tp.com) — fuente
 * automática de rendimientos para el Monitor de Fondos, en reemplazo de la
 * carga manual desde el Excel alimentado por Bloomberg.
 *
 * Metodología verificada contra el Excel de Bloomberg (5 fondos de prueba,
 * gestoras distintas): los años calendario (HIST_TRR_PREV_*YR en Bloomberg)
 * coinciden casi exacto; los períodos móviles (YTD/1A/3A/5A) quedan cerca
 * pero no exactos porque Davinci y Bloomberg no comparten la misma fecha de
 * corte — se documenta como diferencia esperada, no como error.
 *
 * La búsqueda por ISIN exacto en el Explorador devuelve una sola fila; el
 * orden de columnas (verificado inspeccionando el DOM real) es:
 *   [nombre+categoría, watchlist(vacío), YTD, 1A, 3A, 5A, 2025, 2024, 2023,
 *    2022, 2021, Sharpe3A, Sharpe5A, AUM, doc(vacío), fecha]
 */
import type { Page, Browser } from 'playwright-core'

const BASE_URL = 'https://fund-tool.davinci-tp.com'

export interface DavinciFundReturns {
  nombreDavinci: string
  ytd: number | null
  r1a: number | null
  r3a: number | null
  r5a: number | null
  y2025: number | null
  y2024: number | null
  y2023: number | null
  y2022: number | null
  y2021: number | null
  aum: string | null
  asOfDate: string | null   // ISO yyyy-mm-dd
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  // El sitio usa punto decimal (formato en inglés), no miles con punto —
  // arriba se cubre el caso alternativo por si cambia el locale.
  const direct = parseFloat(s.trim())
  if (!isNaN(direct)) return direct
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function parseDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export async function loginDavinci(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  // Si ya había una sesión válida (cookie persistida), /login redirige solo
  // al dashboard y no hay nada más que hacer.
  if (!page.url().includes('/login')) return

  // Selectores por texto de label, no por atributos internos (no confirmados
  // — el formulario es un server-action de Next.js sin name/id propios) —
  // "Email" y "Contraseña" son el texto visible confirmado en el formulario.
  const emailInput = page.locator('input:not([type="hidden"])').nth(0)
  const passwordInput = page.locator('input[type="password"]')
  await emailInput.fill(email)
  await passwordInput.fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  // Login exitoso redirige fuera de /login.
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 15000 })
}

let explorerLoaded = false

/**
 * Busca un fondo por ISIN exacto en el Explorador y devuelve sus retornos.
 * null si el ISIN no aparece en la base de Davinci (fondo sin cobertura).
 */
export async function searchFundReturns(page: Page, isin: string): Promise<DavinciFundReturns | null> {
  if (!explorerLoaded) {
    await page.goto(`${BASE_URL}/explorer`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    explorerLoaded = true
  }

  const input = page.locator('input[placeholder*="ISIN" i]')
  await input.fill('')
  await input.fill(isin)
  await page.waitForTimeout(1200)

  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  if (count === 0) return null

  const cells = await rows.first().locator('td').allTextContents()
  // Layout esperado (16 celdas): ver comentario del encabezado del archivo.
  if (cells.length < 15) return null

  const [nombreCategoria, , ytd, r1a, r3a, r5a, y2025, y2024, y2023, y2022, y2021, , , aum, , fecha] = cells
  // El nombre viene con el rating pegado (ej. "Fondo★★★ EAA Fund ...") —
  // se corta en el primer símbolo de estrella o "EAA".
  const nombreDavinci = nombreCategoria.split('★')[0].replace(/^☆/, '').trim()

  return {
    nombreDavinci,
    ytd: parseNum(ytd),
    r1a: parseNum(r1a),
    r3a: parseNum(r3a),
    r5a: parseNum(r5a),
    y2025: parseNum(y2025),
    y2024: parseNum(y2024),
    y2023: parseNum(y2023),
    y2022: parseNum(y2022),
    y2021: parseNum(y2021),
    aum: aum?.trim() || null,
    asOfDate: parseDate(fecha ?? ''),
  }
}

export async function openDavinciPage(browser: Browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  explorerLoaded = false
  return { context, page }
}

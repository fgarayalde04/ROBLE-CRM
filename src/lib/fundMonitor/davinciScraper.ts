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
 * Los fondos alternativos (private debt, infraestructura, private equity) no
 * están en el Explorador ni tienen ISIN en Davinci: viven en su propia pestaña
 * /alternatives, una tabla de 27 instrumentos con otro formato (ver
 * searchAlternativesByName).
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

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// El nombre viene con el rating pegado (ej. "Fondo★★★ EAA Fund ...") — se
// corta en el primer símbolo de estrella. Los fondos sin rating no tienen
// estrella, y ahí la celda trae el nombre seguido de la categoría.
function nombreDeCelda(celda: string): string {
  return celda.split('★')[0].replace(/^☆/, '').trim()
}

function parseRow(cells: string[]): DavinciFundReturns | null {
  // Layout esperado (16 celdas): ver comentario del encabezado del archivo.
  if (cells.length < 15) return null
  const [nombreCategoria, , ytd, r1a, r3a, r5a, y2025, y2024, y2023, y2022, y2021, , , aum, , fecha] = cells
  return {
    nombreDavinci: nombreDeCelda(nombreCategoria),
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

async function searchExplorer(page: Page, query: string): Promise<string[][]> {
  // Se decide por la URL de la página y no por un flag de módulo: puede haber
  // dos sesiones a la vez (alta manual de un fondo mientras corre el sync
  // diario), y un flag compartido dejaría a una de ellas sin navegar.
  if (!page.url().includes('/explorer')) {
    await page.goto(`${BASE_URL}/explorer`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  }

  const input = page.locator('input[placeholder*="ISIN" i]')
  await input.fill('')
  await input.fill(query)
  await page.waitForTimeout(1200)

  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  const out: string[][] = []
  for (let i = 0; i < Math.min(count, 25); i++) {
    out.push(await rows.nth(i).locator('td').allTextContents())
  }
  return out
}

/**
 * Pestaña "Alternativos" de Davinci: una tabla única con todos los fondos
 * semi-líquidos (private debt, infraestructura, private equity). Sin ISIN, se
 * identifican por nombre. Layout de 18 celdas (verificado contra el DOM real):
 *   [checkbox, nombre, cierre, YTD, 1A, 2A, 3A, 2025, 2024, 2023, 2022,
 *    Sharpe1A, Sharpe3A, Sortino1A, Sortino3A, StdDev1A, StdDev3A, AUM]
 * No trae 5 años ni 2021 (quedan null), y el cierre es mensual/trimestral.
 * Las filas de encabezado de grupo y las vacías tienen menos celdas.
 */
function parseAlternativeRow(cells: string[]): DavinciFundReturns | null {
  if (cells.length < 18) return null
  const [, nombre, cierre, ytd, r1a, , r3a, y2025, y2024, y2023, y2022, , , , , , , aum] = cells
  return {
    nombreDavinci: nombre.replace(/📄/g, '').trim(),
    ytd: parseNum(ytd),
    r1a: parseNum(r1a),
    r3a: parseNum(r3a),
    r5a: null,
    y2025: parseNum(y2025),
    y2024: parseNum(y2024),
    y2023: parseNum(y2023),
    y2022: parseNum(y2022),
    y2021: null,
    aum: aum?.trim() || null,
    asOfDate: parseDate(cierre ?? ''),
  }
}

async function searchAlternativesByName(page: Page, nombre: string): Promise<DavinciFundReturns | null> {
  const target = norm(nombre)
  if (!target) return null

  if (!page.url().includes('/alternatives')) {
    await page.goto(`${BASE_URL}/alternatives`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  }
  // La tabla se hidrata después del HTML inicial: se espera a la primera fila de datos.
  await page.waitForSelector('table tbody tr td:nth-child(18)', { timeout: 15000 }).catch(() => {})

  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  const parsed: { cell: string; row: DavinciFundReturns }[] = []
  for (let i = 0; i < count; i++) {
    const cells = await rows.nth(i).locator('td').allTextContents()
    const row = parseAlternativeRow(cells)
    if (row) parsed.push({ cell: cells[1], row })
  }

  // La celda trae el badge "DV" y el ícono de documento pegados al nombre
  // ("Oaktree Strategic Credit IDV📄"), por eso se compara por "contiene" y,
  // ante varios candidatos, se exige igualdad exacta sin ese sufijo.
  const candidates = parsed.filter(p => norm(p.cell).includes(target))
  if (candidates.length === 1) return candidates[0].row
  if (candidates.length === 0) return null
  const exact = candidates.filter(p => norm(p.cell.replace(/📄/g, '').replace(/DV\s*$/, '')) === target)
  return exact.length === 1 ? exact[0].row : null
}

/**
 * Busca un fondo en Davinci y devuelve sus retornos, probando en orden:
 *  1. Explorador por ISIN exacto (fondos comunes).
 *  2. Pestaña Alternativos por nombre (private debt etc.: no tienen ISIN en Davinci).
 *  3. Explorador por nombre.
 * Las búsquedas por nombre solo se aceptan si identifican un único fondo — ante
 * ambigüedad devuelve null antes que traer los rendimientos de otro fondo.
 * null si el fondo no aparece en Davinci (sin cobertura).
 */
export async function searchFundReturns(page: Page, isin: string, nombre?: string): Promise<DavinciFundReturns | null> {
  const byIsin = await searchExplorer(page, isin)
  const isinHit = byIsin.length > 0 ? parseRow(byIsin[0]) : null
  if (isinHit) return isinHit

  const target = nombre ? norm(nombre) : ''
  if (!target) return null

  const alt = await searchAlternativesByName(page, nombre!)
  if (alt) return alt

  const byName = await searchExplorer(page, nombre!.trim())
  const candidates = byName.filter(cells => cells.length >= 15 && norm(cells[0]).includes(target))
  if (candidates.length === 0) return null
  if (candidates.length === 1) return parseRow(candidates[0])

  const exact = candidates.filter(cells => norm(nombreDeCelda(cells[0])) === target)
  return exact.length === 1 ? parseRow(exact[0]) : null
}

export async function openDavinciPage(browser: Browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  return { context, page }
}

// Imprime un estado de cuenta con el Chromium headless (el mismo que usan el
// Calendario de Cupones y las Plantillas): la portada sin encabezado ni pie, el
// cuerpo con encabezado y pie en cada hoja, y une las dos partes con pdf-lib.
import { PDFDocument } from 'pdf-lib'
import type { Browser } from 'playwright-core'
import { closeBrowser, getBrowser } from '@/lib/fondos/browser'
import { OPCIONES_PDF } from './base'

export interface PartesPdf {
  portada: string
  cuerpo: string
  encabezado: string
  pie: string
  titulo: string
}

export async function imprimirConBrowser(browser: Browser, p: PartesPdf): Promise<Buffer> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(p.portada, { waitUntil: 'load' })
    const portada = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    await page.setContent(p.cuerpo, { waitUntil: 'load' })
    const cuerpo = await page.pdf({ ...OPCIONES_PDF, headerTemplate: p.encabezado, footerTemplate: p.pie })

    const final = await PDFDocument.create()
    for (const parte of [portada, cuerpo]) {
      const doc = await PDFDocument.load(parte)
      for (const pagina of await final.copyPages(doc, doc.getPageIndices())) final.addPage(pagina)
    }
    final.setTitle(p.titulo)
    final.setAuthor('Roble Capital Wealth Management')
    return Buffer.from(await final.save())
  } finally {
    await context.close().catch(() => {})
  }
}

export async function imprimirEstadoCuenta(p: PartesPdf): Promise<Buffer> {
  // El Chromium headless a veces se cae en el primer uso tras un deploy: un reintento.
  let ultimo = ''
  for (let intento = 0; intento < 2; intento++) {
    try {
      const browser = await getBrowser()
      if (!browser) throw new Error('No se pudo iniciar el browser headless')
      return await imprimirConBrowser(browser, p)
    } catch (e: any) {
      ultimo = e?.message ?? String(e)
      console.error(`[estado-cuenta/pdf] intento ${intento + 1} falló:`, ultimo)
      await closeBrowser()
    }
  }
  throw new Error(ultimo)
}

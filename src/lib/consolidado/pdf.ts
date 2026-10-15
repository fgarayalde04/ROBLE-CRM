// PDF de la Posición Consolidada: el HTML de html.ts impreso con el Chromium
// headless (el mismo que usan el Calendario de Cupones y las Plantillas).
// La portada se imprime aparte (sin encabezado ni pie) y se une adelante con pdf-lib.
import { PDFDocument } from 'pdf-lib'
import type { Browser } from 'playwright-core'
import { closeBrowser, getBrowser } from '@/lib/fondos/browser'
import type { Reporte } from './calc'
import { OPCIONES_PDF, encabezadoPdf, htmlEstadoCuenta, htmlPortada, piePdf, type OpcionesDocumento } from './html'

/** Imprime portada + documento con un browser ya abierto y los une en un solo PDF. */
export async function imprimirConsolidado(browser: Browser, r: Reporte, o: OpcionesDocumento): Promise<Buffer> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(htmlPortada(r, o.cliente), { waitUntil: 'load' })
    const portada = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    await page.setContent(htmlEstadoCuenta(r, o), { waitUntil: 'load' })
    const cuerpo = await page.pdf({ ...OPCIONES_PDF, headerTemplate: encabezadoPdf(r, o.cliente), footerTemplate: piePdf(o.cliente) })

    const final = await PDFDocument.create()
    for (const parte of [portada, cuerpo]) {
      const doc = await PDFDocument.load(parte)
      for (const p of await final.copyPages(doc, doc.getPageIndices())) final.addPage(p)
    }
    final.setTitle(`Posición consolidada${o.cliente.trim() ? ` - ${o.cliente.trim()}` : ''}`)
    final.setAuthor('Roble Capital Wealth Management')
    return Buffer.from(await final.save())
  } finally {
    await context.close().catch(() => {})
  }
}

export async function generarPdfConsolidado(r: Reporte, o: OpcionesDocumento): Promise<Buffer> {
  // El Chromium headless a veces se cae en el primer uso tras un deploy: un reintento.
  let ultimo = ''
  for (let intento = 0; intento < 2; intento++) {
    try {
      const browser = await getBrowser()
      if (!browser) throw new Error('No se pudo iniciar el browser headless')
      return await imprimirConsolidado(browser, r, o)
    } catch (e: any) {
      ultimo = e?.message ?? String(e)
      console.error(`[consolidado/pdf] intento ${intento + 1} falló:`, ultimo)
      await closeBrowser()
    }
  }
  throw new Error(ultimo)
}

// PDF de la Posición Consolidada: el HTML de html.ts impreso con el Chromium
// headless (el mismo que usan el Calendario de Cupones y las Plantillas).
import { closeBrowser, getBrowser } from '@/lib/fondos/browser'
import type { Reporte } from './calc'
import { OPCIONES_PDF, encabezadoPdf, htmlEstadoCuenta, piePdf, type OpcionesDocumento } from './html'

async function imprimir(html: string, header: string, footer: string): Promise<Buffer> {
  const browser = await getBrowser()
  if (!browser) throw new Error('No se pudo iniciar el browser headless')
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    return await page.pdf({ ...OPCIONES_PDF, headerTemplate: header, footerTemplate: footer })
  } finally {
    await context.close().catch(() => {})
  }
}

export async function generarPdfConsolidado(r: Reporte, o: OpcionesDocumento): Promise<Buffer> {
  const html = htmlEstadoCuenta(r, o)
  const header = encabezadoPdf(r, o.cliente)
  const footer = piePdf(o.cliente)
  // El Chromium headless a veces se cae en el primer uso tras un deploy: un reintento.
  let ultimo = ''
  for (let intento = 0; intento < 2; intento++) {
    try {
      return await imprimir(html, header, footer)
    } catch (e: any) {
      ultimo = e?.message ?? String(e)
      console.error(`[consolidado/pdf] intento ${intento + 1} falló:`, ultimo)
      await closeBrowser()
    }
  }
  throw new Error(ultimo)
}

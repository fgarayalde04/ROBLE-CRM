// Formato "estado de cuenta" de los PDFs para clientes (Posición Consolidada y
// Portafolio): A4 apaisado, mismo encabezado y pie en todas las hojas, tablas
// que no se parten entre hojas, portada aparte. El HTML lo imprime el Chromium
// headless (imprimir.ts). Sin números de cuenta ni identificadores.

import { ROBLE_LOGO_BASE64 } from '@/lib/icheAcciones/logoBase64'
import { BNY_LOGO_BASE64 } from './logosBase64'

export const NAVY = '#1B2A38'
export const VERDE = '#1B3A2B'
export const GRIS = '#6B7280'
export const GRIS_CLARO = '#9CA3AF'
export const BORDE = '#E2E8F0'
export const FONDO = '#F5F7F9'
export const GANANCIA = '#15803D'
export const PERDIDA = '#B91C1C'

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LARGOS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`

export function num(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return n < 0 ? `-${s}` : s
}
export const usd = (n: number, dec = 2) => `USD ${num(n, dec)}`
export const pct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`
export const signo = (n: number) => (n > 0 ? '+' : '')
export const colorRes = (n: number | null) => (n == null ? GRIS : n < 0 ? PERDIDA : n > 0 ? GANANCIA : GRIS)

export const ddmmyyyy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

// ─── Bloques ────────────────────────────────────────────────────────────────

/**
 * Filas de una tabla agrupadas en <tbody> que no se parten entre hojas: el
 * título del grupo va con sus dos primeras filas y el subtotal (o total) con
 * las dos últimas, para que nunca quede un título o un total solo en una hoja.
 */
export function bloquesSinHuerfanos(encabezado: string, filas: string[], cierre: string) {
  const tb = (html: string) => `<tbody class="junto">${html}</tbody>`
  if (filas.length <= 4) return tb(encabezado + filas.join('') + cierre)
  const medio = filas.slice(2, -2).map((f) => `<tbody>${f}</tbody>`).join('')
  return tb(encabezado + filas.slice(0, 2).join('')) + medio + tb(filas.slice(-2).join('') + cierre)
}

export function kpi(label: string, valor: string, sub = '', destacado = false) {
  return `<div class="kpi${destacado ? ' kpi-d' : ''}"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(valor)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`
}

export function tablaBarras(titulo: string, filas: { label: string; valor: number; peso: number; extra?: string }[]) {
  return `<div class="bloque">
    <h3>${esc(titulo)}</h3>
    <table class="barras"><colgroup><col style="width:36%"><col><col style="width:30%"><col style="width:15%"></colgroup>
      <tbody>${filas.map((f) => `<tr>
        <td>${esc(f.label)}${f.extra ? `<div class="sub">${esc(f.extra)}</div>` : ''}</td>
        <td><div class="barra"><div style="width:${Math.max(1, Math.min(100, f.peso * 100)).toFixed(1)}%"></div></div></td>
        <td class="n">${esc(num(f.valor))}</td><td class="n b">${esc(pct(f.peso))}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`
}

export function graficoBarras(etiquetas: string[], montos: number[]) {
  const W = 1000, H = 190, padL = 70, padB = 26, padT = 22
  const max = Math.max(...montos, 1)
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw)!
  const tope = paso * 4
  const ancho = (W - padL) / Math.max(1, montos.length)
  const y = (v: number) => padT + (1 - v / tope) * (H - padT - padB)
  const lineas = [0, 1, 2, 3, 4].map((i) => {
    const v = paso * i
    return `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${i ? '#EEF1F3' : BORDE}"/>
      <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${GRIS}">${num(v, 0)}</text>`
  }).join('')
  const barras = montos.map((v, i) => {
    const x = padL + i * ancho + ancho * 0.2
    const h = (H - padT - padB) * (v / tope)
    return `<rect x="${x}" y="${y(v)}" width="${ancho * 0.6}" height="${Math.max(0, h)}" fill="${VERDE}" rx="2"/>
      ${v ? `<text x="${x + ancho * 0.3}" y="${y(v) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${NAVY}">${num(v, 0)}</text>` : ''}
      <text x="${x + ancho * 0.3}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${GRIS}">${esc(etiquetas[i])}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" font-family="Arial, Helvetica, sans-serif">${lineas}${barras}</svg>`
}

// ─── Documento ──────────────────────────────────────────────────────────────

/** Documento completo con los estilos comunes; `cuerpo` son las secciones. */
export function documento(titulo: string, cuerpo: string, estilosExtra = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
  @page { size: A4 landscape; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, 'Liberation Sans', sans-serif; color: #1F2933; font-size: 8.4pt; line-height: 1.35;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  section.nueva { break-before: page; }
  h1 { font-size: 24pt; margin: 1mm 0 1mm; color: ${NAVY}; letter-spacing: 0.2px; }
  h2 { font-size: 12.5pt; color: ${NAVY}; margin: 0 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid ${NAVY}; break-after: avoid; }
  .h2-sub { font-size: 9pt; font-weight: 400; color: ${GRIS}; }
  h3 { font-size: 9pt; color: ${NAVY}; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: 0.5px; break-after: avoid; }
  .portada { margin-bottom: 4mm; }
  .eyebrow { font-size: 9pt; color: #2E7D52; text-transform: uppercase; letter-spacing: 3px; font-weight: 700; }
  .fecha { font-size: 10pt; color: ${GRIS}; }
  .kpis { display: flex; gap: 3mm; margin-bottom: 5mm; break-inside: avoid; }
  .kpi { flex: 1; border: 1px solid ${BORDE}; border-radius: 2mm; padding: 3mm 3.5mm; }
  .kpi-d { background: ${NAVY}; border-color: ${NAVY}; color: #fff; }
  .kpi-l { font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.5px; color: ${GRIS}; }
  .kpi-d .kpi-l, .kpi-d .kpi-s { color: #CBD5E1; }
  .kpi-v { font-size: 14pt; font-weight: 700; margin-top: 1mm; white-space: nowrap; }
  .kpi-s { font-size: 7.2pt; color: ${GRIS_CLARO}; margin-top: 0.5mm; }
  .tres { display: flex; gap: 4mm; margin-bottom: 4mm; align-items: stretch; }
  .tres > * { flex: 1; min-width: 0; }
  .top td { padding: 1.3mm 1mm; border-bottom: 1px solid #EEF1F3; vertical-align: middle; }
  .top tr:last-child td { border-bottom: 0; }
  .gris { color: ${GRIS}; }
  .bloque { break-inside: avoid; border: 1px solid ${BORDE}; border-radius: 2mm; padding: 3mm 3.5mm; }
  .grafico { margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  tr, tbody.junto { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  .barras td { padding: 1.3mm 1mm; border-bottom: 1px solid #EEF1F3; vertical-align: middle; overflow-wrap: anywhere; }
  .barras tr:last-child td { border-bottom: 0; }
  .barra { height: 2.2mm; background: #EEF1F3; border-radius: 1mm; overflow: hidden; }
  .barra > div { height: 100%; background: ${VERDE}; }
  .datos th { background: ${NAVY}; color: #fff; font-size: 7.4pt; font-weight: 700; text-align: left; padding: 1.8mm 1.4mm; vertical-align: bottom; }
  .datos td { padding: 1.5mm 1.4mm; border-bottom: 1px solid #EEF1F3; vertical-align: top; overflow-wrap: anywhere; }
  .datos tbody tr:nth-child(even) td { background: #FAFBFC; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .datos th.n { text-align: right; }
  .b { font-weight: 700; }
  .inst .nom { font-weight: 700; color: #111827; }
  .sub { font-size: 7pt; color: ${GRIS}; font-weight: 400; }
  tr.grupo td { background: ${FONDO} !important; color: ${NAVY}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; font-size: 7.8pt; padding-top: 2mm; border-bottom: 1px solid ${BORDE}; }
  tr.grupo span { text-transform: none; letter-spacing: 0; color: ${GRIS}; font-weight: 400; }
  tr.grupo { break-after: avoid; }
  tr.subtotal td { background: #EEF2F1 !important; font-weight: 700; color: #374151; border-bottom: 1.5px solid ${BORDE}; }
  tr.subtotal td:first-child, tr.total td:first-child { text-align: right; }
  tr.subtotal.primero td:first-child { text-align: left; }
  .renta td { padding-top: 1.1mm; padding-bottom: 1.1mm; }
  tr.total td { background: ${NAVY} !important; color: #fff !important; font-weight: 700; padding: 2mm 1.4mm; }
  .renta td, .renta th { padding-left: 1mm; padding-right: 1mm; }
  .resumen-mov { width: 55%; margin-bottom: 5mm; }
  .mov td { font-size: 7.8pt; }
  .nota { font-size: 7.4pt; color: ${GRIS}; margin: 2.5mm 0 0; break-inside: avoid; }
  .cierre { break-inside: avoid; margin-top: 6mm; padding-top: 3mm; border-top: 1px solid ${BORDE}; }
  .cierre p { font-size: 7.4pt; color: ${GRIS}; margin: 0 0 3mm; text-align: justify; }
  .cierre .legal { font-size: 6.6pt; }
  ${estilosExtra}
  </style></head><body>${cuerpo}</body></html>`
}

/** Portada: se imprime aparte, sin el encabezado ni el pie de las demás hojas, y se une adelante (imprimir.ts). */
export function htmlPortada(o: { titulo: string; cliente: string; fecha: string; pershing: boolean; morgan: boolean }) {
  const nombre = o.cliente.trim() || o.titulo
  const { pershing, morgan } = o
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, 'Liberation Sans', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { width: 297mm; height: 210mm; padding: 14mm 16mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .arriba { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${NAVY}; padding-bottom: 3mm; }
  .custodios { display: flex; align-items: center; gap: 6mm; }
  .sep { width: 1px; height: 11mm; background: ${BORDE}; }
  .ms { font-family: Georgia, 'Times New Roman', serif; font-size: 19pt; font-weight: 700; color: #002B51; letter-spacing: 0.3px; white-space: nowrap; }
  .centro { text-align: center; }
  .eyebrow { font-size: 13pt; color: #2E7D52; text-transform: uppercase; letter-spacing: 8px; font-weight: 700; }
  .linea { width: 42mm; height: 2.5px; background: ${VERDE}; margin: 7mm auto; }
  h1 { font-size: 38pt; font-weight: 800; color: #111827; margin: 0; letter-spacing: 0.3px; }
  .fecha { font-size: 13pt; color: ${GRIS}; margin-top: 4mm; letter-spacing: 0.5px; }
  .abajo { text-align: center; border-top: 1px solid ${BORDE}; padding-top: 5mm; font-size: 9pt; color: ${GRIS_CLARO}; text-transform: uppercase; letter-spacing: 1.5px; }
  </style></head><body><div class="hoja">
    <div class="arriba">
      <img src="data:image/png;base64,${ROBLE_LOGO_BASE64}" style="height:22mm">
      <div class="custodios">
        ${pershing ? `<img src="data:image/png;base64,${BNY_LOGO_BASE64}" style="height:8mm">` : ''}
        ${pershing && morgan ? '<span class="sep"></span>' : ''}
        ${morgan ? '<span class="ms">Morgan Stanley</span>' : ''}
      </div>
    </div>
    <div class="centro">
      <div class="eyebrow">${esc(o.titulo)}</div>
      <div class="linea"></div>
      <h1>${esc(nombre)}</h1>
      <div class="fecha">Valuación al ${esc(fechaLarga(o.fecha))}</div>
    </div>
    <div class="abajo">Documento confidencial · Preparado exclusivamente para ${esc(nombre)}</div>
  </div></body></html>`
}

/** Encabezado de cada hoja (plantilla de Chromium: márgenes propios y estilos en línea). */
export function encabezadoPdf(titulo: string, cliente: string, fecha: string) {
  return `<div style="width:100%;padding:0 12mm;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid ${NAVY};padding-bottom:2mm">
      <img src="data:image/png;base64,${ROBLE_LOGO_BASE64}" style="height:9mm">
      <div style="text-align:right">
        <div style="font-size:10px;font-weight:700;color:${NAVY};letter-spacing:1px;text-transform:uppercase">${esc(titulo)}</div>
        <div style="font-size:9px;color:${GRIS}">${esc(cliente.trim() || '')}${cliente.trim() ? ' · ' : ''}al ${esc(ddmmyyyy(fecha))}</div>
      </div>
    </div>
  </div>`
}

export function piePdf(cliente: string) {
  return `<div style="width:100%;padding:0 12mm;font-family:Arial,Helvetica,sans-serif;font-size:8px;color:${GRIS}">
    <div style="display:flex;justify-content:space-between;border-top:1px solid ${BORDE};padding-top:1.5mm">
      <span><b style="color:${VERDE}">ROBLE CAPITAL WEALTH MANAGEMENT</b> · Documento confidencial${cliente.trim() ? ` · Preparado exclusivamente para ${esc(cliente.trim())}` : ''}</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>
  </div>`
}

/** Opciones de page.pdf() de Playwright que usa este documento. */
export const OPCIONES_PDF = {
  format: 'A4' as const,
  landscape: true,
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: '22mm', bottom: '15mm', left: '12mm', right: '12mm' },
}

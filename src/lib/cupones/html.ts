// Documento "Calendario de Cupones" como HTML autocontenido (A4 apaisado).
// La misma página se muestra en pantalla (iframe) y se imprime a PDF con el
// Chromium headless, así lo que ve el asesor es lo que se descarga.
//
// Para que entre en una sola hoja: la densidad (alto de fila y letra) depende
// de la cantidad de bonos, y un script al final mide la hoja y la achica con
// `zoom` hasta MIN_ZOOM. Si aun así no entra (más de ~25 bonos) pasa a varias
// hojas (data-fit="multi"): la tabla continúa con el encabezado repetido.

import { ROBLE_LOGO_BASE64 } from '@/lib/icheAcciones/logoBase64'
import {
  DISCLAIMER, FOOTER_LEFT, MESES, bondSubline, footerRight, longDate, maturityLabel, money, nextPaymentLabel,
  notesText, pct, payDatesLabel, summarize,
} from './calc'
import type { CouponCalendar } from './types'

const NAVY = '#1B2A38'
const GRAY = '#8A949E'
const MIN_ZOOM = 0.8

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Fila, letra y alto del gráfico según la cantidad de bonos. */
function density(n: number) {
  if (n <= 8) return { rowH: 8, fs: 6.6, m: 5.8, sub: 5, chartH: 40 }
  if (n <= 12) return { rowH: 6.4, fs: 6.3, m: 5.7, sub: 4.9, chartH: 36 }
  if (n <= 18) return { rowH: 5.1, fs: 5.9, m: 5.5, sub: 4.7, chartH: 32 }
  return { rowH: 4.3, fs: 5.4, m: 5.2, sub: 4.4, chartH: 28 }
}

function barChart(totals: number[], heightMm: number) {
  // El gráfico ocupa ~148 mm de ancho: el alto del viewBox respeta esa proporción
  // para que el texto no se deforme.
  const W = 520, H = Math.round((W * heightMm) / 148), padL = 46, padB = 18, padT = 14
  const max = Math.max(...totals, 1)
  // Escala "linda": 1, 2, 2.5 o 5 × 10^n, con 4 divisiones.
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw)!
  const top = step * 4
  const plotH = H - padB - padT
  const bw = (W - padL) / 12
  const y = (v: number) => padT + plotH - (v / top) * plotH
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = step * i
      return `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E3E7EB" stroke-width="0.8"/>` +
        `<text x="${padL - 5}" y="${y(v) + 3}" text-anchor="end" font-size="8.5" fill="${GRAY}">${v >= 1000 ? `${(v / 1000).toLocaleString('en-US')}k` : v}</text>`
    })
    .join('')
  const bars = totals
    .map((v, i) => {
      const x = padL + i * bw + bw * 0.18
      const w = bw * 0.64
      const label = v > 0 ? `<text x="${x + w / 2}" y="${y(v) - 3}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${NAVY}">${Math.round(v).toLocaleString('en-US')}</text>` : ''
      return `${v > 0 ? `<rect x="${x}" y="${y(v)}" width="${w}" height="${padT + plotH - y(v)}" fill="${NAVY}" rx="1"/>` : ''}${label}` +
        `<text x="${x + w / 2}" y="${H - 5}" text-anchor="middle" font-size="8.5" fill="${GRAY}">${MESES[i].toUpperCase()}</text>`
    })
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${bars}</svg>`
}

export function renderCalendarHtml(cal: CouponCalendar): string {
  const s = summarize(cal)
  const d = density(cal.bonds.length)
  const ccy = cal.baseCcy || 'USD'

  const head = ['BONO', 'VENCIMIENTO', 'CUPÓN', 'FECHAS DE PAGO', 'VALOR NOMINAL', ...MESES.map((m) => m.toUpperCase()), 'TOTAL ANUAL']
  const rows = cal.bonds
    .map((b, i) => {
      const months = s.rows[i]
      const total = months.reduce((t, v) => t + v, 0)
      return `<tr class="${i % 2 ? 'alt' : ''}">
        <td class="bono"><b>${esc(b.issuer)}</b><span>${esc(bondSubline(b))}</span></td>
        <td class="c">${esc(maturityLabel(b))}</td>
        <td class="c">${pct(b.couponRate, 3)}</td>
        <td class="c">${esc(payDatesLabel(b))}</td>
        <td class="r b">${money(b.nominal)}</td>
        ${months.map((v) => `<td class="r m${v ? '' : ' dash'}">${money(v)}</td>`).join('')}
        <td class="r b tot">${money(total)}</td>
      </tr>`
    })
    .join('')

  const resumen: [string, string][] = [
    ['Renta anual estimada', money(s.annual, false)],
    ['Promedio mensual', money(s.monthlyAverage, false)],
    ['Rendimiento corriente sobre nominal', pct(s.currentYield)],
    ['Meses con cobro', String(s.monthsWithPayment)],
    ['Mayor cobro mensual', money(s.maxMonth, false)],
    ['Próximo cobro', nextPaymentLabel(s.next, ccy)],
  ]

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Calendario de Cupones · ${esc(cal.clientName)}</title>
<style>
@page { size: A4 landscape; margin: 9mm 10mm 8mm }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: #fff }
body { font-family: Arial, Helvetica, 'Liberation Sans', sans-serif; color: #1F2933; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { width: 297mm; height: 210mm; padding: 9mm 10mm 8mm; overflow: hidden }
@media print { .sheet { width: 277mm; height: 193mm; padding: 0 } }
body[data-fit="multi"] .sheet { height: auto; overflow: visible }
body[data-fit="multi"] .page { min-height: 0 }
body[data-fit="multi"] .grid tr, body[data-fit="multi"] .bottom, body[data-fit="multi"] .notes { break-inside: avoid }
body[data-fit="multi"] footer { margin-top: 4mm }
.page { min-height: 193mm; display: flex; flex-direction: column; transform-origin: top left }
header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 2.2mm; border-bottom: 1.1mm solid ${NAVY} }
h1 { font-size: 17pt; font-weight: 700; color: ${NAVY}; letter-spacing: -0.2pt }
.subt { font-size: 6.8pt; color: ${GRAY}; margin-top: 1mm; letter-spacing: 0.3pt }
header img { height: 15mm; margin-bottom: -1.5mm; object-fit: contain }
.strip { display: flex; justify-content: space-between; gap: 4mm; background: #F5F7F9; margin-top: 3.5mm; padding: 2.6mm 3mm; font-size: 8.4pt }
.strip span { white-space: nowrap }
.strip small { font-size: 6.4pt; color: ${GRAY}; margin-right: 1.2mm }
.strip b { color: ${NAVY} }
h2 { font-size: 7.4pt; font-weight: 700; color: ${NAVY}; margin: 3.6mm 0 1.4mm; letter-spacing: 0.2pt }
table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${d.fs}pt }
.grid th { background: ${NAVY}; color: #fff; font-weight: 700; font-size: ${Math.min(d.fs - 0.4, 5.9)}pt; padding: 1.5mm 0.5mm; text-align: center; border-right: 0.3mm solid #fff }
.grid th:first-child { text-align: left; padding-left: 1.5mm }
.grid td { height: ${d.rowH}mm; padding: 0 0.8mm; border-bottom: 0.25mm solid #E3E7EB; white-space: nowrap; overflow: hidden }
.grid tr.alt td { background: #FAFBFC }
.grid td.bono { padding-left: 1.5mm; line-height: 1.2 }
.grid td.bono b { display: block; color: ${NAVY}; overflow: hidden; text-overflow: ellipsis }
.grid td.bono span { display: block; font-size: ${d.sub}pt; font-weight: 700; color: #4A5560; overflow: hidden; text-overflow: ellipsis }
.c { text-align: center } .r { text-align: right } .b { font-weight: 700 }
.dash { color: ${GRAY} }
.grid td.m { font-size: ${d.m}pt; padding: 0 0.5mm }
.grid td.tot { background: #FDF3C7 !important; color: ${NAVY} }
.grid tr.total td { background: ${NAVY}; color: #fff; font-weight: 700; height: ${Math.max(d.rowH * 0.8, 5)}mm; border-top: 0.8mm solid #fff }
.grid tr.total td.lbl { background: #78848E }
.grid tr.total td.tot { background: #F4D96B !important; color: ${NAVY} }
.grid tr.pct td { font-size: ${d.sub}pt; color: ${GRAY}; font-style: italic; border: 0; height: 4mm }
.bottom { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 8mm; margin-top: 1mm }
table.res { width: 100%; border-collapse: collapse; font-size: 7.6pt }
.res td { border: 0.25mm solid #E3E7EB; padding: 1.15mm 2mm }
.res td:first-child { background: #F5F7F9; color: #4A5560; width: 46% }
.res td:last-child { text-align: right; font-weight: 700; color: ${NAVY} }
.notes { font-size: 6.3pt; color: #4A5560; line-height: 1.35; margin-top: 3mm }
.disc { font-size: 5.3pt; color: ${GRAY}; line-height: 1.35; margin-top: 2mm }
footer { margin-top: auto; padding-top: 2mm; border-top: 0.3mm solid #D5DAE0; display: flex; justify-content: space-between; align-items: baseline }
footer b { font-size: 6.8pt; color: ${NAVY}; letter-spacing: 0.3pt }
footer span { font-size: 5.8pt; color: ${GRAY} }
</style></head>
<body data-fit="pending"><div class="sheet"><div class="page">
<header>
  <div><h1>Calendario de Cupones</h1><div class="subt">CASH FLOW PROJECTION · DOCUMENTO CONFIDENCIAL</div></div>
  <img src="data:image/png;base64,${ROBLE_LOGO_BASE64}" alt="Roble Capital">
</header>
<div class="strip">
  <span><small>CLIENTE:</small><b>${esc(cal.clientName)}</b></span>
  <span><small>ASESOR:</small><b>${esc(cal.advisor)}</b></span>
  <span><small>FECHA:</small><b>${esc(longDate(cal.docDate))}</b></span>
  <span><small>NOMINAL:</small><b>${money(s.nominal, false)}</b></span>
  <span><small>RENTA ANUAL:</small><b>${money(s.annual, false)}</b></span>
  <span><small>RTO. CORRIENTE:</small><b>${pct(s.currentYield)}</b></span>
</div>
<h2>BONOS · FLUJO DE CUPONES (${esc(ccy)})</h2>
<table class="grid">
  <colgroup><col style="width:52mm"><col style="width:18mm"><col style="width:11mm"><col style="width:19.5mm"><col style="width:17mm">${'<col>'.repeat(12)}<col style="width:16.5mm"></colgroup>
  <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows}
    <tr class="total"><td class="lbl">TOTAL</td><td class="lbl"></td><td class="lbl"></td><td class="lbl"></td>
      <td class="r">${money(s.nominal, false)}</td>${s.monthTotals.map((v) => `<td class="r m">${money(v)}</td>`).join('')}<td class="r tot">${money(s.annual, false)}</td></tr>
    <tr class="pct"><td>% de la renta anual</td><td></td><td></td><td></td><td></td>
      ${s.monthTotals.map((v) => `<td class="r">${s.annual && v ? pct(v / s.annual, 1) : '-'}</td>`).join('')}<td class="r">${s.annual ? '100.0%' : '-'}</td></tr>
  </tbody>
</table>
<div class="bottom">
  <div><h2>RESUMEN</h2><table class="res">${resumen.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
  <div><h2>FLUJO MENSUAL DE CUPONES (${esc(ccy)})</h2>${barChart(s.monthTotals, d.chartH)}</div>
</div>
<p class="notes">${esc(notesText(cal))}</p>
<p class="disc">${esc(DISCLAIMER)}</p>
<footer><b>${FOOTER_LEFT}</b><span>${esc(footerRight(cal.clientName))}</span></footer>
</div></div>
<script>
(function () {
  var page = document.querySelector('.page'), sheet = document.querySelector('.sheet');
  var cs = getComputedStyle(sheet);
  var avail = sheet.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  var over = function () { return sheet.scrollHeight > sheet.clientHeight + 1; };
  var zoom = 1;
  if (over()) {
    page.style.minHeight = '0';
    zoom = Math.max(${MIN_ZOOM}, Math.floor((avail / page.scrollHeight) * 1000) / 1000);
    page.style.zoom = String(zoom);
  }
  // Ni achicada entra: varias hojas, la tabla sigue en la siguiente con el encabezado repetido.
  if (over()) {
    zoom = 1;
    page.style.zoom = '';
    document.body.dataset.fit = 'multi';
  } else {
    document.body.dataset.fit = 'ok';
  }
  document.body.dataset.zoom = String(zoom);
})();
</script>
</body></html>`
}

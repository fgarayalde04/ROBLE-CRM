// Posición Consolidada como documento para el cliente, con formato de estado
// de cuenta: HTML autocontenido (A4 apaisado) que el Chromium headless imprime
// a PDF. La paginación la hace el navegador: las filas nunca se parten entre
// hojas, el encabezado de cada tabla se repite y cada hoja lleva el mismo
// encabezado y pie (ver encabezadoPdf / piePdf). No incluye números de cuenta
// ni identificadores.

import { ROBLE_LOGO_BASE64 } from '@/lib/icheAcciones/logoBase64'
import { ROBLE_DISCLAIMER } from '@/lib/disclaimers'
import { BNY_LOGO_BASE64 } from './logosBase64'
import { categoriaMovimiento, ddmmyyyy, mesCorto, textoCompras, type LineaPosicion, type Reporte } from './calc'
import { CLASES, type Banco, type Movimiento } from './types'

const NAVY = '#1B2A38'
const VERDE = '#1B3A2B'
const GRIS = '#6B7280'
const GRIS_CLARO = '#9CA3AF'
const BORDE = '#E2E8F0'
const FONDO = '#F5F7F9'
const GANANCIA = '#15803D'
const PERDIDA = '#B91C1C'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LARGOS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`

function num(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return n < 0 ? `-${s}` : s
}
const usd = (n: number, dec = 2) => `USD ${num(n, dec)}`
const pct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`
const signo = (n: number) => (n > 0 ? '+' : '')
const colorRes = (n: number | null) => (n == null ? GRIS : n < 0 ? PERDIDA : n > 0 ? GANANCIA : GRIS)
const custodio = (b: Banco) => (b === 'Pershing' ? 'Pershing' : 'Morgan Stanley')

// ─── Textos ─────────────────────────────────────────────────────────────────

/** Línea de detalle: "Cupón 6.125% · Vto. 21/01/2031 · Compra 13/10/2026" (sin CUSIP ni cuenta). */
function detalleBono(l: LineaPosicion) {
  const partes: string[] = []
  if (l.clase === 'Renta fija') {
    partes.push(l.tasa != null ? `Cupón ${(l.tasa * 100).toFixed(3)}%` : 'Cupón s/d')
    partes.push(l.vencimiento ? `Vto. ${ddmmyyyy(l.vencimiento)}` : l.perpetuo ? 'Perpetuo' : 'Vto. s/d')
  }
  const compras = textoCompras(l.fechasCompra)
  if (compras) partes.push(compras)
  return partes.join(' · ')
}

const TIPO_MOVIMIENTO: Record<string, string> = {
  Compras: 'Compra',
  'Ventas y vencimientos': 'Venta / rescate',
  'Cupones e intereses': 'Cupón / interés',
  Dividendos: 'Dividendo',
  Transferencias: 'Transferencia',
  'Comisiones y gastos': 'Comisión / gasto',
  Impuestos: 'Impuesto',
  Cancelaciones: 'Cancelación',
  'Money market': 'Money market',
  Otros: 'Otro',
}

function titulo(s: string) {
  return s.toLowerCase().replace(/[a-z0-9.&']+/g, (w, off: number) => {
    const base = w.replace(/\./g, '').toUpperCase()
    if (/^(SA|SAU|BV|LLC|PLC|USD|ETF|YPF|HSBC|BBVA|MSCI|QQQ|DNCA|IBM|HP|UK|US|NA|MMF)$/.test(base)) return w.toUpperCase()
    if (off > 0 && /^(of|de|del|y|and|the)$/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  })
}

/** Descripción de un movimiento sin códigos internos ni números de cuenta. */
export function descripcionMovimiento(m: Movimiento) {
  let d = m.descripcion
    .replace(/\b(ACCT|ACCOUNT)\b\s*(ENDING IN|#|:|NO\.?)?\s*[A-Z0-9X*-]{3,}/gi, ' ')
    .replace(/\bENDING IN\s*\d+/gi, ' ')
    .replace(/\bREF(ERENCE)?\s*(NO|NUMBER)?\s*[=:#]?\s*\S+/gi, ' ')
    .replace(/\bCREATED BY\s+\S+/gi, ' ')
    .replace(/\bBENE:.*$/i, ' ')
  if (m.banco === 'Morgan Stanley') {
    d = d.split(/\s+(UNSOLICITED|SOLICITED|RATE:|CONFIRM NBR|FX RATE|USD SETTLE|AS OF DATE|PREFERENTIAL RATE|DIV PAYMENT|\(Period)/i)[0]
  } else {
    d = d
      .replace(/^\d[\d,.]*\s+/, '')
      .split(/\s+(ISIN|B\/E|REGDTD|DTD|RD \d|PD \d|CLB\b|SOLICITED|UNSOLICITED|REINVESTED|G1206E151)/i)[0]
  }
  d = d
    .replace(/\bA\/C\s*\S+/gi, ' ')
    .replace(/\bCUSIP:?\s*\S+/gi, ' ')
    // Códigos de referencia y cuentas: tokens con 4+ dígitos y 2+ letras, o 7+ dígitos seguidos.
    .replace(/\S+/g, (w) => {
      const digitos = (w.match(/\d/g) ?? []).length
      const letras = (w.match(/[A-Za-z]/g) ?? []).length
      return (digitos >= 4 && letras >= 2) || /\d{7,}/.test(w) ? ' ' : w
    })
    .replace(/\s+[-:]\s*(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return d ? titulo(d) : TIPO_MOVIMIENTO[categoriaMovimiento(m)]
}

// ─── Bloques ────────────────────────────────────────────────────────────────

/**
 * Filas de una tabla agrupadas en <tbody> que no se parten entre hojas: el
 * título del grupo va con sus dos primeras filas y el subtotal (o total) con
 * las dos últimas, para que nunca quede un título o un total solo en una hoja.
 */
function bloquesSinHuerfanos(encabezado: string, filas: string[], cierre: string) {
  const tb = (html: string) => `<tbody class="junto">${html}</tbody>`
  if (filas.length <= 4) return tb(encabezado + filas.join('') + cierre)
  const medio = filas.slice(2, -2).map((f) => `<tbody>${f}</tbody>`).join('')
  return tb(encabezado + filas.slice(0, 2).join('')) + medio + tb(filas.slice(-2).join('') + cierre)
}

function kpi(label: string, valor: string, sub = '', destacado = false) {
  return `<div class="kpi${destacado ? ' kpi-d' : ''}"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(valor)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`
}

function tablaBarras(titulo: string, filas: { label: string; valor: number; peso: number; extra?: string }[]) {
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

function plazos(r: Reporte) {
  const anios = (vto: string) => (Date.parse(vto) - Date.parse(r.fecha)) / (365.25 * 864e5)
  const rf = r.posiciones.filter((l) => l.clase === 'Renta fija')
  const total = rf.reduce((s, l) => s + l.total, 0)
  const tramos: [string, (l: LineaPosicion) => boolean][] = [
    ['Hasta 1 año', (l) => !!l.vencimiento && anios(l.vencimiento) <= 1],
    ['De 1 a 3 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 1 && anios(l.vencimiento) <= 3],
    ['De 3 a 5 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 3 && anios(l.vencimiento) <= 5],
    ['De 5 a 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 5 && anios(l.vencimiento) <= 10],
    ['Más de 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 10],
    ['Perpetuos / sin vencimiento', (l) => !l.vencimiento],
  ]
  return tramos
    .map(([label, f]) => {
      const valor = rf.filter(f).reduce((s, l) => s + l.total, 0)
      return { label, valor, peso: total ? valor / total : 0 }
    })
    .filter((t) => t.valor > 0)
}

function graficoRenta(r: Reporte) {
  const W = 1000, H = 190, padL = 70, padB = 26, padT = 22
  const max = Math.max(...r.renta.montos, 1)
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw)!
  const tope = paso * 4
  const ancho = (W - padL) / 12
  const y = (v: number) => padT + (1 - v / tope) * (H - padT - padB)
  const lineas = [0, 1, 2, 3, 4].map((i) => {
    const v = paso * i
    return `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${i ? '#EEF1F3' : BORDE}"/>
      <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${GRIS}">${num(v, 0)}</text>`
  }).join('')
  const barras = r.renta.montos.map((v, i) => {
    const x = padL + i * ancho + ancho * 0.2
    const h = (H - padT - padB) * (v / tope)
    return `<rect x="${x}" y="${y(v)}" width="${ancho * 0.6}" height="${Math.max(0, h)}" fill="${VERDE}" rx="2"/>
      ${v ? `<text x="${x + ancho * 0.3}" y="${y(v) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${NAVY}">${num(v, 0)}</text>` : ''}
      <text x="${x + ancho * 0.3}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${GRIS}">${esc(mesCorto(r.renta.meses[i]))}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" font-family="Arial, Helvetica, sans-serif">${lineas}${barras}</svg>`
}

// ─── Documento ──────────────────────────────────────────────────────────────

export interface OpcionesDocumento {
  cliente: string
  incluirMovimientos: boolean
}

export function htmlEstadoCuenta(r: Reporte, o: OpcionesDocumento): string {
  const t = r.totales
  const cliente = o.cliente.trim() || 'Posición Consolidada'
  const efectivo = r.porClase.find((c) => c.clase === 'Efectivo')
  const hayRenta = r.renta.filas.length > 0
  const movimientos = r.movimientos.filter((m) => categoriaMovimiento(m) !== 'Money market')
  const hayMov = o.incluirMovimientos && movimientos.length > 0
  const nombrePorCusip = new Map(r.posiciones.filter((l) => l.cusip).map((l) => [`${l.banco}|${l.cusip}`, l.nombre]))

  // ── Resumen ──
  const resumen = `
  <section class="primera">
    <h2>Resumen de la cuenta <span class="h2-sub">· Valuación al ${esc(fechaLarga(r.fecha))} · Custodios: ${esc(r.bancos.map(custodio).join(' y '))}</span></h2>
    <div class="kpis">
      ${kpi('Valor total de la cuenta', usd(t.total), 'Valor de mercado + cupón corrido', true)}
      ${kpi('Valor de mercado', usd(t.valorMercado))}
      ${kpi('Cupón corrido', usd(t.cuponCorrido), 'Intereses devengados no cobrados')}
      ${kpi('Resultado no realizado', `${signo(t.resultado)}${usd(t.resultado)}`, t.costo ? `${signo(t.resultado)}${pct(t.resultado / t.costo, 2)} sobre el costo` : '')}
      ${kpi('Renta estimada 12 meses', hayRenta ? usd(r.renta.total) : '—', hayRenta ? 'Cupones y dividendos' : 'Sin calendario de cupones')}
    </div>
    <div class="tres">
      ${tablaBarras('Por clase de activo', r.porClase.map((c) => ({ label: c.clase, valor: c.total, peso: c.peso })))}
      ${tablaBarras('Por custodio', r.porBanco.map((b) => ({ label: custodio(b.banco), valor: b.total, peso: b.peso })))}
      ${plazos(r).length ? tablaBarras('Renta fija por plazo', plazos(r).map((p) => ({ ...p, label: p.label.replace(' / sin vencimiento', '') }))) : '<div></div>'}
    </div>
    <div class="bloque">
      <h3>Principales inversiones</h3>
      <table class="top"><colgroup><col style="width:46%"><col style="width:16%"><col><col style="width:13%"><col style="width:7%"></colgroup>
        <tbody>${[...r.posiciones].sort((a, b) => b.total - a.total).slice(0, 6).map((l) => `<tr>
          <td><b>${esc(l.nombre)}</b></td><td class="gris">${esc(custodio(l.banco))}</td>
          <td><div class="barra"><div style="width:${Math.max(1, l.peso * 100 / Math.max(...r.posiciones.map((x) => x.peso))).toFixed(1)}%"></div></div></td>
          <td class="n">${esc(num(l.total))}</td><td class="n b">${esc(pct(l.peso))}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${efectivo ? `<p class="nota">Liquidez disponible: ${esc(usd(efectivo.total))} (${esc(pct(efectivo.peso))} de la cuenta). Importes en USD.</p>` : ''}
  </section>`

  // ── Posiciones ──
  const filaPosicion = (l: LineaPosicion) => {
    const resPct = l.resultado != null && l.costo ? l.resultado / l.costo : null
    const det = detalleBono(l)
    return `<tr>
      <td class="inst"><div class="nom">${esc(l.nombre)}</div>${det ? `<div class="sub">${esc(det)}</div>` : ''}</td>
      <td>${esc(custodio(l.banco))}</td>
      <td class="n">${l.clase === 'Efectivo' || l.cantidad == null ? '—' : esc(num(l.cantidad, Number.isInteger(l.cantidad) ? 0 : 3))}</td>
      <td class="n">${l.precio == null || l.clase === 'Efectivo' ? '—' : esc(num(l.precio, 3))}</td>
      <td class="n">${esc(num(l.valorMercado))}</td>
      <td class="n">${l.cuponCorrido ? esc(num(l.cuponCorrido)) : '—'}</td>
      <td class="n b">${esc(num(l.total))}</td>
      <td class="n">${esc(pct(l.peso))}</td>
      <td class="n">${l.costo == null ? '—' : esc(num(l.costo))}</td>
      <td class="n" style="color:${colorRes(l.resultado)}">${l.resultado == null ? '—' : `${signo(l.resultado)}${esc(num(l.resultado))}`}${resPct != null ? `<div class="sub" style="color:${colorRes(l.resultado)}">${signo(resPct)}${esc(pct(resPct, 2))}</div>` : ''}</td>
    </tr>`
  }
  const clasesConDatos = CLASES.filter((c) => r.posiciones.some((l) => l.clase === c))
  const grupos = clasesConDatos.map((clase, gi) => {
    const ls = r.posiciones.filter((l) => l.clase === clase)
    const s = r.porClase.find((c) => c.clase === clase)!
    const encabezado = `<tr class="grupo"><td colspan="10">${esc(clase)} <span>· ${ls.length} ${ls.length === 1 ? 'posición' : 'posiciones'} · ${esc(pct(s.peso))} de la cuenta</span></td></tr>`
    const subtotal = `<tr class="subtotal"><td colspan="4">Subtotal ${esc(clase.toLowerCase())}</td>
      <td class="n">${esc(num(s.valorMercado))}</td><td class="n">${s.cuponCorrido ? esc(num(s.cuponCorrido)) : '—'}</td>
      <td class="n">${esc(num(s.total))}</td><td class="n">${esc(pct(s.peso))}</td>
      <td class="n">${s.costo ? esc(num(s.costo)) : '—'}</td><td class="n" style="color:${colorRes(s.resultado)}">${s.costo ? `${signo(s.resultado)}${esc(num(s.resultado))}` : '—'}</td></tr>`
    const total = gi === clasesConDatos.length - 1 ? `<tr class="total"><td colspan="4">Total de la cuenta</td>
      <td class="n">${esc(num(t.valorMercado))}</td><td class="n">${esc(num(t.cuponCorrido))}</td><td class="n">${esc(num(t.total))}</td>
      <td class="n">100.0%</td><td class="n">${esc(num(t.costo))}</td><td class="n">${signo(t.resultado)}${esc(num(t.resultado))}</td></tr>` : ''
    return bloquesSinHuerfanos(encabezado, ls.map(filaPosicion), subtotal + total)
  }).join('')

  const posiciones = `
  <section class="nueva">
    <h2>Detalle de posiciones</h2>
    <table class="datos">
      <colgroup>
        <col style="width:27%"><col style="width:9%"><col style="width:8%"><col style="width:6%"><col style="width:9.5%">
        <col style="width:8%"><col style="width:9.5%"><col style="width:5%"><col style="width:9%"><col style="width:9%">
      </colgroup>
      <thead><tr>
        <th>Instrumento</th><th>Custodio</th><th class="n">Nominal / cant.</th><th class="n">Precio</th><th class="n">Valor de mercado</th>
        <th class="n">Cupón corrido</th><th class="n">Valor total</th><th class="n">%</th><th class="n">Costo</th><th class="n">Resultado</th>
      </tr></thead>
      ${grupos}
    </table>
    <p class="nota">Importes en USD. El valor total de cada posición incluye el cupón corrido: los intereses devengados desde el último pago y no cobrados al ${esc(ddmmyyyy(r.fecha))}. El precio de los bonos es cada 100 de nominal.</p>
  </section>`

  // ── Renta ──
  const renta = hayRenta ? `
  <section class="nueva">
    <h2>Renta estimada · próximos 12 meses</h2>
    <div class="kpis">
      ${kpi('Total 12 meses', usd(r.renta.total), '', true)}
      ${kpi('Cupones', usd(r.renta.cupones))}
      ${kpi('Dividendos', usd(r.renta.dividendos))}
      ${kpi('Promedio mensual', usd(r.renta.total / 12))}
    </div>
    <div class="bloque grafico"><h3>Cobros por mes</h3>${graficoRenta(r)}</div>
    <table class="datos renta">
      <colgroup><col style="width:27%">${r.renta.meses.map(() => '<col style="width:5.6%">').join('')}<col style="width:5.8%"></colgroup>
      <thead><tr><th>Instrumento</th>${r.renta.meses.map((m) => `<th class="n">${esc(mesCorto(m))}</th>`).join('')}<th class="n">Total</th></tr></thead>
      ${bloquesSinHuerfanos(
        `<tr class="subtotal primero"><td>Total por mes</td>${r.renta.montos.map((v) => `<td class="n">${v ? esc(num(v, 0)) : ''}</td>`).join('')}<td class="n">${esc(num(r.renta.total, 0))}</td></tr>`,
        r.renta.filas.map((f) => `<tr>
          <td class="inst"><div class="nom">${esc(nombrePorCusip.get(`${f.banco}|${f.cusip}`) ?? titulo(f.descripcion))}</div><div class="sub">${esc(f.clase)} · ${esc(custodio(f.banco))}</div></td>
          ${f.montos.map((v) => `<td class="n">${v ? esc(num(v, 0)) : ''}</td>`).join('')}
          <td class="n b">${esc(num(f.total, 0))}</td></tr>`),
        '',
      )}
    </table>
    <p class="nota">Flujos brutos estimados en USD, antes de impuestos. No incluye amortizaciones, vencimientos ni rescates anticipados.</p>
  </section>` : ''

  // ── Movimientos ──
  const resumenMov = r.resumenMovimientos.filter((c) => c.categoria !== 'Money market')
  const mov = hayMov ? `
  <section class="nueva">
    <h2>Movimientos del ${esc(ddmmyyyy(r.periodoMovimientos.desde))} al ${esc(ddmmyyyy(r.periodoMovimientos.hasta))}</h2>
    <table class="datos resumen-mov">
      <colgroup><col style="width:40%"><col style="width:20%"><col style="width:40%"></colgroup>
      <thead><tr><th>Concepto</th><th class="n">Operaciones</th><th class="n">Monto neto (USD)</th></tr></thead>
      <tbody>${resumenMov.map((c) => `<tr><td>${esc(c.categoria)}</td><td class="n">${c.cantidad}</td><td class="n" style="color:${colorRes(c.monto)}">${esc(num(c.monto))}</td></tr>`).join('')}</tbody>
    </table>
    <table class="datos mov">
      <colgroup><col style="width:9%"><col style="width:11%"><col style="width:13%"><col style="width:39%"><col style="width:10%"><col style="width:7%"><col style="width:11%"></colgroup>
      <thead><tr><th>Fecha</th><th>Custodio</th><th>Tipo</th><th>Descripción</th><th class="n">Cantidad</th><th class="n">Precio</th><th class="n">Monto (USD)</th></tr></thead>
      <tbody>${movimientos.map((m) => `<tr>
        <td>${esc(ddmmyyyy(m.fecha))}</td><td>${esc(custodio(m.banco))}</td><td>${esc(TIPO_MOVIMIENTO[categoriaMovimiento(m)])}</td>
        <td>${esc(descripcionMovimiento(m))}</td>
        <td class="n">${m.cantidad == null ? '' : esc(num(m.cantidad, Number.isInteger(m.cantidad) ? 0 : 3))}</td>
        <td class="n">${m.precio == null ? '' : esc(num(m.precio, 3))}</td>
        <td class="n" style="color:${colorRes(m.monto)}">${m.monto == null ? '' : esc(num(m.monto))}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="nota">No se detallan los movimientos automáticos del fondo de liquidez (money market).</p>
  </section>` : ''

  const cierre = `
  <section class="cierre">
    <h3>Notas</h3>
    <p>Información preparada por Roble Capital a partir de los reportes de ${esc(r.bancos.map(custodio).join(' y '))}. No reemplaza los estados de cuenta oficiales de cada custodio: ante cualquier diferencia, valen estos últimos. El cupón corrido es una estimación de los intereses devengados y no cobrados a la fecha de valuación.</p>
    <h3>Disclosures</h3>
    <p class="legal">${esc(ROBLE_DISCLAIMER)}</p>
  </section>`

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(cliente)}</title><style>
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
  </style></head><body>
  ${resumen}${posiciones}${renta}${mov}${cierre}
  </body></html>`
}

/**
 * Portada: se imprime aparte, sin el encabezado ni el pie de las demás hojas,
 * y se une adelante del documento (pdf.ts).
 */
export function htmlPortada(r: Reporte, cliente: string) {
  const nombre = cliente.trim() || 'Posición Consolidada'
  const pershing = r.bancos.includes('Pershing')
  const morgan = r.bancos.includes('Morgan Stanley')
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
      <div class="eyebrow">Posición consolidada</div>
      <div class="linea"></div>
      <h1>${esc(nombre)}</h1>
      <div class="fecha">Valuación al ${esc(fechaLarga(r.fecha))}</div>
    </div>
    <div class="abajo">Documento confidencial · Preparado exclusivamente para ${esc(nombre)}</div>
  </div></body></html>`
}

/** Encabezado de cada hoja (plantilla de Chromium: márgenes propios y estilos en línea). */
export function encabezadoPdf(r: Reporte, cliente: string) {
  return `<div style="width:100%;padding:0 12mm;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid ${NAVY};padding-bottom:2mm">
      <img src="data:image/png;base64,${ROBLE_LOGO_BASE64}" style="height:9mm">
      <div style="text-align:right">
        <div style="font-size:10px;font-weight:700;color:${NAVY};letter-spacing:1px;text-transform:uppercase">Posición consolidada</div>
        <div style="font-size:9px;color:${GRIS}">${esc(cliente.trim() || '')}${cliente.trim() ? ' · ' : ''}al ${esc(ddmmyyyy(r.fecha))}</div>
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

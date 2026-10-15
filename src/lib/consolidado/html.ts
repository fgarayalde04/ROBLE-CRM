// Posición Consolidada como documento para el cliente, con formato de estado
// de cuenta: HTML autocontenido (A4 apaisado) que el Chromium headless imprime
// a PDF. La paginación la hace el navegador: las filas nunca se parten entre
// hojas, el encabezado de cada tabla se repite y cada hoja lleva el mismo
// encabezado y pie (ver encabezadoPdf / piePdf). No incluye números de cuenta
// ni identificadores.

import { ROBLE_DISCLAIMER } from '@/lib/disclaimers'
import {
  BORDE, GRIS, NAVY, bloquesSinHuerfanos, colorRes, documento, esc, fechaLarga, graficoBarras, kpi, num, pct, signo, tablaBarras, usd,
} from '@/lib/estadoCuenta/base'
import { categoriaMovimiento, ddmmyyyy, mesCorto, textoCompras, type LineaPosicion, type Reporte } from './calc'
import { CLASES, type Banco, type Movimiento } from './types'

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

// ─── Documento ──────────────────────────────────────────────────────────────

export interface OpcionesDocumento {
  cliente: string
  incluirMovimientos: boolean
}

/** Custodio de una línea; con varias cuentas en el mismo banco, "Pershing 1", "Pershing 2" o el nombre que se le puso. */
const cuentaTxt = (x: { banco: Banco; etiquetaCuenta: string }) => (x.etiquetaCuenta === x.banco ? custodio(x.banco) : x.etiquetaCuenta)

export function htmlEstadoCuenta(r: Reporte, o: OpcionesDocumento): string {
  const t = r.totales
  const cliente = o.cliente.trim() || 'Reporte de portafolio'
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
      ${tablaBarras(r.porCuenta.length > r.porBanco.length ? 'Por cuenta' : 'Por custodio', r.porCuenta.map((b) => ({ label: cuentaTxt({ banco: b.banco, etiquetaCuenta: b.etiqueta }), valor: b.total, peso: b.peso })))}
      ${plazos(r).length ? tablaBarras('Renta fija por plazo', plazos(r).map((p) => ({ ...p, label: p.label.replace(' / sin vencimiento', '') }))) : '<div></div>'}
    </div>
    <div class="bloque">
      <h3>Principales inversiones</h3>
      <table class="top"><colgroup><col style="width:46%"><col style="width:16%"><col><col style="width:13%"><col style="width:7%"></colgroup>
        <tbody>${[...r.posiciones].sort((a, b) => b.total - a.total).slice(0, 6).map((l) => `<tr>
          <td><b>${esc(l.nombre)}</b></td><td class="gris">${esc(cuentaTxt(l))}</td>
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
      <td>${esc(cuentaTxt(l))}</td>
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
    <div class="bloque grafico"><h3>Cobros por mes</h3>${graficoBarras(r.renta.meses.map(mesCorto), r.renta.montos)}</div>
    <table class="datos renta">
      <colgroup><col style="width:27%">${r.renta.meses.map(() => '<col style="width:5.6%">').join('')}<col style="width:5.8%"></colgroup>
      <thead><tr><th>Instrumento</th>${r.renta.meses.map((m) => `<th class="n">${esc(mesCorto(m))}</th>`).join('')}<th class="n">Total</th></tr></thead>
      ${bloquesSinHuerfanos(
        `<tr class="subtotal primero"><td>Total por mes</td>${r.renta.montos.map((v) => `<td class="n">${v ? esc(num(v, 0)) : ''}</td>`).join('')}<td class="n">${esc(num(r.renta.total, 0))}</td></tr>`,
        r.renta.filas.map((f) => `<tr>
          <td class="inst"><div class="nom">${esc(nombrePorCusip.get(`${f.banco}|${f.cusip}`) ?? titulo(f.descripcion))}</div><div class="sub">${esc(f.clase)} · ${esc(cuentaTxt(f))}</div></td>
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
        <td>${esc(ddmmyyyy(m.fecha))}</td><td>${esc(cuentaTxt(m))}</td><td>${esc(TIPO_MOVIMIENTO[categoriaMovimiento(m)])}</td>
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

  return documento(cliente, `
  ${resumen}${posiciones}${renta}${mov}${cierre}
`)
}

// Reporte de Portafolio para el cliente con el formato de estado de cuenta
// (el mismo de la Posición Consolidada, ver lib/estadoCuenta). La pantalla de
// la cuenta arma estos datos con los mismos cálculos que muestra y el servidor
// los imprime con el Chromium headless. Sin números de cuenta ni identificadores.

import { ROBLE_DISCLAIMER } from '@/lib/disclaimers'
import {
  GRIS, NAVY, VERDE, bloquesSinHuerfanos, colorRes, ddmmyyyy, documento, encabezadoPdf, esc, fechaLarga, graficoBarras, htmlPortada, kpi, num,
  pct, piePdf, signo, tablaBarras, usd,
} from '@/lib/estadoCuenta/base'
import type { PartesPdf } from '@/lib/estadoCuenta/imprimir'

export interface FilaPdf {
  nombre: string
  /** "Cupón 7.625% · Vto. 03/11/2030 · Compra 31/07/2026" */
  detalle: string
  custodio: string | null
  cantidad: number | null
  precio: number | null
  valorMercado: number
  cuponCorrido: number
  /** Sobre el valor de mercado de la cuenta (0–1). */
  peso: number
  costo: number | null
  resultado: number | null
}

export interface DatosPdfPortafolio {
  cliente: string
  fecha: string // YYYY-MM-DD
  custodios: string[]
  consolidado: boolean
  secciones: { performance: boolean; composicion: boolean; holdings: boolean; income: boolean; dividendos: boolean }
  totales: { valorMercado: number; cuponCorrido: number; costo: number | null; resultado: number | null }
  performance: null | {
    rentabilidades: { label: string; valor: number | null }[] // en % (5.2 = 5.2%)
    cambios: { label: string; valor: number }[]
    valorInicial: number | null
    fechaInicio: string | null
    serie: { fecha: string; valor: number; label?: string }[]
    serieDePerformance: boolean
  }
  composicion: {
    clases: { label: string; valor: number; peso: number }[]
    rentaFija: { label: string; valor: number; peso: number }[]
    monedas: { label: string; valor: number; peso: number }[]
    custodios: { label: string; valor: number; peso: number }[]
    liquidez: { valor: number; peso: number }
    rendimientoIncome: number | null // % cargado a mano
  }
  grupos: { clase: string; filas: FilaPdf[] }[]
  renta: null | {
    total: number
    meses: { label: string; monto: number }[]
    flujos: { fecha: string; nombre: string; tipo: string; monto: number }[]
  }
  dividendos: { fondo: string; cobrado: number; tasa: number | null; estimado: boolean }[]
}

const TITULO = 'Reporte de portafolio'

function graficoLinea(puntos: { fecha: string; valor: number; label?: string }[]) {
  const W = 1000, H = 230, padL = 80, padR = 20, padT = 26, padB = 34
  const vals = puntos.map((p) => p.valor)
  const min = Math.min(...vals), max = Math.max(...vals)
  const raw = (max - min || Math.abs(max) || 1) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw)!
  const lo = Math.floor(min / paso) * paso, hi = Math.ceil(max / paso) * paso || paso
  const t0 = Date.parse(puntos[0].fecha), t1 = Date.parse(puntos[puntos.length - 1].fecha)
  const x = (f: string) => padL + ((Date.parse(f) - t0) / (t1 - t0 || 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB)
  const lineas: string[] = []
  for (let v = lo; v <= hi + paso / 2; v += paso) {
    lineas.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#EEF1F3"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${GRIS}">${num(v, 0)}</text>`)
  }
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${d} L${x(puntos[puntos.length - 1].fecha).toFixed(1)} ${H - padB} L${x(puntos[0].fecha).toFixed(1)} ${H - padB} Z`
  // Etiquetas: primero, último y los intermedios que no se pisen.
  const mostrados: number[] = [0]
  for (let i = 1; i < puntos.length - 1; i++) if (x(puntos[i].fecha) - x(puntos[mostrados[mostrados.length - 1]].fecha) > 110 && x(puntos[puntos.length - 1].fecha) - x(puntos[i].fecha) > 110) mostrados.push(i)
  if (puntos.length > 1) mostrados.push(puntos.length - 1)
  const anc = (i: number) => (i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle')
  const etiquetas = mostrados.map((i) => {
    const p = puntos[i]
    return `<circle cx="${x(p.fecha)}" cy="${y(p.valor)}" r="4" fill="${VERDE}"/>
      <text x="${x(p.fecha)}" y="${y(p.valor) - 9}" text-anchor="${anc(i)}" font-size="11" font-weight="700" fill="${NAVY}">${num(p.valor, 0)}</text>
      <text x="${x(p.fecha)}" y="${H - 12}" text-anchor="${anc(i)}" font-size="11" fill="${GRIS}">${esc(p.label ? `${p.label} · ${ddmmyyyy(p.fecha)}` : ddmmyyyy(p.fecha))}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" font-family="Arial, Helvetica, sans-serif">
    ${lineas.join('')}<path d="${area}" fill="#C8E6C9" opacity="0.5"/><path d="${d}" fill="none" stroke="#2E7D52" stroke-width="3"/>${etiquetas}</svg>`
}

export function htmlPortafolio(d: DatosPdfPortafolio): string {
  const t = d.totales
  const total = t.valorMercado + t.cuponCorrido
  const cliente = d.cliente.trim() || TITULO
  const sec = d.secciones
  const conCustodio = d.consolidado
  const conCorrido = t.cuponCorrido !== 0
  const resumenCustodios = d.custodios.join(' y ')
  const partes: string[] = []

  // ── Resumen (siempre) ──
  const top = d.grupos.flatMap((g) => g.filas).sort((a, b) => b.valorMercado - a.valorMercado).slice(0, 6)
  const maxPeso = Math.max(...top.map((f) => f.peso), 0.0001)
  partes.push(`
  <section>
    <h2>Resumen de la cuenta <span class="h2-sub">· Valuación al ${esc(fechaLarga(d.fecha))}${resumenCustodios ? ` · Custodio${d.custodios.length > 1 ? 's' : ''}: ${esc(resumenCustodios)}` : ''}</span></h2>
    <div class="kpis">
      ${kpi('Valor total de la cuenta', usd(total), conCorrido ? 'Valor de mercado + cupón corrido' : '', true)}
      ${conCorrido ? kpi('Cupón corrido', usd(t.cuponCorrido), 'Intereses devengados no cobrados') : ''}
      ${kpi('Liquidez', usd(d.composicion.liquidez.valor), `${pct(d.composicion.liquidez.peso)} de la cuenta`)}
      ${t.resultado != null ? kpi('Resultado no realizado', `${signo(t.resultado)}${usd(t.resultado)}`, t.costo ? `${signo(t.resultado)}${pct(t.resultado / t.costo, 2)} sobre el costo` : '') : ''}
      ${d.renta ? kpi('Renta estimada 12 meses', usd(d.renta.total), 'Cupones y dividendos') : ''}
    </div>
    <div class="tres">
      ${tablaBarras('Por clase de activo', d.composicion.clases)}
      ${d.composicion.rentaFija.length ? tablaBarras('Renta fija', d.composicion.rentaFija) : tablaBarras('Por moneda', d.composicion.monedas)}
      ${d.composicion.custodios.length > 1 ? tablaBarras('Por custodio', d.composicion.custodios) : d.composicion.rentaFija.length ? tablaBarras('Por moneda', d.composicion.monedas) : '<div></div>'}
    </div>
    <div class="bloque">
      <h3>Principales inversiones</h3>
      <table class="top"><colgroup><col style="width:52%"><col><col style="width:14%"><col style="width:7%"></colgroup>
        <tbody>${top.map((f) => `<tr><td><b>${esc(f.nombre)}</b>${f.custodio && conCustodio ? ` <span class="gris">· ${esc(f.custodio)}</span>` : ''}</td>
          <td><div class="barra"><div style="width:${Math.max(1, (f.peso / maxPeso) * 100).toFixed(1)}%"></div></div></td>
          <td class="n">${esc(num(f.valorMercado))}</td><td class="n b">${esc(pct(f.peso))}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${d.composicion.rendimientoIncome != null ? `<p class="nota">Rendimiento estimado del income: ${esc(d.composicion.rendimientoIncome.toFixed(2))}%.</p>` : ''}
    <p class="nota">Importes en USD.</p>
  </section>`)

  // ── Performance ──
  if (sec.performance && d.performance) {
    const p = d.performance
    const rent = p.rentabilidades.filter((r) => r.valor != null)
    partes.push(`
    <section class="nueva">
      <h2>Performance</h2>
      <div class="kpis">
        ${kpi('Valor de la cuenta', usd(total), conCorrido ? `Incluye cupón corrido ${usd(t.cuponCorrido)}` : '', true)}
        ${p.valorInicial != null ? kpi('Valor inicial', usd(p.valorInicial), p.fechaInicio ? `Al ${ddmmyyyy(p.fechaInicio)}` : '') : ''}
        ${rent.map((r) => kpi(`Rentabilidad ${r.label}`, `${signo(r.valor!)}${r.valor!.toFixed(2)}%`, 'TWRR')).join('')}
      </div>
      ${p.cambios.length ? `<table class="datos resumen-mov"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
        <thead><tr><th>Cuánto creció en dinero</th><th class="n">USD</th></tr></thead>
        <tbody>${p.cambios.map((c) => `<tr><td>${esc(c.label)}</td><td class="n" style="color:${colorRes(c.valor)}">${signo(c.valor)}${esc(num(c.valor))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.serie.length >= 2 ? `<div class="bloque grafico"><h3>Evolución del valor de la cuenta</h3>${graficoLinea(p.serie)}</div>
        <p class="nota">${p.serieDePerformance
          ? 'Valor de la cuenta al inicio de cada período según el reporte de performance del custodio. Incluye aportes y retiros: la rentabilidad real es la TWRR.'
          : 'Valor de mercado en cada importación. Puede incluir aportes, retiros u operaciones: no representa rentabilidad por sí solo.'}</p>` : ''}
    </section>`)
  }

  // ── Posiciones ──
  if (sec.holdings) {
    const cols = 8 + (conCustodio ? 1 : 0) + (conCorrido ? 1 : 0)
    const antes = conCustodio ? 5 : 4 // columnas antes del valor de mercado
    const fila = (f: FilaPdf) => {
      const resPct = f.resultado != null && f.costo ? f.resultado / f.costo : null
      return `<tr>
        <td class="inst"><div class="nom">${esc(f.nombre)}</div>${f.detalle ? `<div class="sub">${esc(f.detalle)}</div>` : ''}</td>
        ${conCustodio ? `<td>${esc(f.custodio ?? '—')}</td>` : ''}
        <td class="n">${f.cantidad == null ? '—' : esc(num(f.cantidad, Number.isInteger(f.cantidad) ? 0 : 3))}</td>
        <td class="n">${f.precio == null ? '—' : esc(num(f.precio, 3))}</td>
        <td class="n">${esc(num(f.valorMercado))}</td>
        ${conCorrido ? `<td class="n">${f.cuponCorrido ? esc(num(f.cuponCorrido)) : '—'}</td>` : ''}
        <td class="n b">${esc(num(f.valorMercado + f.cuponCorrido))}</td>
        <td class="n">${esc(pct(f.peso))}</td>
        <td class="n">${f.costo == null ? '—' : esc(num(f.costo))}</td>
        <td class="n" style="color:${colorRes(f.resultado)}">${f.resultado == null ? '—' : `${signo(f.resultado)}${esc(num(f.resultado))}`}${resPct != null ? `<div class="sub" style="color:${colorRes(f.resultado)}">${signo(resPct)}${esc(pct(resPct, 2))}</div>` : ''}</td>
      </tr>`
    }
    const cuerpo = d.grupos.map((g, gi) => {
      const vm = g.filas.reduce((s, f) => s + f.valorMercado, 0)
      const cc = g.filas.reduce((s, f) => s + f.cuponCorrido, 0)
      const peso = g.filas.reduce((s, f) => s + f.peso, 0)
      const conCosto = g.filas.filter((f) => f.costo != null)
      const costo = conCosto.reduce((s, f) => s + (f.costo ?? 0), 0)
      const res = conCosto.reduce((s, f) => s + (f.resultado ?? 0), 0)
      const enc = `<tr class="grupo"><td colspan="${cols}">${esc(g.clase)} <span>· ${g.filas.length} ${g.filas.length === 1 ? 'posición' : 'posiciones'} · ${esc(pct(peso))} de la cuenta</span></td></tr>`
      const sub = `<tr class="subtotal"><td colspan="${antes - 1}">Subtotal ${esc(g.clase.toLowerCase())}</td>
        <td class="n">${esc(num(vm))}</td>${conCorrido ? `<td class="n">${cc ? esc(num(cc)) : '—'}</td>` : ''}<td class="n">${esc(num(vm + cc))}</td>
        <td class="n">${esc(pct(peso))}</td><td class="n">${conCosto.length ? esc(num(costo)) : '—'}</td>
        <td class="n" style="color:${colorRes(conCosto.length ? res : null)}">${conCosto.length ? `${signo(res)}${esc(num(res))}` : '—'}</td></tr>`
      const tot = gi === d.grupos.length - 1 ? `<tr class="total"><td colspan="${antes - 1}">Total de la cuenta</td>
        <td class="n">${esc(num(t.valorMercado))}</td>${conCorrido ? `<td class="n">${esc(num(t.cuponCorrido))}</td>` : ''}<td class="n">${esc(num(total))}</td>
        <td class="n">100.0%</td><td class="n">${t.costo != null ? esc(num(t.costo)) : '—'}</td><td class="n">${t.resultado != null ? `${signo(t.resultado)}${esc(num(t.resultado))}` : '—'}</td></tr>` : ''
      return bloquesSinHuerfanos(enc, g.filas.map(fila), sub + tot)
    }).join('')
    partes.push(`
    <section class="nueva">
      <h2>Detalle de posiciones</h2>
      <table class="datos">
        <colgroup><col style="width:${30 + (conCustodio ? 0 : 9) + (conCorrido ? 0 : 8)}%">${conCustodio ? '<col style="width:9%">' : ''}<col style="width:8%"><col style="width:6.5%"><col style="width:10%">
          ${conCorrido ? '<col style="width:8%">' : ''}<col style="width:10%"><col style="width:5.5%"><col style="width:10%"><col style="width:9.5%"></colgroup>
        <thead><tr><th>Instrumento</th>${conCustodio ? '<th>Custodio</th>' : ''}<th class="n">Nominal / cant.</th><th class="n">Precio</th><th class="n">Valor de mercado</th>
          ${conCorrido ? '<th class="n">Cupón corrido</th>' : ''}<th class="n">Valor total</th><th class="n">%</th><th class="n">Costo</th><th class="n">Resultado</th></tr></thead>
        ${cuerpo}
      </table>
      <p class="nota">Importes en USD. ${conCorrido ? 'El valor total incluye el cupón corrido (intereses devengados y no cobrados). ' : ''}El precio de los bonos es cada 100 de nominal. El % es sobre el valor de mercado de la cuenta.</p>
    </section>`)
  }

  // ── Cupones y dividendos ──
  if (sec.income && d.renta && d.renta.flujos.length) {
    const r = d.renta
    const filas = r.flujos.map((f) => `<tr><td>${esc(ddmmyyyy(f.fecha))}</td><td>${esc(f.nombre)}</td><td>${esc(f.tipo)}</td><td class="n b">${esc(num(f.monto))}</td></tr>`)
    partes.push(`
    <section class="nueva">
      <h2>Cupones y dividendos · próximos 12 meses</h2>
      <div class="kpis">
        ${kpi('Total 12 meses', usd(r.total), '', true)}
        ${kpi('Promedio mensual', usd(r.total / 12))}
        ${r.flujos[0] ? kpi('Próximo cobro', usd(r.flujos[0].monto), `${ddmmyyyy(r.flujos[0].fecha)} · ${r.flujos[0].nombre}`) : ''}
        ${d.composicion.rendimientoIncome != null ? kpi('Rendimiento del income', `${d.composicion.rendimientoIncome.toFixed(2)}%`) : ''}
      </div>
      <div class="bloque grafico"><h3>Cobros por mes</h3>${graficoBarras(r.meses.map((m) => m.label), r.meses.map((m) => m.monto))}</div>
      <table class="datos flujos">
        <colgroup><col style="width:12%"><col style="width:58%"><col style="width:15%"><col style="width:15%"></colgroup>
        <thead><tr><th>Fecha</th><th>Instrumento</th><th>Tipo</th><th class="n">Monto estimado (USD)</th></tr></thead>
        ${bloquesSinHuerfanos('', filas, `<tr class="total"><td colspan="3">Total</td><td class="n">${esc(num(r.total))}</td></tr>`)}
      </table>
      <p class="nota">Flujos brutos estimados, antes de impuestos. No incluye amortizaciones, vencimientos ni rescates anticipados.</p>
    </section>`)
  }

  // ── Dividendos cobrados ──
  if (sec.dividendos && d.dividendos.length) {
    partes.push(`
    <section class="nueva">
      <h2>Dividendos y cupones cobrados</h2>
      <table class="datos">
        <colgroup><col style="width:60%"><col style="width:20%"><col style="width:20%"></colgroup>
        <thead><tr><th>Fondo / bono</th><th class="n">Cobrado (USD)</th><th class="n">Tasa anualizada</th></tr></thead>
        ${bloquesSinHuerfanos('', d.dividendos.map((x) => `<tr><td class="inst"><div class="nom">${esc(x.fondo)}</div></td><td class="n b">${esc(num(x.cobrado))}</td>
          <td class="n">${x.tasa != null ? `${x.tasa.toFixed(2)}%${x.estimado ? '*' : ''}` : x.cobrado > 0 ? 'Falta posición inicial' : '—'}</td></tr>`), '')}
      </table>
      ${d.dividendos.some((x) => x.estimado) ? '<p class="nota">* Tasa estimada.</p>' : ''}
    </section>`)
  }

  partes.push(`
  <section class="cierre">
    <h3>Notas</h3>
    <p>Información preparada por Roble Capital a partir de los reportes de ${esc(resumenCustodios || 'los custodios')}. No reemplaza los estados de cuenta oficiales del custodio: ante cualquier diferencia, valen estos últimos.</p>
    <h3>Disclosures</h3>
    <p class="legal">${esc(ROBLE_DISCLAIMER)}</p>
  </section>`)

  return documento(cliente, partes.join(''), '.flujos td { padding-top: 1.2mm; padding-bottom: 1.2mm; }')
}

export function partesPortafolio(d: DatosPdfPortafolio): PartesPdf {
  return {
    portada: htmlPortada({
      titulo: TITULO, cliente: d.cliente, fecha: d.fecha,
      pershing: d.custodios.some((c) => /pershing/i.test(c)), morgan: d.custodios.some((c) => /morgan/i.test(c)),
    }),
    cuerpo: htmlPortafolio(d),
    encabezado: encabezadoPdf(TITULO, d.cliente, d.fecha),
    pie: piePdf(d.cliente),
    titulo: `${TITULO}${d.cliente.trim() ? ` - ${d.cliente.trim()}` : ''}`,
  }
}

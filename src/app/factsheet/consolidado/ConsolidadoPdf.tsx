import {
  BnyLogo, CssBarChart, PAGE_PAD_MM, PAGE_STYLE, PdfCoverHeader, PdfDisclosure, PdfDonut, PdfFooter, PdfHeader, StatTile, truncateName,
} from '../[accountNumber]/AccountPdfReport'
import { COLORS, fmtUSD, fmtUSD2 } from '@/lib/portfolio/theme'
import { categoriaMovimiento, ddmmyyyy, mesCorto, type LineaPosicion, type Reporte } from '@/lib/consolidado/calc'
import { CLASES, type Banco } from '@/lib/consolidado/types'

// Reporte de la Posición Consolidada para el cliente, con el mismo formato que
// el PDF de Portafolio (AccountPdfReport): se monta fuera de pantalla y
// generarPdfDePaginas captura cada `.pdf-page`.

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LARGOS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`
const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`
const corto = (b: Banco) => (b === 'Pershing' ? 'Pershing' : 'Morgan Stanley')

const th = { padding: '2mm 1.5mm', color: '#fff', fontWeight: 700 } as const
const tdBase = { padding: '1.6mm 1.5mm', color: COLORS.slate } as const

function MorganLogo({ height = 9 }: { height?: number }) {
  return (
    <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: height * 2.1, fontWeight: 700, color: '#002B51', letterSpacing: 0.5 }}>
      Morgan Stanley
    </span>
  )
}

function PlazoRentaFija(posiciones: LineaPosicion[], fecha: string) {
  const anios = (vto: string) => (Date.parse(vto) - Date.parse(fecha)) / (365.25 * 864e5)
  const tramos: [string, (l: LineaPosicion) => boolean][] = [
    ['Hasta 1 año', (l) => !!l.vencimiento && anios(l.vencimiento) <= 1],
    ['1 a 3 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 1 && anios(l.vencimiento) <= 3],
    ['3 a 5 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 3 && anios(l.vencimiento) <= 5],
    ['5 a 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 5 && anios(l.vencimiento) <= 10],
    ['Más de 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 10],
    ['Perpetuos', (l) => !l.vencimiento],
  ]
  const rf = posiciones.filter((l) => l.clase === 'Renta fija')
  const total = rf.reduce((s, l) => s + l.total, 0)
  return tramos
    .map(([label, f]) => {
      const value = rf.filter(f).reduce((s, l) => s + l.total, 0)
      return { label, value, pct: total ? (value / total) * 100 : 0 }
    })
    .filter((t) => t.value > 0)
}

export default function ConsolidadoPdf({ r, cliente, cuentas, incluirMovimientos }: {
  r: Reporte
  cliente: string
  cuentas: string
  incluirMovimientos: boolean
}) {
  const t = r.totales
  const nombre = cliente || 'Posición Consolidada'
  const efectivo = r.porClase.find((c) => c.clase === 'Efectivo')
  const top = [...r.posiciones].sort((a, b) => b.total - a.total).slice(0, 7)
  const maxTop = top[0]?.total || 1
  const plazos = PlazoRentaFija(r.posiciones, r.fecha)
  const movimientos = r.movimientos.filter((m) => categoriaMovimiento(m) !== 'Money market')
  const hayRenta = r.renta.filas.length > 0
  const hayMov = incluirMovimientos && movimientos.length > 0
  const ultima = hayMov ? 'movimientos' : hayRenta ? 'renta' : 'posiciones'
  const proximo = (() => {
    for (let i = 0; i < r.renta.meses.length; i++) {
      const fila = r.renta.filas.find((f) => f.montos[i] > 0)
      if (fila) return { mes: r.renta.meses[i], fila, monto: fila.montos[i] }
    }
    return null
  })()

  return (
    <div id="consolidado-pdf" style={{ position: 'fixed', left: -10000, top: 0 }}>
      {/* ── Portada ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <div style={{ position: 'absolute', inset: `${PAGE_PAD_MM}mm`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <PdfCoverHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5mm' }}>
              {r.bancos.includes('Pershing') && <BnyLogo height={8} />}
              {r.bancos.length > 1 && <span style={{ width: 1, height: '10mm', background: COLORS.border }} />}
              {r.bancos.includes('Morgan Stanley') && <MorganLogo height={8} />}
            </div>
          </PdfCoverHeader>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16.2, color: COLORS.midGreen, textTransform: 'uppercase', letterSpacing: 8, fontWeight: 700 }}>Posición Consolidada</div>
            <div style={{ width: '42mm', height: '2.5px', background: COLORS.darkGreen, margin: '6mm auto' }} />
            <div style={{ fontSize: 45.9, fontWeight: 800, color: COLORS.ink, letterSpacing: 0.3 }}>{nombre}</div>
            <div style={{ fontSize: 14.9, color: COLORS.slate, marginTop: '3mm', letterSpacing: 1 }}>Valuación al {fechaLarga(r.fecha)}</div>
            {cuentas && <div style={{ fontSize: 11.5, color: COLORS.mutedSlate, marginTop: '2mm' }}>{cuentas}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5mm', paddingTop: '5mm', borderTop: `1px solid ${COLORS.border}`, fontSize: 10.8, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Documento confidencial · Preparado exclusivamente para {nombre}
          </div>
        </div>
      </div>

      {/* ── Resumen ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfHeader title="Resumen de la cuenta" />

        <div data-pdf-keep-together style={{ display: 'flex', gap: '4mm', marginBottom: '5mm' }}>
          <div style={{ flex: '0 0 38%', borderRadius: 10, padding: '6mm', color: '#fff', background: `linear-gradient(135deg, ${COLORS.darkGreen}, ${COLORS.charcoal})` }}>
            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>Valor total de la cuenta</div>
            <div style={{ fontSize: 40, fontWeight: 800, marginTop: '3mm' }}>{fmtUSD(t.total)}</div>
            <div style={{ fontSize: 11.5, marginTop: '2mm', opacity: 0.85 }}>Valor de mercado: <b>{fmtUSD(t.valorMercado)}</b></div>
            <div style={{ fontSize: 11.5, marginTop: '1mm', opacity: 0.85 }}>Cupón corrido: <b>{fmtUSD(t.cuponCorrido)}</b></div>
            <div style={{ fontSize: 9.5, marginTop: '3mm', opacity: 0.7 }}>Al {ddmmyyyy(r.fecha)} · {r.bancos.join(' + ')}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3mm' }}>
            <div style={{ display: 'flex', gap: '3mm' }}>
              <StatTile label="Resultado no realizado" value={`${t.resultado >= 0 ? '+' : ''}${fmtUSD(t.resultado)}`}
                sub={t.costo ? `${t.resultado >= 0 ? '+' : ''}${pct(t.resultado / t.costo, 2)} sobre costo` : null}
                color={t.resultado >= 0 ? COLORS.gain : COLORS.loss} />
              <StatTile label="Renta próximos 12 meses" value={hayRenta ? fmtUSD(r.renta.total) : '—'} sub={hayRenta ? 'Cupones y dividendos proyectados' : 'Sin calendario de cupones'} color={COLORS.darkGreen} />
              <StatTile label="Liquidez" value={fmtUSD(efectivo?.total ?? 0)} sub={`${pct(efectivo?.peso ?? 0)} de la cuenta`} />
            </div>
            <div style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm' }}>
              <div style={{ fontSize: 10.8, fontWeight: 700, color: COLORS.ink, marginBottom: '2mm' }}>Por custodio</div>
              {r.porBanco.map((b) => (
                <div key={b.banco} style={{ marginBottom: '2mm' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.8, marginBottom: '1mm' }}>
                    <span style={{ color: COLORS.slate }}>{corto(b.banco)} · {b.cantidad} posiciones · cupón corrido {fmtUSD(b.cuponCorrido)}</span>
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>{fmtUSD(b.total)} · {pct(b.peso)}</span>
                  </div>
                  <div style={{ height: '2mm', background: COLORS.bgSofter, borderRadius: '1mm', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(b.peso * 100, 2)}%`, background: `linear-gradient(90deg, ${COLORS.darkGreen}, ${COLORS.midGreen})` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '5mm' }}>
          <PdfDonut title="Por clase de activo" data={r.porClase.map((c) => ({ label: c.clase, value: c.total, pct: c.peso * 100 }))} />
          <PdfDonut title="Por custodio" data={r.porBanco.map((b) => ({ label: corto(b.banco), value: b.total, pct: b.peso * 100 }))} />
          {plazos.length > 0 && <PdfDonut title="Renta fija por plazo" data={plazos} />}
        </div>

        <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm' }}>
          <div style={{ fontSize: 12.2, fontWeight: 700, color: COLORS.ink, marginBottom: '1.5mm' }}>Principales inversiones</div>
          {top.map((l) => (
            <div key={`${l.banco}${l.cusip}${l.descripcion}`} style={{ marginBottom: '1.4mm' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '4mm', fontSize: 10.1, lineHeight: 1.4, marginBottom: '1.2mm' }}>
                <span style={{ color: COLORS.ink, fontWeight: 600 }}>{truncateName(l.nombre, 70)} <span style={{ color: COLORS.mutedSlate, fontWeight: 400 }}>· {corto(l.banco)}</span></span>
                <span style={{ color: COLORS.ink, fontWeight: 700, flexShrink: 0, marginLeft: '2mm' }}>{fmtUSD(l.total)} · {pct(l.peso)}</span>
              </div>
              <div style={{ height: '2mm', background: COLORS.bgSofter, borderRadius: '1mm', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max((l.total / maxTop) * 100, 3)}%`, background: `linear-gradient(90deg, ${COLORS.darkGreen}, ${COLORS.midGreen})` }} />
              </div>
            </div>
          ))}
        </div>
        <PdfFooter clientName={nombre} />
      </div>

      {/* ── Posiciones por categoría ── */}
      <div className="pdf-page" style={PAGE_STYLE}>
        <PdfHeader title="Posiciones" />
        <table style={{ width: '100%', fontSize: 9.4, borderCollapse: 'collapse', marginBottom: '8mm' }}>
          <thead>
            <tr style={{ background: COLORS.charcoal }}>
              <th style={{ ...th, textAlign: 'left' }}>Inversión</th>
              <th style={{ ...th, textAlign: 'left' }}>Custodio</th>
              <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
              <th style={{ ...th, textAlign: 'right' }}>Precio</th>
              <th style={{ ...th, textAlign: 'right' }}>Valor de mercado</th>
              <th style={{ ...th, textAlign: 'right' }}>Cupón corrido</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'right' }}>% cuenta</th>
              <th style={{ ...th, textAlign: 'right' }}>Costo</th>
              <th style={{ ...th, textAlign: 'right' }}>Resultado</th>
            </tr>
          </thead>
          {CLASES.map((clase) => {
            const ls = r.posiciones.filter((l) => l.clase === clase)
            if (!ls.length) return null
            const s = r.porClase.find((c) => c.clase === clase)!
            return (
              <tbody key={clase} data-pdf-keep-together>
                <tr data-pdf-keep-together style={{ background: COLORS.bgSofter }}>
                  <td colSpan={10} style={{ padding: '1.8mm 1.5mm', fontWeight: 700, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 9.2 }}>
                    {clase} · {ls.length} {ls.length === 1 ? 'posición' : 'posiciones'} · {pct(s.peso)} de la cuenta
                  </td>
                </tr>
                {ls.map((l, i) => {
                  const resPct = l.resultado != null && l.costo ? l.resultado / l.costo : null
                  return (
                    <tr key={`${l.banco}${l.cusip}${l.descripcion}`} data-pdf-keep-together style={{ background: i % 2 === 0 ? '#fff' : COLORS.bgSofter }}>
                      <td style={{ padding: '1.6mm 1.5mm', maxWidth: '72mm' }}>
                        <div style={{ color: COLORS.ink, fontWeight: 600, lineHeight: 1.5 }}>{truncateName(l.nombre, 52)}</div>
                        {l.detalle && <div style={{ fontSize: 8, lineHeight: 1.5, color: COLORS.mutedSlate }}>{l.detalle}</div>}
                      </td>
                      <td style={tdBase}>{corto(l.banco)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{l.clase === 'Efectivo' || l.cantidad == null ? '—' : l.cantidad.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{l.precio == null ? '—' : l.precio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: COLORS.ink }}>{fmtUSD2(l.valorMercado)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{l.cuponCorrido ? fmtUSD2(l.cuponCorrido) : '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{fmtUSD2(l.total)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{pct(l.peso)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{l.costo != null ? fmtUSD2(l.costo) : '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: l.resultado == null ? COLORS.mutedSlate : l.resultado >= 0 ? COLORS.gain : COLORS.loss }}>
                        {l.resultado == null ? '—' : `${l.resultado >= 0 ? '+' : ''}${fmtUSD2(l.resultado)}${resPct != null ? ` (${resPct >= 0 ? '+' : ''}${pct(resPct, 2)})` : ''}`}
                      </td>
                    </tr>
                  )
                })}
                <tr data-pdf-keep-together style={{ background: '#EEF2F1', borderBottom: `1.5px solid ${COLORS.border}` }}>
                  <td colSpan={4} style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate, fontSize: 9.2 }}>Subtotal {clase}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{fmtUSD2(s.valorMercado)}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate }}>{s.cuponCorrido ? fmtUSD2(s.cuponCorrido) : '—'}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{fmtUSD2(s.total)}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate }}>{pct(s.peso)}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.slate }}>{s.costo ? fmtUSD2(s.costo) : '—'}</td>
                  <td style={{ padding: '1.8mm 1.5mm', textAlign: 'right', fontWeight: 700, color: s.resultado >= 0 ? COLORS.gain : COLORS.loss }}>
                    {s.costo ? `${s.resultado >= 0 ? '+' : ''}${fmtUSD2(s.resultado)}` : '—'}
                  </td>
                </tr>
              </tbody>
            )
          })}
          <tfoot>
            <tr style={{ background: COLORS.charcoal }}>
              <td colSpan={4} style={{ ...th, textAlign: 'right' }}>TOTAL</td>
              <td style={{ ...th, textAlign: 'right' }}>{fmtUSD2(t.valorMercado)}</td>
              <td style={{ ...th, textAlign: 'right' }}>{fmtUSD2(t.cuponCorrido)}</td>
              <td style={{ ...th, textAlign: 'right' }}>{fmtUSD2(t.total)}</td>
              <td style={{ ...th, textAlign: 'right' }}>100.0%</td>
              <td style={{ ...th, textAlign: 'right' }}>{fmtUSD2(t.costo)}</td>
              <td style={{ ...th, textAlign: 'right' }}>{t.resultado >= 0 ? '+' : ''}{fmtUSD2(t.resultado)}</td>
            </tr>
          </tfoot>
        </table>
        <div data-pdf-keep-together style={{ fontSize: 8.4, color: COLORS.mutedSlate, lineHeight: 1.5, marginTop: '-4mm', marginBottom: '6mm' }}>
          El total de cada posición incluye el cupón corrido: los intereses devengados desde el último pago y todavía no cobrados al {ddmmyyyy(r.fecha)}.
        </div>
        {ultima === 'posiciones' && <PdfDisclosure />}
        <PdfFooter clientName={nombre} />
      </div>

      {/* ── Renta proyectada ── */}
      {hayRenta && (
        <div className="pdf-page" style={PAGE_STYLE}>
          <PdfHeader title="Renta proyectada" />
          <div data-pdf-keep-together style={{ display: 'flex', gap: '3mm', marginBottom: '4mm' }}>
            <StatTile label="Próximos 12 meses" value={fmtUSD(r.renta.total)} color={COLORS.darkGreen} />
            <StatTile label="Cupones" value={fmtUSD(r.renta.cupones)} />
            <StatTile label="Dividendos" value={fmtUSD(r.renta.dividendos)} />
            {proximo && (
              <StatTile label="Próximo cobro" value={fmtUSD(proximo.monto)} sub={`${mesCorto(proximo.mes)} · ${truncateName(r.posiciones.find((l) => l.cusip === proximo.fila.cusip)?.nombre ?? proximo.fila.descripcion, 40)}`} />
            )}
          </div>
          <div data-pdf-keep-together style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '3mm 4mm', marginBottom: '4mm' }}>
            <div style={{ fontSize: 12.2, fontWeight: 700, color: COLORS.ink, marginBottom: '1mm' }}>Cobros por mes</div>
            <CssBarChart data={r.renta.meses.map((m, i) => ({ label: mesCorto(m), value: r.renta.montos[i] }))} color={COLORS.midGreen} />
          </div>
          <table style={{ width: '100%', fontSize: 8.6, borderCollapse: 'collapse', marginBottom: '6mm' }}>
            <thead>
              <tr style={{ background: COLORS.charcoal }}>
                <th style={{ ...th, textAlign: 'left' }}>Instrumento</th>
                {r.renta.meses.map((m) => <th key={m} style={{ ...th, textAlign: 'right' }}>{mesCorto(m)}</th>)}
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {r.renta.filas.map((f, i) => {
                const l = r.posiciones.find((x) => x.banco === f.banco && x.cusip === f.cusip)
                return (
                  <tr key={i} data-pdf-keep-together style={{ background: i % 2 === 0 ? '#fff' : COLORS.bgSofter }}>
                    <td style={{ padding: '1.4mm 1.5mm', color: COLORS.ink }}>
                      {truncateName(l?.nombre ?? f.descripcion, 42)}
                      <span style={{ color: COLORS.mutedSlate }}> · {corto(f.banco)}</span>
                    </td>
                    {f.montos.map((v, j) => <td key={j} style={{ padding: '1.4mm 1mm', textAlign: 'right', color: COLORS.slate }}>{v ? Math.round(v).toLocaleString('en-US') : ''}</td>)}
                    <td style={{ padding: '1.4mm 1.5mm', textAlign: 'right', fontWeight: 700, color: COLORS.ink }}>{Math.round(f.total).toLocaleString('en-US')}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: COLORS.charcoal }}>
                <td style={{ ...th }}>TOTAL</td>
                {r.renta.montos.map((v, j) => <td key={j} style={{ ...th, textAlign: 'right', padding: '2mm 1mm' }}>{v ? Math.round(v).toLocaleString('en-US') : ''}</td>)}
                <td style={{ ...th, textAlign: 'right' }}>{Math.round(r.renta.total).toLocaleString('en-US')}</td>
              </tr>
            </tfoot>
          </table>
          <div data-pdf-keep-together style={{ fontSize: 8.4, color: COLORS.mutedSlate, marginBottom: '6mm' }}>
            Flujos brutos estimados en USD, antes de impuestos. No incluye amortizaciones, vencimientos ni rescates anticipados.
          </div>
          {ultima === 'renta' && <PdfDisclosure />}
          <PdfFooter clientName={nombre} />
        </div>
      )}

      {/* ── Movimientos ── */}
      {hayMov && (
        <div className="pdf-page" style={PAGE_STYLE}>
          <PdfHeader title="Movimientos" />
          <div data-pdf-keep-together style={{ display: 'flex', flexWrap: 'wrap', gap: '2.5mm', marginBottom: '4mm' }}>
            {r.resumenMovimientos.filter((c) => c.categoria !== 'Money market').map((c) => (
              <div key={c.categoria} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '2.2mm 3mm', minWidth: '38mm' }}>
                <div style={{ fontSize: 8.6, color: COLORS.mutedSlate, textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.categoria} · {c.cantidad}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: c.monto < 0 ? COLORS.loss : COLORS.ink, marginTop: '0.8mm' }}>{fmtUSD(c.monto)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: COLORS.slate, marginBottom: '2mm' }}>
            Del {ddmmyyyy(r.periodoMovimientos.desde)} al {ddmmyyyy(r.periodoMovimientos.hasta)}
          </div>
          <table style={{ width: '100%', fontSize: 8.8, borderCollapse: 'collapse', marginBottom: '6mm' }}>
            <thead>
              <tr style={{ background: COLORS.charcoal }}>
                <th style={{ ...th, textAlign: 'left' }}>Fecha</th>
                <th style={{ ...th, textAlign: 'left' }}>Custodio</th>
                <th style={{ ...th, textAlign: 'left' }}>Tipo</th>
                <th style={{ ...th, textAlign: 'left' }}>Descripción</th>
                <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
                <th style={{ ...th, textAlign: 'right' }}>Precio</th>
                <th style={{ ...th, textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={i} data-pdf-keep-together style={{ background: i % 2 === 0 ? '#fff' : COLORS.bgSofter }}>
                  <td style={{ padding: '1.3mm 1.5mm', color: COLORS.ink, whiteSpace: 'nowrap' }}>{ddmmyyyy(m.fecha)}</td>
                  <td style={{ padding: '1.3mm 1.5mm', color: COLORS.slate }}>{corto(m.banco)}</td>
                  <td style={{ padding: '1.3mm 1.5mm', color: COLORS.slate }}>{truncateName(m.tipo, 28)}</td>
                  <td style={{ padding: '1.3mm 1.5mm', color: COLORS.slate }}>{truncateName(m.descripcion, 80)}</td>
                  <td style={{ padding: '1.3mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{m.cantidad == null ? '' : m.cantidad.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                  <td style={{ padding: '1.3mm 1.5mm', textAlign: 'right', color: COLORS.slate }}>{m.precio == null ? '' : m.precio.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                  <td style={{ padding: '1.3mm 1.5mm', textAlign: 'right', fontWeight: 700, color: (m.monto ?? 0) < 0 ? COLORS.loss : COLORS.ink }}>{m.monto == null ? '' : fmtUSD2(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PdfDisclosure />
          <PdfFooter clientName={nombre} />
        </div>
      )}
    </div>
  )
}

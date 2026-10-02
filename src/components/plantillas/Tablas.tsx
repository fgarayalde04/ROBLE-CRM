import { Fragment, type CSSProperties, type ReactNode } from 'react'
import {
  COLUMNAS_COMPARATIVO, COLUMNAS_REND_FONDO, comparativoDisclaimer, masOperadoDisclaimer,
  type ComparativoFondosDatos, type FilaBonoOperado, type FilaFondoOperado, type MasOperadoDatos,
} from '@/lib/plantillas/tipos'
import {
  PAGINA_ROBLE, PIE_TOP, SERIF, SANS, VERDE, GRIS, GRIS_OSCURO, etiqueta, etiquetaVerde, vacio,
  Hoja, Encabezado, Pie,
} from './roble'

// Plantillas de tabla con el formato Roble (una hoja de 816 × 1020 px):
//   · Comparativo de fondos por categoría / asset class (datos del Monitor)
//   · Fondos y bonos más operados del mes (datos de las órdenes)
// El área de contenido lleva data-plantilla-contenido para que el editor avise
// si la tabla no entra en la hoja.

export const TABLAS_PAGE = PAGINA_ROBLE

const LINEA = '#D9DADC'
const NEGATIVO = '#9B2C2C'

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)

function Contenido({ children }: { children: ReactNode }) {
  return (
    <div
      data-plantilla-contenido={1}
      style={{
        position: 'absolute', left: 60, right: 60, top: 165, bottom: PAGINA_ROBLE.height - PIE_TOP + 22,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

function Cabecera({ volanta, titulo, subtitulo, comentario }: { volanta: string; titulo: string; subtitulo: string; comentario: string }) {
  const parrafos = comentario.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ ...etiqueta, fontSize: 11.8 }}>{volanta}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 40, lineHeight: 1.1, color: VERDE, marginTop: 10, letterSpacing: '-0.005em' }}>
        {titulo}
      </div>
      {subtitulo.trim() && <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, color: GRIS, marginTop: 4 }}>{subtitulo}</div>}
      {parrafos.map((p, i) => (
        <p key={i} style={{ margin: i ? '8px 0 0' : '16px 0 0', fontFamily: SANS, fontSize: 14, lineHeight: '21px', color: '#33363A', whiteSpace: 'pre-line' }}>{p}</p>
      ))}
    </div>
  )
}

const th: CSSProperties = { ...etiqueta, fontSize: 9.5, letterSpacing: '0.14em', padding: '0 6px 7px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '0 6px', height: 34, borderBottom: `1px solid ${LINEA}`, fontSize: 13, color: GRIS_OSCURO, whiteSpace: 'nowrap' }

// ── Comparativo de fondos ────────────────────────────────────────────────────

export function ComparativoFondos({ datos, logoSrc = '/download.png' }: { datos: ComparativoFondosDatos; logoSrc?: string }) {
  const d = datos
  const filas = d.filas ?? []
  // Agrupadas por subcategoría, en el orden en que aparecen
  const grupos: { sub: string; filas: typeof filas }[] = []
  for (const f of filas) {
    const g = grupos.find((x) => x.sub === (f.subcategoria || ''))
    if (g) g.filas.push(f); else grupos.push({ sub: f.subcategoria || '', filas: [f] })
  }
  const conSub = grupos.some((g) => g.sub)
  const cols = COLUMNAS_COMPARATIVO

  return (
    <Hoja>
      <Encabezado categoria={d.categoria} periodo={d.periodo} logoSrc={logoSrc} />
      <Contenido>
        <Cabecera volanta="Comparativo de fondos" titulo={vacio(d.titulo, 'Título del comparativo')} subtitulo={d.subtitulo ?? ''} comentario={d.comentario ?? ''} />

        <div style={{ marginTop: 26, flexShrink: 0 }}>
          <div style={etiquetaVerde}>Rendimientos</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontFamily: SANS }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${VERDE}` }}>
                <th style={th}>Fondo</th>
                <th style={th}>Moneda</th>
                {cols.map((c) => <th key={c.key} style={{ ...th, textAlign: 'right', color: c.destacada ? VERDE : th.color }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={cols.length + 2} style={{ ...td, color: '#A0A3A7' }}>Elegí la categoría y los fondos…</td></tr>
              )}
              {grupos.map((g) => (
                <Fragment key={g.sub || '_'}>
                  {conSub && (
                    <tr>
                      <td colSpan={cols.length + 2} style={{ ...td, height: 28, background: '#EAEBEC', ...etiqueta, fontSize: 9.5, color: GRIS_OSCURO, fontWeight: 700 }}>
                        {g.sub || 'Otros'}
                      </td>
                    </tr>
                  )}
                  {g.filas.map((f) => (
                    <tr key={f.isin || f.nombre}>
                      <td style={{ ...td, whiteSpace: 'normal', lineHeight: '15px', padding: '6px 6px' }}>
                        <div style={{ fontWeight: 700 }}>{f.nombre}</div>
                        {f.gestora && <div style={{ fontSize: 10.5, color: GRIS }}>{f.gestora}</div>}
                      </td>
                      <td style={{ ...td, color: GRIS }}>{f.moneda || '—'}</td>
                      {cols.map((c) => {
                        const v = f[c.key] as number | null
                        return (
                          <td key={c.key} style={{
                            ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                            fontWeight: c.destacada ? 700 : 400,
                            background: c.destacada ? '#F1F3EE' : undefined,
                            color: v != null && v < 0 ? NEGATIVO : GRIS_OSCURO,
                          }}>
                            {pct(v)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Pie texto={comparativoDisclaimer(d.fecha_datos)} />
    </Hoja>
  )
}

// ── Lo más operado (solo compras) ────────────────────────────────────────────

function Rank({ n }: { n: number }) {
  return <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, color: VERDE }}>{n}</span>
}

function TablaFondos({ filas }: { filas: FilaFondoOperado[] }) {
  const cols = COLUMNAS_REND_FONDO
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontFamily: SANS, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 28 }} />
        <col />
        {cols.map((c) => <col key={c.key} style={{ width: 52 }} />)}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: `2px solid ${VERDE}` }}>
          <th style={th}>#</th>
          <th style={th}>Fondo</th>
          {cols.map((c) => <th key={c.key} style={{ ...th, textAlign: 'right', padding: '0 4px 7px', letterSpacing: '0.06em', color: c.destacada ? VERDE : th.color }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <tr><td colSpan={cols.length + 2} style={{ ...td, color: '#A0A3A7' }}>Sin compras en el período</td></tr>}
        {filas.map((f, i) => (
          <tr key={i}>
            <td style={td}><Rank n={i + 1} /></td>
            <td style={{ ...td, fontWeight: 700, whiteSpace: 'normal', lineHeight: '15px', padding: '6px 6px' }}>{vacio(f.nombre, '—')}</td>
            {cols.map((c) => {
              const v = f[c.key]
              return (
                <td key={c.key} style={{
                  ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, padding: '0 4px',
                  fontWeight: c.destacada ? 700 : 400, background: c.destacada ? '#F1F3EE' : undefined,
                  color: v != null && v < 0 ? NEGATIVO : GRIS_OSCURO,
                }}>{pct(v)}</td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TablaBonos({ filas }: { filas: FilaBonoOperado[] }) {
  const cols: { label: string; valor: (f: FilaBonoOperado) => string; ancho: number }[] = [
    { label: 'Cupón', valor: (f) => f.cupon || '—', ancho: 90 },
    { label: 'Vencimiento', valor: (f) => f.vencimiento || '—', ancho: 110 },
    { label: 'Moneda', valor: (f) => f.moneda || '—', ancho: 70 },
  ]
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontFamily: SANS, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 30 }} />
        <col />
        {cols.map((c) => <col key={c.label} style={{ width: c.ancho }} />)}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: `2px solid ${VERDE}` }}>
          <th style={th}>#</th>
          <th style={th}>Bono</th>
          {cols.map((c) => <th key={c.label} style={th}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <tr><td colSpan={cols.length + 2} style={{ ...td, color: '#A0A3A7' }}>Sin compras en el período</td></tr>}
        {filas.map((f, i) => (
          <tr key={i}>
            <td style={td}><Rank n={i + 1} /></td>
            <td style={{ ...td, fontWeight: 700, whiteSpace: 'normal', lineHeight: '15px', padding: '6px 6px' }}>{vacio(f.nombre, '—')}</td>
            {cols.map((c) => <td key={c.label} style={{ ...td, color: GRIS }}>{c.valor(f)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MasOperado({ tipo, datos, logoSrc = '/download.png' }: {
  tipo: 'mas_operado_fondos' | 'mas_operado_bonos'; datos: MasOperadoDatos<any>; logoSrc?: string
}) {
  const d = datos
  const fondos = tipo === 'mas_operado_fondos'
  const vision = (d.vision ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <Hoja>
      <Encabezado categoria={d.categoria} periodo={d.periodo} logoSrc={logoSrc} />
      <Contenido>
        <Cabecera volanta="Lo más comprado por nuestros clientes" titulo={vacio(d.titulo, 'Título')} subtitulo={d.subtitulo ?? ''} comentario={d.comentario ?? ''} />
        <div style={{ marginTop: 24, flexShrink: 0 }}>
          <div style={etiquetaVerde}>Más comprados</div>
          {fondos ? <TablaFondos filas={d.compras ?? []} /> : <TablaBonos filas={d.compras ?? []} />}
        </div>
        <div style={{ marginTop: 26, flexShrink: 0 }}>
          <div style={etiquetaVerde}>{vacio(d.vision_titulo, 'Nuestra visión')}</div>
          <div style={{ borderTop: `1px solid ${LINEA}`, marginTop: 7 }} />
          {vision.length
            ? vision.map((p, i) => (
              <p key={i} style={{ margin: i ? '8px 0 0' : '12px 0 0', fontFamily: SANS, fontSize: 14, lineHeight: '21px', color: '#33363A', whiteSpace: 'pre-line' }}>{p}</p>
            ))
            : <p style={{ margin: '12px 0 0', fontSize: 14, color: '#A0A3A7' }}>Nuestra visión de mercado y por qué cambiamos los fondos o compramos bonos…</p>}
        </div>
      </Contenido>
      <Pie texto={masOperadoDisclaimer(d.desde, d.hasta, fondos)} />
    </Hoja>
  )
}

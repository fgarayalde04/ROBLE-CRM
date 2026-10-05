import type { CSSProperties, ReactNode } from 'react'

// Piezas compartidas del formato de documentos Roble (ficha y análisis de
// bonos): hoja, encabezado con logo y doble línea verde, franja de precio/TIR
// y pie gris con disclaimer. Tipografías por variable CSS: --pl-serif
// (Source Serif 4) y --pl-sans (Source Sans 3).

export const PAGINA_ROBLE = { width: 816, height: 1020 }
export const PIE_TOP = 899

export const VERDE = '#3F5F2E'
export const VERDE_LINEA = '#4B6B37'
export const GRIS = '#55585C'
export const GRIS_OSCURO = '#26282B'
export const SERIF = 'var(--pl-serif), Georgia, serif'
export const SANS = 'var(--pl-sans), Helvetica, Arial, sans-serif'

export const etiqueta: CSSProperties = {
  fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: GRIS,
}

export const etiquetaVerde: CSSProperties = { ...etiqueta, color: VERDE, fontWeight: 700 }

export function vacio(v: string | null | undefined, ph: string) {
  return v?.trim() ? v : ph
}

export function Hoja({ children }: { children: ReactNode }) {
  return (
    <div
      className="plantilla-hoja"
      style={{
        width: PAGINA_ROBLE.width, height: PAGINA_ROBLE.height, position: 'relative', overflow: 'hidden',
        background: '#fff', fontFamily: SANS, color: GRIS_OSCURO, boxSizing: 'border-box',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}
    >
      {children}
    </div>
  )
}

// compacto: el PNG del logo trae ~20% de borde transparente arriba y abajo;
// esta versión lo recorta y sube las líneas verdes (ver ENCABEZADO_COMPACTO_FIN),
// para la ficha de bono, que con el encabezado normal quedaba con mucho blanco arriba.
export const ENCABEZADO_COMPACTO_FIN = 110

export function Encabezado({ categoria, periodo, logoSrc, compacto = false }: { categoria: string; periodo: string; logoSrc: string; compacto?: boolean }) {
  if (compacto) {
    const linea = ENCABEZADO_COMPACTO_FIN - 6
    return (
      <>
        <div style={{ position: 'absolute', left: 58, top: 30, width: 330, height: 64, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="Roble Capital" style={{ position: 'absolute', left: -15, top: -18, width: 352 }} />
        </div>
        <div style={{ position: 'absolute', right: 60, top: 43, textAlign: 'right', ...etiqueta, lineHeight: '19px' }}>
          <div>{categoria}</div>
          <div>{periodo}</div>
        </div>
        <div style={{ position: 'absolute', left: 60, right: 60, top: linea, borderTop: `3px solid ${VERDE_LINEA}` }} />
        <div style={{ position: 'absolute', left: 60, right: 60, top: linea + 6, borderTop: `1px solid ${VERDE_LINEA}` }} />
      </>
    )
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="Roble Capital" style={{ position: 'absolute', left: 46, top: 25, width: 352 }} />
      <div style={{ position: 'absolute', right: 60, top: 70, textAlign: 'right', ...etiqueta, lineHeight: '19px' }}>
        <div>{categoria}</div>
        <div>{periodo}</div>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 128, borderTop: `3px solid ${VERDE_LINEA}` }} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: 134, borderTop: `1px solid ${VERDE_LINEA}` }} />
    </>
  )
}

// compacta: versión más baja para el análisis, donde hace falta lugar para texto e imagen.
export function BandaPrecio({ precio, tir, compacta = false, style }: { precio: string; tir: string; compacta?: boolean; style?: CSSProperties }) {
  const alto = compacta ? 100 : 135
  const fs = compacta ? 42 : 58
  const top = compacta ? 20 : 26
  return (
    <div style={{ position: 'relative', height: alto, background: '#EAEBEC', flexShrink: 0, ...style }}>
      <div style={{ position: 'absolute', left: 60, top }}>
        <div style={etiqueta}>Precio indicativo</div>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: fs, lineHeight: 1, color: GRIS_OSCURO, marginTop: 8 }}>{vacio(precio, '—')}</div>
      </div>
      <div style={{ position: 'absolute', left: 408, top: top - 1, height: alto - 2 * (top - 1), borderLeft: '1px solid #C9CBCE' }} />
      <div style={{ position: 'absolute', left: 441, top }}>
        <div style={etiqueta}>Rendimiento indicativo (TIR)</div>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: fs, lineHeight: 1, color: VERDE, marginTop: 8 }}>{vacio(tir, '—')}</div>
      </div>
    </div>
  )
}

export function Pie({ texto, pagina }: { texto: string; pagina?: string }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: PIE_TOP, bottom: 0, background: '#EDEEEF', borderTop: `3px solid ${VERDE_LINEA}` }}>
      <p style={{ margin: 0, padding: '16px 60px 0', fontSize: 10.2, lineHeight: '16px', letterSpacing: '0.012em', color: GRIS }}>
        {texto}
      </p>
      {pagina && (
        <div style={{ position: 'absolute', right: 60, bottom: 10, ...etiqueta, fontSize: 9.5 }}>{pagina}</div>
      )}
    </div>
  )
}

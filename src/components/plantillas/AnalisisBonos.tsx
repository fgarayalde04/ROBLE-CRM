import type { ReactNode } from 'react'
import { fichaBonoDisclaimer, type AnalisisBonosDatos, type BloqueAnalisis } from '@/lib/plantillas/tipos'
import {
  PAGINA_ROBLE, PIE_TOP, SERIF, SANS, VERDE, GRIS, etiqueta, etiquetaVerde, vacio,
  Hoja, Encabezado, BandaPrecio, Pie,
} from './roble'

// Análisis de bonos, con el mismo diseño que la ficha (816 × 1020 px por hoja).
//   Hoja 1: emisor y título, precio/TIR (si se completan), texto sobre la
//           empresa y la imagen del detalle del bono, que ocupa el espacio que
//           quede libre (se achica sola para entrar).
//   Hoja 2 (opcional): bloques con título, texto y/o imagen (gráficos, tablas).
// El área de contenido lleva data-plantilla-contenido para que el editor avise
// si algo no entra.

export const ANALISIS_PAGE = PAGINA_ROBLE

const CONTENIDO_TOP = 165
const CONTENIDO_BOTTOM = PAGINA_ROBLE.height - PIE_TOP + 22

function Parrafos({ valor }: { valor: string }) {
  const ps = valor.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <>
      {ps.map((p, i) => (
        <p key={i} style={{ margin: i ? '10px 0 0' : 0, fontFamily: SANS, fontSize: 14.5, lineHeight: '22px', color: '#33363A', whiteSpace: 'pre-line' }}>
          {p}
        </p>
      ))}
    </>
  )
}

function Titulo({ texto }: { texto: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={etiquetaVerde}>{texto}</div>
      <div style={{ borderTop: '1px solid #D9DADC', marginTop: 7 }} />
    </div>
  )
}

// Ocupa todo el espacio libre del bloque; la imagen se achica (sin deformarse)
// para entrar. data-plantilla-imagen: el editor avisa si queda muy chica.
function Imagen({ src, vacioTexto }: { src: string | null; vacioTexto: string }) {
  return (
    <div data-plantilla-imagen="" style={{ flex: 1, minHeight: 0, marginTop: 14, position: 'relative' }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center', display: 'block' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, border: '1px dashed #C9CBCE', display: 'flex',
          alignItems: 'center', justifyContent: 'center', ...etiqueta, fontSize: 10, color: '#A0A3A7',
        }}>
          {vacioTexto}
        </div>
      )}
    </div>
  )
}

function Contenido({ numero, children }: { numero: number; children: ReactNode }) {
  return (
    <div
      data-plantilla-contenido={numero}
      style={{
        position: 'absolute', left: 0, right: 0, top: CONTENIDO_TOP, bottom: CONTENIDO_BOTTOM,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

function Bloque({ b, imagenUrl }: { b: BloqueAnalisis; imagenUrl: (key: string) => string }) {
  return (
    <div style={{
      padding: '0 60px', marginTop: 24, display: 'flex', flexDirection: 'column',
      ...(b.imagen_key ? { flex: '1 1 0', minHeight: 0 } : { flexShrink: 0 }),
    }}>
      {b.titulo.trim() && <Titulo texto={b.titulo} />}
      {b.texto.trim() && <div style={{ marginTop: 12, flexShrink: 0 }}><Parrafos valor={b.texto} /></div>}
      {b.imagen_key && <Imagen src={imagenUrl(b.imagen_key)} vacioTexto="" />}
    </div>
  )
}

export default function AnalisisBonos({
  datos, imagenUrl, logoSrc = '/download.png',
}: {
  datos: AnalisisBonosDatos
  imagenUrl: (key: string) => string
  logoSrc?: string
}) {
  const d = datos
  const dos = !!d.segunda_hoja
  const disclaimer = fichaBonoDisclaimer(d.fecha_precios)
  const conPrecio = !!(d.precio?.trim() || d.tir?.trim())
  const bloques = (d.bloques ?? []).filter((b) => b.titulo.trim() || b.texto.trim() || b.imagen_key)

  return (
    <div>
      <Hoja>
        <Encabezado categoria={d.categoria} periodo={d.periodo} logoSrc={logoSrc} />
        <Contenido numero={1}>
          <div style={{ padding: '0 60px', flexShrink: 0 }}>
            <div style={{ ...etiqueta, fontSize: 11.8 }}>{vacio(d.emisor_largo, 'Emisor')}</div>
            <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 44, lineHeight: 1.1, color: VERDE, marginTop: 10, letterSpacing: '-0.005em' }}>
              {vacio(d.titulo, 'Título del análisis')}
            </div>
            {d.subtitulo?.trim() && (
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18.5, color: GRIS, marginTop: 4 }}>{d.subtitulo}</div>
            )}
          </div>

          {conPrecio && <BandaPrecio precio={d.precio} tir={d.tir} compacta style={{ marginTop: 22 }} />}

          <div style={{ padding: '0 60px', marginTop: 24, flexShrink: 0 }}>
            <Titulo texto={vacio(d.sobre_titulo, 'Sobre el emisor')} />
            <div style={{ marginTop: 12 }}>
              {d.sobre_emisor?.trim()
                ? <Parrafos valor={d.sobre_emisor} />
                : <p style={{ margin: 0, fontSize: 14.5, color: '#A0A3A7' }}>Información de la empresa…</p>}
            </div>
          </div>

          <div style={{ padding: '0 60px', marginTop: 24, flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Titulo texto={vacio(d.detalle_titulo, 'Detalle del bono')} />
            <Imagen src={d.detalle_imagen_key ? imagenUrl(d.detalle_imagen_key) : null} vacioTexto="Imagen del detalle del bono" />
          </div>
        </Contenido>
        <Pie texto={disclaimer} pagina={dos ? '1 / 2' : undefined} />
      </Hoja>

      {dos && (
        <Hoja>
          <Encabezado categoria={d.categoria} periodo={d.periodo} logoSrc={logoSrc} />
          <Contenido numero={2}>
            <div style={{ padding: '0 60px', flexShrink: 0 }}>
              <div style={{ ...etiqueta, fontSize: 11.8 }}>{vacio(d.emisor_largo, 'Emisor')}</div>
              <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 30, lineHeight: 1.15, color: VERDE, marginTop: 8 }}>
                {vacio(d.titulo, 'Título del análisis')}
              </div>
            </div>
            {bloques.length
              ? bloques.map((b) => <Bloque key={b.id} b={b} imagenUrl={imagenUrl} />)
              : <div style={{ padding: '24px 60px 0', fontSize: 14.5, color: '#A0A3A7' }}>Agregá gráficos, tablas o más detalle…</div>}
          </Contenido>
          <Pie texto={disclaimer} pagina="2 / 2" />
        </Hoja>
      )}
    </div>
  )
}

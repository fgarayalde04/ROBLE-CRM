import { fichaBonoDisclaimer, type FichaBonoDatos } from '@/lib/plantillas/tipos'
import {
  PAGINA_ROBLE, SERIF, VERDE, GRIS, GRIS_OSCURO, etiqueta, etiquetaVerde, vacio,
  Hoja, Encabezado, ENCABEZADO_COMPACTO_FIN, BandaPrecio, Pie,
} from './roble'

// Ficha de bono (formato "Petrobras 5,125% 2030"): una hoja de 816 × 1020 px.

export const FICHA_BONO_PAGE = PAGINA_ROBLE

export default function FichaBono({ datos, logoSrc = '/download.png' }: { datos: FichaBonoDatos; logoSrc?: string }) {
  const d = datos
  const filas: [string, string, string, string][] = [
    ['Emisor', d.emisor, 'Garante', d.garante],
    ['Cupón', d.cupon, 'Pago de cupón', d.pago_cupon],
    ['Vencimiento', d.vencimiento, 'Prelación', d.prelacion],
    ['Calificación', d.calificacion, 'Mínimo / incremento', d.minimo],
    ['ISIN', d.isin, 'Monto emitido', d.monto_emitido],
  ]

  return (
    <Hoja>
      <Encabezado categoria={d.categoria} periodo={d.periodo} logoSrc={logoSrc} compacto />

      {/* Título */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: ENCABEZADO_COMPACTO_FIN + 36 }}>
        <div style={{ ...etiqueta, fontSize: 11.8 }}>{vacio(d.emisor_largo, 'Emisor')}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 58, lineHeight: 1.1, color: VERDE, marginTop: 10, letterSpacing: '-0.005em' }}>
          {vacio(d.titulo, 'Título del bono')}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18.5, color: GRIS, marginTop: 4 }}>{d.subtitulo}</div>
      </div>

      <BandaPrecio precio={d.precio} tir={d.tir} style={{ position: 'absolute', left: 0, right: 0, top: 296 }} />

      {/* Características */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: 470 }}>
        <div style={etiquetaVerde}>Características del instrumento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 42, marginTop: 10 }}>
          {[0, 1].map((col) => (
            <div key={col} style={{ borderTop: '1px solid #D9DADC' }}>
              {filas.map((f) => (
                <div
                  key={f[col * 2]}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    height: 50, borderBottom: '1px solid #D9DADC', fontSize: 15,
                  }}
                >
                  <span style={{ color: GRIS }}>{f[col * 2]}</span>
                  <span style={{ fontWeight: 700, color: GRIS_OSCURO, textAlign: 'right' }}>{vacio(f[col * 2 + 1], '—')}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Pie texto={fichaBonoDisclaimer(d.fecha_precios)} />
    </Hoja>
  )
}

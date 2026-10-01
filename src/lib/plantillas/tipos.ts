// Plantillas de documentos con formato fijo (Research → Plantillas). El diseño
// (logo, colores, tipografías, pie, disclaimer) vive en los componentes de
// src/components/plantillas; acá solo están los datos que se completan.

export type TipoPlantilla = 'ficha_bono' | 'analisis_bonos'

export const TIPOS_PLANTILLA: Record<TipoPlantilla, { label: string; plural: string; descripcion: string }> = {
  ficha_bono: {
    label: 'Ficha de bono',
    plural: 'Fichas de bono',
    descripcion: 'Una hoja con precio, TIR y características del instrumento. Para nuevas emisiones.',
  },
  analisis_bonos: {
    label: 'Análisis de bonos',
    plural: 'Análisis de bonos',
    descripcion: 'Mismo formato que la ficha, con texto sobre el emisor y la imagen del detalle del bono. Segunda hoja opcional para gráficos.',
  },
}

export function isTipoPlantilla(v: unknown): v is TipoPlantilla {
  return v === 'ficha_bono' || v === 'analisis_bonos'
}

// ── Ficha de bono ────────────────────────────────────────────────────────────

export interface FichaBonoDatos {
  categoria: string
  periodo: string
  emisor_largo: string
  titulo: string
  subtitulo: string
  precio: string
  tir: string
  emisor: string
  garante: string
  cupon: string
  pago_cupon: string
  vencimiento: string
  prelacion: string
  calificacion: string
  minimo: string
  isin: string
  monto_emitido: string
  fecha_precios: string
}

export interface CampoDef<K extends string> {
  key: K
  label: string
  placeholder?: string
  ancho?: 'completo' | 'medio'
}

export const FICHA_BONO_GRUPOS: { titulo: string; campos: CampoDef<keyof FichaBonoDatos>[] }[] = [
  {
    titulo: 'Encabezado',
    campos: [
      { key: 'categoria', label: 'Categoría', placeholder: 'Renta fija corporativa', ancho: 'medio' },
      { key: 'periodo', label: 'Mes', placeholder: 'Septiembre 2026', ancho: 'medio' },
      { key: 'emisor_largo', label: 'Emisor (línea superior)', placeholder: 'Petróleo Brasileiro S.A. — Petrobras' },
      { key: 'titulo', label: 'Título', placeholder: 'Petrobras 5,125% 2030' },
      { key: 'subtitulo', label: 'Subtítulo', placeholder: 'Obligación negociable senior en dólares estadounidenses' },
    ],
  },
  {
    titulo: 'Precio',
    campos: [
      { key: 'precio', label: 'Precio indicativo', placeholder: '98,75', ancho: 'medio' },
      { key: 'tir', label: 'Rendimiento indicativo (TIR)', placeholder: '5,60%', ancho: 'medio' },
      { key: 'fecha_precios', label: 'Precios al', placeholder: '25/09/2026', ancho: 'medio' },
    ],
  },
  {
    titulo: 'Características del instrumento',
    campos: [
      { key: 'emisor', label: 'Emisor', placeholder: 'Petrobras Global Finance B.V.', ancho: 'medio' },
      { key: 'garante', label: 'Garante', placeholder: 'Petrobras S.A.', ancho: 'medio' },
      { key: 'cupon', label: 'Cupón', placeholder: '5,125% fijo', ancho: 'medio' },
      { key: 'pago_cupon', label: 'Pago de cupón', placeholder: 'Semestral · 10/03 y 10/09', ancho: 'medio' },
      { key: 'vencimiento', label: 'Vencimiento', placeholder: '10/09/2030', ancho: 'medio' },
      { key: 'prelacion', label: 'Prelación', placeholder: 'Senior no garantizado', ancho: 'medio' },
      { key: 'calificacion', label: 'Calificación (Moody’s / S&P / Fitch)', placeholder: 'Ba1 / BB / BB', ancho: 'medio' },
      { key: 'minimo', label: 'Mínimo / incremento', placeholder: 'USD 2.000 / 1.000', ancho: 'medio' },
      { key: 'isin', label: 'ISIN', placeholder: 'US71647NBM02', ancho: 'medio' },
      { key: 'monto_emitido', label: 'Monto emitido', placeholder: 'USD 1.000 millones', ancho: 'medio' },
    ],
  },
]

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function periodoActual() {
  const d = new Date()
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

function hoyDDMMYYYY() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function fichaBonoVacia(): FichaBonoDatos {
  return {
    categoria: 'Renta fija corporativa',
    periodo: periodoActual(),
    emisor_largo: '',
    titulo: '',
    subtitulo: 'Obligación negociable senior en dólares estadounidenses',
    precio: '',
    tir: '',
    emisor: '',
    garante: '',
    cupon: '',
    pago_cupon: '',
    vencimiento: '',
    prelacion: 'Senior no garantizado',
    calificacion: '',
    minimo: '',
    isin: '',
    monto_emitido: '',
    fecha_precios: hoyDDMMYYYY(),
  }
}

export function fichaBonoDisclaimer(fechaPrecios: string) {
  return `Precios y rendimientos indicativos al ${fechaPrecios || '—'}, sujetos a cambios según las condiciones de mercado y a disponibilidad. Calificaciones: Moody's / S&P / Fitch. Este material tiene fines exclusivamente informativos y no constituye una oferta, invitación ni recomendación de compra o venta de valores. Las inversiones en renta fija conllevan riesgos, entre ellos de crédito, de tasa de interés, de liquidez y cambiarios, y pueden generar pérdidas de capital. Rendimientos pasados no garantizan resultados futuros. Antes de invertir, consulte con su asesor para evaluar si el instrumento se ajusta a su perfil de riesgo. Roble Capital Wealth Management.`
}

// ── Análisis de bonos ────────────────────────────────────────────────────────
// Mismo diseño que la ficha. Hoja 1: texto sobre el emisor + imagen del
// detalle del bono. Hoja 2 opcional: bloques libres (texto y/o imagen).

export interface BloqueAnalisis {
  id: string
  titulo: string
  texto: string
  imagen_key: string | null
}

export interface AnalisisBonosDatos {
  categoria: string
  periodo: string
  emisor_largo: string
  titulo: string
  subtitulo: string
  precio: string
  tir: string
  fecha_precios: string
  sobre_titulo: string
  sobre_emisor: string
  detalle_titulo: string
  detalle_imagen_key: string | null
  segunda_hoja: boolean
  bloques: BloqueAnalisis[]
}

export function nuevoBloque(titulo = ''): BloqueAnalisis {
  return { id: Math.random().toString(36).slice(2, 10), titulo, texto: '', imagen_key: null }
}

export function analisisBonosVacio(): AnalisisBonosDatos {
  return {
    categoria: 'Análisis de renta fija',
    periodo: periodoActual(),
    emisor_largo: '',
    titulo: '',
    subtitulo: '',
    precio: '',
    tir: '',
    fecha_precios: hoyDDMMYYYY(),
    sobre_titulo: 'Sobre el emisor',
    sobre_emisor: '',
    detalle_titulo: 'Detalle del bono',
    detalle_imagen_key: null,
    segunda_hoja: false,
    bloques: [nuevoBloque('Evolución de precio'), nuevoBloque('Expectativas de mercado')],
  }
}

export function datosVacios(tipo: TipoPlantilla): FichaBonoDatos | AnalisisBonosDatos {
  return tipo === 'ficha_bono' ? fichaBonoVacia() : analisisBonosVacio()
}

/** Campos obligatorios sin completar (para avisar antes de bajar el PDF). */
export function camposFaltantes(tipo: TipoPlantilla, datos: any): string[] {
  if (tipo === 'ficha_bono') {
    return FICHA_BONO_GRUPOS.flatMap((g) => g.campos)
      .filter((c) => !String(datos?.[c.key] ?? '').trim())
      .map((c) => c.label)
  }
  const d = datos as AnalisisBonosDatos
  const faltan: string[] = []
  if (!d?.emisor_largo?.trim()) faltan.push('Emisor (línea superior)')
  if (!d?.titulo?.trim()) faltan.push('Título')
  if (!d?.periodo?.trim()) faltan.push('Mes')
  if (!d?.sobre_emisor?.trim()) faltan.push('Texto sobre el emisor')
  if (!d?.detalle_imagen_key) faltan.push('Imagen del detalle del bono')
  if (d?.segunda_hoja) {
    d.bloques?.forEach((b, i) => {
      if (!b.imagen_key && !b.texto.trim()) faltan.push(`Contenido del bloque ${i + 1} (hoja 2)`)
    })
  }
  return faltan
}

/** Nombre del documento para la lista y el archivo PDF. */
export function tituloDocumento(tipo: TipoPlantilla, datos: any): string {
  if (tipo === 'ficha_bono') return datos?.titulo?.trim() || 'Ficha de bono sin título'
  const t = datos?.titulo?.trim() ? `Análisis · ${datos.titulo.trim()}` : ''
  return t || 'Análisis sin título'
}

import { INICIO_HISTORICO } from '@/lib/masOperado/periodos'

// Plantillas de documentos con formato fijo (Research → Plantillas). El diseño
// (logo, colores, tipografías, pie, disclaimer) vive en los componentes de
// src/components/plantillas; acá solo están los datos que se completan.

export type TipoPlantilla = 'ficha_bono' | 'analisis_bonos' | 'comparativo_fondos' | 'mas_operado_fondos' | 'mas_operado_bonos'

// web: sección y subcarpeta de la web de clientes donde se publica.
export const TIPOS_PLANTILLA: Record<TipoPlantilla, {
  label: string; plural: string; descripcion: string; categoriaResearch: string
  web: { section: string; subsection: string } | null
}> = {
  ficha_bono: {
    label: 'Ficha de bono',
    plural: 'Fichas de bono',
    categoriaResearch: 'nueva_emision',
    web: { section: 'renta-fija', subsection: 'nuevas-emisiones' },
    descripcion: 'Una hoja con precio, TIR y características del instrumento. Para nuevas emisiones.',
  },
  analisis_bonos: {
    label: 'Análisis de bonos',
    plural: 'Análisis de bonos',
    categoriaResearch: 'bono',
    web: { section: 'renta-fija', subsection: 'analisis-bonos' },
    descripcion: 'Mismo formato que la ficha, con texto sobre el emisor y la imagen del detalle del bono. Segunda hoja opcional para gráficos.',
  },
  comparativo_fondos: {
    label: 'Comparativo de fondos',
    plural: 'Comparativos de fondos',
    categoriaResearch: 'fondo',
    web: { section: 'comparativos', subsection: 'fondos' },
    descripcion: 'Tabla de rendimientos de los fondos de una categoría o asset class, tomada del Monitor de fondos.',
  },
  mas_operado_fondos: {
    label: 'Fondos más comprados',
    plural: 'Fondos más comprados',
    categoriaResearch: 'fondo',
    web: { section: 'mas-operado', subsection: 'fondos' },
    descripcion: 'Los fondos que más compraron los clientes (sale solo de las órdenes), con sus rendimientos y nuestra visión de mercado.',
  },
  mas_operado_bonos: {
    label: 'Bonos más comprados',
    plural: 'Bonos más comprados',
    categoriaResearch: 'bono',
    web: { section: 'mas-operado', subsection: 'bonos' },
    descripcion: 'Los bonos que más compraron los clientes (sale solo de las órdenes), con cupón, vencimiento y nuestra visión de renta fija.',
  },
}

export function isTipoPlantilla(v: unknown): v is TipoPlantilla {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIPOS_PLANTILLA, v)
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

// ── Comparativo de fondos ────────────────────────────────────────────────────
// Rendimientos (en %) de los fondos de una categoría del Monitor de fondos. Se
// guarda una foto de los números: el PDF no cambia hasta que se actualiza.

export interface FilaComparativo {
  manual_id?: string           // fondo agregado a mano (no está en el Monitor)
  isin: string
  nombre: string
  gestora: string
  moneda: string
  subcategoria: string
  r_ytd: number | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
}

export const COLUMNAS_COMPARATIVO: { key: keyof FilaComparativo; label: string; destacada?: boolean }[] = [
  { key: 'r_ytd', label: 'YTD', destacada: true },
  { key: 'r_1y', label: '1 año' },
  { key: 'r_3y', label: '3 años' },
  { key: 'r_5y', label: '5 años' },
  { key: 'y_2025', label: '2025' },
  { key: 'y_2024', label: '2024' },
  { key: 'y_2023', label: '2023' },
]

export interface ComparativoFondosDatos {
  categoria: string
  periodo: string
  titulo: string
  subtitulo: string
  comentario: string
  asset_class: string          // categoría del Monitor de la que salen los fondos
  subcategoria_filtro?: string // '' = todas las subcategorías
  fecha_datos: string
  filas: FilaComparativo[]
}

export function comparativoFondosVacio(): ComparativoFondosDatos {
  return {
    categoria: 'Fondos de inversión',
    periodo: periodoActual(),
    titulo: '',
    subtitulo: '',
    comentario: '',
    asset_class: '',
    fecha_datos: hoyDDMMYYYY(),
    filas: [],
  }
}

// ── Lo más operado (fondos / bonos) ─────────────────────────────────────────
// Solo lo más COMPRADO por los clientes, por nombre (sin ISIN ni clases), con
// los rendimientos de cada fondo y, abajo, nuestra visión de mercado.

export interface FilaFondoOperado {
  nombre: string
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
}

export interface FilaBonoOperado {
  nombre: string
  cupon: string
  vencimiento: string
  moneda: string
}

export const COLUMNAS_REND_FONDO: { key: Exclude<keyof FilaFondoOperado, 'nombre'>; label: string; destacada?: boolean }[] = [
  { key: 'r_ytd', label: 'YTD', destacada: true },
  { key: 'r_1y', label: '1 año' },
  { key: 'r_3y', label: '3 años' },
  { key: 'r_5y', label: '5 años' },
  { key: 'y_2025', label: '2025' },
  { key: 'y_2024', label: '2024' },
  { key: 'y_2023', label: '2023' },
  { key: 'y_2022', label: '2022' },
  { key: 'y_2021', label: '2021' },
]

export interface MasOperadoDatos<F> {
  categoria: string
  periodo: string
  titulo: string
  subtitulo: string
  comentario: string
  desde: string                // período de las órdenes (YYYY-MM-DD)
  hasta: string
  cantidad: number             // filas al cargar desde las órdenes
  compras: F[]
  vision_titulo: string        // texto de abajo: visión de mercado / por qué los cambios
  vision: string
}

export type MasOperadoFondosDatos = MasOperadoDatos<FilaFondoOperado>
export type MasOperadoBonosDatos = MasOperadoDatos<FilaBonoOperado>

export function filaFondoVacia(): FilaFondoOperado {
  return { nombre: '', r_1y: null, r_3y: null, r_5y: null, r_ytd: null, y_2025: null, y_2024: null, y_2023: null, y_2022: null, y_2021: null }
}

export function filaBonoVacia(): FilaBonoOperado {
  return { nombre: '', cupon: '', vencimiento: '', moneda: 'USD' }
}

export function masOperadoVacio(tipo: 'mas_operado_fondos' | 'mas_operado_bonos'): MasOperadoDatos<any> {
  const fondos = tipo === 'mas_operado_fondos'
  return {
    categoria: fondos ? 'Fondos de inversión' : 'Renta fija',
    periodo: periodoActual(),
    titulo: fondos ? 'Los fondos más comprados' : 'Los bonos más comprados',
    subtitulo: fondos ? 'Los fondos que más compraron nuestros clientes' : 'Los bonos que más compraron nuestros clientes',
    comentario: '',
    desde: '',
    hasta: '',
    cantidad: 8,
    compras: [],
    vision_titulo: fondos ? 'Nuestra visión' : 'Nuestra visión de renta fija',
    vision: '',
  }
}

export function masOperadoDisclaimer(desde: string, hasta: string, conRendimientos = false) {
  const f = (s: string) => (s ? s.split('-').reverse().join('/') : '—')
  const rango = desde === INICIO_HISTORICO ? `hasta el ${f(hasta)}` : `entre el ${f(desde)} y el ${f(hasta)}`
  const rend = conRendimientos ? ' Rendimientos en porcentaje, en la moneda de cada fondo y de una clase representativa; fuente: gestoras y proveedores de datos, sujetos a revisión.' : ''
  return `Ranking elaborado por Roble Capital a partir de la cantidad de órdenes de compra de sus clientes ${rango}. No refleja montos operados ni constituye una recomendación de compra o venta.${rend} Este material tiene fines exclusivamente informativos y no constituye una oferta ni invitación a invertir. Rendimientos pasados no garantizan resultados futuros. Antes de invertir, consulte con su asesor. Roble Capital Wealth Management.`
}

export function comparativoDisclaimer(fecha: string) {
  return `Rendimientos en porcentaje y en la moneda de cada fondo, con datos al ${fecha || '—'}. YTD: en lo que va del año. Fuente: gestoras y proveedores de datos, sujetos a revisión. Este material tiene fines exclusivamente informativos y no constituye una oferta, invitación ni recomendación de compra o venta. Rendimientos pasados no garantizan resultados futuros. Antes de invertir, consulte con su asesor y lea el prospecto del fondo. Roble Capital Wealth Management.`
}

export function datosVacios(tipo: TipoPlantilla): any {
  switch (tipo) {
    case 'ficha_bono': return fichaBonoVacia()
    case 'analisis_bonos': return analisisBonosVacio()
    case 'comparativo_fondos': return comparativoFondosVacio()
    default: return masOperadoVacio(tipo)
  }
}

/** Campos obligatorios sin completar (para avisar antes de bajar el PDF). */
export function camposFaltantes(tipo: TipoPlantilla, datos: any): string[] {
  if (tipo === 'ficha_bono') {
    return FICHA_BONO_GRUPOS.flatMap((g) => g.campos)
      .filter((c) => !String(datos?.[c.key] ?? '').trim())
      .map((c) => c.label)
  }
  if (tipo === 'comparativo_fondos' || tipo === 'mas_operado_fondos' || tipo === 'mas_operado_bonos') {
    const faltan: string[] = []
    if (!datos?.titulo?.trim()) faltan.push('Título')
    if (!datos?.periodo?.trim()) faltan.push('Mes')
    if (tipo === 'comparativo_fondos') {
      if (!datos?.filas?.length) faltan.push('Fondos del comparativo')
      if (datos?.filas?.some((f: any) => !String(f.nombre ?? '').trim())) faltan.push('Nombre de los fondos agregados a mano')
    } else {
      if (!datos?.vision?.trim()) faltan.push('Nuestra visión (texto de abajo)')
      const filas = datos?.compras ?? []
      if (!filas.length) faltan.push('Instrumentos (cargalos desde las órdenes)')
      if (filas.some((f: any) => !f.nombre?.trim())) faltan.push('Nombre de todos los instrumentos')
    }
    return faltan
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
  if (tipo === 'comparativo_fondos') {
    return datos?.titulo?.trim() ? `Comparativo · ${datos.titulo.trim()}` : 'Comparativo de fondos sin título'
  }
  if (tipo === 'mas_operado_fondos' || tipo === 'mas_operado_bonos') {
    const base = datos?.titulo?.trim() || TIPOS_PLANTILLA[tipo].label
    return datos?.periodo?.trim() ? `${base} · ${datos.periodo.trim()}` : base
  }
  const t = datos?.titulo?.trim() ? `Análisis · ${datos.titulo.trim()}` : ''
  return t || 'Análisis sin título'
}

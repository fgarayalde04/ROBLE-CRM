// Posición Consolidada: tipos compartidos entre la lectura de los archivos de
// cada banco (Pershing y Morgan Stanley), el cálculo del reporte y la pantalla.

export type Banco = 'Pershing' | 'Morgan Stanley'
export const BANCOS: Banco[] = ['Pershing', 'Morgan Stanley']

export type TipoArchivo = 'posiciones' | 'movimientos' | 'cupones'
export const TIPOS_ARCHIVO: { tipo: TipoArchivo; label: string; pershing: string; morgan: string }[] = [
  { tipo: 'posiciones', label: 'Posiciones', pershing: 'Unrealized Gain Loss', morgan: 'Holdings - Cost Basis' },
  { tipo: 'movimientos', label: 'Movimientos', pershing: 'Activity', morgan: 'Activity' },
  { tipo: 'cupones', label: 'Calendario de cupones', pershing: 'Incoming Cash', morgan: 'Projected Income' },
]

export const CLASES = ['Efectivo', 'Renta fija', 'Fondos de inversión', 'ETF', 'Acciones', 'Otros'] as const
export type Clase = (typeof CLASES)[number]

/** Una posición de una cuenta en un banco (los lotes ya vienen sumados). */
export interface Posicion {
  banco: Banco
  cuenta: string | null
  cusip: string | null
  simbolo: string | null
  descripcion: string
  clase: Clase
  /** Categoría tal como la nombra el banco (Corporate Bonds, Common Stocks…). */
  categoria: string | null
  cantidad: number | null
  precio: number | null
  valorMercado: number
  costo: number | null
  resultado: number | null
  /** Cupón corrido si el archivo lo trae (Morgan "Holdings Ungrouped"); si no, se calcula. */
  cuponCorridoArchivo: number | null
  /** Cupón anual en decimal (0.07625), si se pudo leer. */
  tasa: number | null
  vencimiento: string | null // YYYY-MM-DD
  /** Fechas de compra de los lotes (YYYY-MM-DD). Los consolidados guardados antes no la tienen. */
  fechasCompra?: string[]
}

export interface ArchivoPosiciones {
  tipo: 'posiciones'
  banco: Banco
  nombre: string
  fecha: string | null
  cuentas: string[]
  posiciones: Posicion[]
  /** Valor de mercado total que declara el archivo, para controlar la suma. */
  totalArchivo: number | null
  avisos: string[]
}

export type ClasePago = 'Cupón' | 'Dividendo' | 'Otro'

/** Un pago proyectado. En Morgan no hay CUSIP ni cuenta: se asocia por nombre. */
export interface Pago {
  banco: Banco
  cuenta: string | null
  fecha: string // YYYY-MM-DD
  clase: ClasePago
  cusip: string | null
  descripcion: string
  monto: number
  cantidad: number | null
  /** Morgan: fila del Projected Income de la que sale (agrupa los pagos de un mismo título). */
  grupo?: string
}

export interface ArchivoCupones {
  tipo: 'cupones'
  banco: Banco
  nombre: string
  fecha: string | null
  cuentas: string[]
  pagos: Pago[]
  avisos: string[]
}

export interface Movimiento {
  banco: Banco
  cuenta: string | null
  fecha: string | null
  fechaOperacion: string | null
  tipo: string
  descripcion: string
  simbolo: string | null
  cusip: string | null
  cantidad: number | null
  precio: number | null
  monto: number | null
}

export interface Terminos {
  tasa: number | null
  vencimiento: string | null
  /** Sin vencimiento (perpetuo, típico de los CoCos y algunos híbridos). */
  perpetuo?: boolean
}

export interface ArchivoMovimientos {
  tipo: 'movimientos'
  banco: Banco
  nombre: string
  fecha: string | null
  cuentas: string[]
  movimientos: Movimiento[]
  /** Tasa y vencimiento por CUSIP leídos de las descripciones (sirven para el cupón corrido). */
  terminos: Record<string, Terminos>
  avisos: string[]
}

export type ArchivoLeido = ArchivoPosiciones | ArchivoCupones | ArchivoMovimientos

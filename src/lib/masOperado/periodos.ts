// Períodos (mes o semana) para "Lo más operado". Fechas como 'YYYY-MM-DD' en
// hora de Montevideo; sin imports de servidor para usarlo también en el cliente.

export type TipoPeriodo = 'mes' | 'semana'

export interface Periodo {
  tipo: TipoPeriodo
  desde: string
  hasta: string
  label: string
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export const ddmm = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function hoyMontevideo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
}

export function esFechaIso(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function periodoMes(fecha: string): Periodo {
  const d = parse(fecha)
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { tipo: 'mes', desde: iso(ini), hasta: iso(fin), label: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
}

// Semana de lunes a domingo
export function periodoSemana(fecha: string): Periodo {
  const d = parse(fecha)
  const ini = new Date(d)
  ini.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const fin = new Date(ini)
  fin.setUTCDate(ini.getUTCDate() + 6)
  return { tipo: 'semana', desde: iso(ini), hasta: iso(fin), label: `Semana del ${ddmm(iso(ini))} al ${ddmm(iso(fin))}` }
}

export function periodoDe(tipo: TipoPeriodo, fecha: string): Periodo {
  return tipo === 'mes' ? periodoMes(fecha) : periodoSemana(fecha)
}

/** Período anterior (-1) o siguiente (+1). */
export function moverPeriodo(p: Periodo, dir: -1 | 1): Periodo {
  const d = parse(p.desde)
  if (p.tipo === 'mes') return periodoMes(iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1))))
  d.setUTCDate(d.getUTCDate() + 7 * dir)
  return periodoSemana(iso(d))
}

/** Para un informe mensual: en la primera semana del mes se toma el mes anterior (el actual casi no tiene órdenes). */
export function mesParaInforme(hoy = hoyMontevideo()): Periodo {
  const actual = periodoMes(hoy)
  return Number(hoy.slice(8, 10)) <= 7 ? moverPeriodo(actual, -1) : actual
}

/** Etiqueta para un rango cualquiera: el nombre del mes si es un mes completo. */
export function labelRango(desde: string, hasta: string): string {
  const mes = periodoMes(desde)
  if (mes.desde === desde && mes.hasta === hasta) return mes.label
  const sem = periodoSemana(desde)
  if (sem.desde === desde && sem.hasta === hasta) return sem.label
  return `Del ${ddmm(desde)} al ${ddmm(hasta)}`
}

// Fechas de corte de los rendimientos de fondos: el 15 y el último día de cada
// mes (Montevideo). Sin imports de servidor para poder testearlo solo.

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** Último corte (15 o fin de mes) igual o anterior a `hoy` ('YYYY-MM-DD'). */
export function ultimoCorte(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  const finDeMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d === finDeMes) return hoy
  if (d >= 15) return iso(new Date(Date.UTC(y, m - 1, 15)))
  return iso(new Date(Date.UTC(y, m - 1, 0)))
}

/** Próximo corte posterior a `hoy`. */
export function proximoCorte(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  if (d < 15) return iso(new Date(Date.UTC(y, m - 1, 15)))
  const fin = iso(new Date(Date.UTC(y, m, 0)))
  return fin > hoy ? fin : iso(new Date(Date.UTC(y, m, 15)))
}

/** Fecha 'YYYY-MM-DD' en Montevideo de un instante. */
export function fechaMontevideo(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
}

// Un dato bajado de Davinci se usa durante 15 días; recién después se vuelve a buscar.
export const DIAS_VIGENCIA = 15

/** true si el dato se bajó hace menos de DIAS_VIGENCIA días (por fecha de Montevideo). */
export function vigente(bajado: Date | string | null | undefined, hoy: string = fechaMontevideo()): boolean {
  if (!bajado) return false
  const d = bajado instanceof Date ? bajado : new Date(bajado)
  if (Number.isNaN(d.getTime())) return false
  const dias = (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fechaMontevideo(d)}T00:00:00Z`)) / 86400000
  return dias < DIAS_VIGENCIA
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "14 Setiembre 26" — mismo formato que los archivos ya existentes (día 2 dígitos, mes en español, año 2 dígitos). */
export function monthNameEs(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = MESES[date.getMonth()]
  const year = String(date.getFullYear()).slice(-2)
  return `${day} ${month} ${year}`
}

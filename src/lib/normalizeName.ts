// Para emparejar nombres de carpetas/legajos con clientes: sin tildes, sin
// mayúsculas, sin puntuación ni espacios repetidos ("Nicolás Martín" == "NICOLAS MARTIN").
export function normalizeNameKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

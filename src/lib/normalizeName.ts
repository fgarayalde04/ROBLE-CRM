// Para emparejar nombres de carpetas/legajos con clientes: sin tildes, sin
// mayúsculas, sin puntuación ni espacios repetidos ("Nicolás Martín" == "NICOLAS MARTIN").
export function normalizeNameKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Clave para decidir si dos nombres son la misma persona aunque el orden
// cambie ("MONTAUTTI Juan" == "Juan Montautti"): normalizado y con las
// palabras ordenadas. Solo para emparejar — nunca para mostrar.
export function nameMatchKey(value: string | null | undefined): string {
  return normalizeNameKey(value).split(' ').filter(Boolean).sort().join(' ')
}

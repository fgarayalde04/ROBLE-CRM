'use client'

// Fila de "pills" para elegir, entre los emails conocidos de un cliente,
// cuál va como Para y cuáles como CC — el mismo bloque de UI vive repetido
// (con solo el estado subyacente distinto) en Enviar Órdenes, Formulario
// Directo, Mesa y Bandeja de Mesa. Es puramente presentacional: cada
// pantalla sigue manejando su propio estado ("Para" único vs array, con o
// sin swap automático a CC) a través de isTo/isCc/onToggleTo/onToggleCc —
// unificar esto no cambia el comportamiento de ninguna pantalla, solo evita
// que un bug de esta UI (o una mejora) haya que arreglarlo/aplicarlo 4 veces.
interface Props {
  emails:     string[]
  isTo:       (email: string) => boolean
  isCc:       (email: string) => boolean
  onToggleTo: (email: string) => void
  onToggleCc: (email: string) => void
  label?:     string
  toTitle?:   string | ((isTo: boolean) => string)
}

export default function ClientEmailTogglePills({
  emails, isTo, isCc, onToggleTo, onToggleCc,
  label = 'Emails del cliente:', toTitle,
}: Props) {
  if (emails.length <= 1) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
      <span className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</span>
      {emails.map(e => {
        const to = isTo(e)
        const cc = isCc(e)
        const title = typeof toTitle === 'function'
          ? toTitle(to)
          : toTitle ?? (to ? 'Quitar de Destinatarios' : 'Agregar a Destinatarios')
        return (
          <span key={e} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleTo(e)}
              title={title}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                to
                  ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {e}
            </button>
            {!to && (
              <button
                type="button"
                onClick={() => onToggleCc(e)}
                title={cc ? 'Quitar de CC' : 'Agregar como CC'}
                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  cc
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-blue-200 hover:text-blue-600'
                }`}
              >
                {cc ? '✓ CC' : '+ CC'}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

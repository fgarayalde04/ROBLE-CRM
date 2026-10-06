'use client'

import { useMemo, useState } from 'react'
import type { TimelineItem, TimelineKind } from '@/lib/db/client360'

const KIND_CFG: Record<TimelineKind, { label: string; dot: string }> = {
  orden:       { label: 'Órdenes',     dot: 'bg-indigo-500' },
  respuesta:   { label: 'Respuestas',  dot: 'bg-sky-500' },
  propuesta:   { label: 'Propuestas',  dot: 'bg-amber-500' },
  reunion:     { label: 'Reuniones',   dot: 'bg-emerald-500' },
  tarea:       { label: 'Tareas',      dot: 'bg-slate-400' },
  documento:   { label: 'Documentos',  dot: 'bg-teal-500' },
  apertura:    { label: 'Apertura',    dot: 'bg-blue-500' },
  suitability: { label: 'Suitability', dot: 'bg-purple-500' },
  actividad:   { label: 'Actividad',   dot: 'bg-gray-300' },
}

const PAGE = 20

export default function ClientTimeline({ items }: { items: TimelineItem[] }) {
  const [kind, setKind] = useState<TimelineKind | 'todo'>('todo')
  const [shown, setShown] = useState(PAGE)

  const counts = useMemo(() => {
    const c: Partial<Record<TimelineKind, number>> = {}
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1
    return c
  }, [items])

  const filtered = kind === 'todo' ? items : items.filter((i) => i.kind === kind)
  const visible = filtered.slice(0, shown)

  // Agrupado por mes para que se lea como una historia.
  const groups: { month: string; items: TimelineItem[] }[] = []
  for (const i of visible) {
    const month = new Date(i.date).toLocaleDateString('es-UY', { month: 'long', year: 'numeric', timeZone: 'America/Montevideo' })
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(i)
    else groups.push({ month, items: [i] })
  }

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs border transition-colors whitespace-nowrap ${
      active ? 'bg-[#2D3F52] text-white border-[#2D3F52]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Historial del cliente</h2>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button type="button" className={chip(kind === 'todo')} onClick={() => { setKind('todo'); setShown(PAGE) }}>
            Todo · {items.length}
          </button>
          {(Object.keys(KIND_CFG) as TimelineKind[]).filter((k) => counts[k]).map((k) => (
            <button key={k} type="button" className={chip(kind === k)} onClick={() => { setKind(k); setShown(PAGE) }}>
              {KIND_CFG[k].label} · {counts[k]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">Sin movimientos registrados.</p>
      ) : (
        <div className="px-5 py-3">
          {groups.map((g) => (
            <div key={g.month} className="mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest py-2 first-letter:uppercase">{g.month}</p>
              <ol className="relative border-l border-gray-100 ml-1.5">
                {g.items.map((i) => (
                  <li key={i.id} className="pl-4 pb-3 relative">
                    <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${KIND_CFG[i.kind].dot}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 break-words">
                          {i.href ? (
                            <a
                              href={i.href}
                              className="hover:underline"
                              {...(i.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            >
                              {i.title}
                            </a>
                          ) : i.title}
                        </p>
                        {i.detail && <p className="text-xs text-gray-500 mt-0.5 break-words line-clamp-2">{i.detail}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(i.date)}</p>
                        {i.status && <p className="text-[11px] text-gray-600 mt-0.5 whitespace-nowrap">{i.status}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {filtered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="w-full mt-1 py-2 text-xs text-blue-600 hover:underline"
            >
              Ver más ({filtered.length - shown} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', timeZone: 'America/Montevideo' })
}

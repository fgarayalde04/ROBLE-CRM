'use client'

import { useCallback, useEffect, useState } from 'react'
import { extractReplyText, stripReplyPrefixes } from '@/lib/mailWatch/replyMatching'

interface Respuesta {
  id: string
  gmail_thread_id: string
  from_email: string
  received_at: string
  subject: string | null
  snippet: string | null
  match_method: 'thread_id' | 'subject_fallback' | 'unmatched'
  reviewed_at: string | null
  reviewed_by: string | null
  solicitud_uuid: string | null
  solicitud_id: string | null
  client_name: string | null
  asesor: string | null
  estado: string | null
}

const TRADING_EMAIL = 'trading@roblecapital.net'
const REFRESH_MS = 30_000

function fmtFecha(iso: string) {
  const d = new Date(iso)
  const hoy = new Date()
  const hora = d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`
  return `${d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })} ${hora}`
}

// Bandeja de respuestas de clientes a los mails de orden enviados desde
// trading@. Mesa ve todas (incluidas las que no se pudieron asociar a una
// orden); un asesor solo las de sus órdenes. Se refresca sola cada 30 s.
export default function RespuestasClientes({ isMesa }: { isMesa: boolean }) {
  const [rows, setRows] = useState<Respuesta[]>([])
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/email-replies${soloPendientes ? '?pendientes=1' : ''}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar')
      setRows(data.rows)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [soloPendientes])

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  async function toggleRevisada(r: Respuesta) {
    setBusyId(r.id)
    const res = await fetch(`/api/email-replies/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: !r.reviewed_at }),
    })
    if (!res.ok) alert((await res.json()).error ?? 'Error')
    await load()
    setBusyId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[{ v: true, l: 'Pendientes' }, { v: false, l: 'Todas' }].map(o => (
            <button key={o.l} onClick={() => setSoloPendientes(o.v)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${soloPendientes === o.v ? 'bg-white text-[#2D3F52] shadow-sm' : 'text-gray-500'}`}>
              {o.l}
            </button>
          ))}
        </div>
        <button onClick={() => load()} className="text-xs text-gray-400 hover:text-[#2D3F52]">Actualizar</button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading && rows.length === 0 && <p className="text-xs text-gray-400">Cargando…</p>}
      {!loading && rows.length === 0 && !error && (
        <p className="text-xs text-gray-400 py-4 text-center">
          {soloPendientes ? 'No hay respuestas pendientes de revisar.' : 'Todavía no hay respuestas.'}
        </p>
      )}

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {rows.map(r => {
          const texto = extractReplyText(r.snippet ?? '')
          const asunto = stripReplyPrefixes(r.subject ?? '')
          const sinOrden = r.match_method === 'unmatched'
          return (
            <li key={r.id} className={`px-3 py-3 ${r.reviewed_at ? 'bg-gray-50/60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{r.client_name ?? r.from_email}</span>
                    {sinOrden && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Sin orden asociada</span>
                    )}
                    {r.match_method === 'subject_fallback' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Asociada por asunto</span>
                    )}
                    <span className="text-[11px] text-gray-400">{fmtFecha(r.received_at)}</span>
                  </div>
                  <p className={`mt-1 text-sm whitespace-pre-wrap break-words ${texto ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                    {texto ? `“${texto}”` : 'Sin texto (solo cita o adjunto) — ver el mail'}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400 truncate">
                    {asunto}
                    {r.asesor && <> · Asesor: {r.asesor}</>}
                    {r.client_name && <> · {r.from_email}</>}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                    {r.solicitud_uuid && (
                      <a href={`/solicitudes?open=${r.solicitud_uuid}`} className="text-blue-600 hover:underline">
                        Ver orden {r.solicitud_id ?? ''}
                      </a>
                    )}
                    {isMesa && (
                      <a href={`https://mail.google.com/mail/?authuser=${TRADING_EMAIL}#all/${r.gmail_thread_id}`}
                        target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        Abrir en Gmail
                      </a>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <button onClick={() => toggleRevisada(r)} disabled={busyId === r.id}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border disabled:opacity-50 ${r.reviewed_at
                      ? 'border-gray-200 text-gray-500 hover:bg-white'
                      : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                    {r.reviewed_at ? 'Volver a pendiente' : 'Marcar revisada'}
                  </button>
                  {r.reviewed_at && (
                    <p className="mt-1 text-[10px] text-gray-400">Revisada por {r.reviewed_by ?? '—'}</p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncType = 'clientes' | 'bcu_local' | 'bcu_internacional'

interface SyncStatus {
  id: string
  sync_type: string
  status: 'success' | 'error' | 'partial' | 'running'
  message: string | null
  records_found: number
  records_created: number
  records_updated: number
  error_detail: string | null
  started_at: string
  finished_at: string | null
}

interface SyncConfig {
  configured: boolean
  missingVars: string[]
  intervalMinutes?: number
}

// ─── Card config ──────────────────────────────────────────────────────────────

const SYNC_CARDS: {
  type: SyncType
  label: string
  subtitle: string
}[] = [
  { type: 'clientes', label: 'Clientes', subtitle: 'Carpetas por asesor en SharePoint' },
  { type: 'bcu_local', label: 'BCU Local', subtitle: 'Legajos Cundry' },
  { type: 'bcu_internacional', label: 'BCU Internacional', subtitle: 'Legajos Geliene' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}

function duration(started: string, finished: string | null): string {
  if (!finished) return '–'
  const ms = new Date(finished).getTime() - new Date(started).getTime()
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function statusBadge(status: string, running: boolean) {
  if (running)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-500">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Ejecutando
      </span>
    )
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: 'Correcto', cls: 'bg-green-50 text-green-600' },
    error: { label: 'Error', cls: 'bg-red-50 text-red-500' },
    partial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-600' },
    running: { label: 'Ejecutando', cls: 'bg-blue-50 text-blue-500' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-50 text-gray-500' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SyncPanel() {
  const [statusMap, setStatusMap] = useState<Record<string, SyncStatus>>({})
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status')
      if (!res.ok) return
      const data: SyncStatus[] = await res.json()
      const map: Record<string, SyncStatus> = {}
      for (const row of data) map[row.sync_type] = row
      setStatusMap(map)
    } catch {}
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/config')
      if (!res.ok) return
      setConfig(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchConfig()
  }, [fetchStatus, fetchConfig])

  // Auto-refresh every 3s while any sync_type shows "running" in the DB
  const anyRunning = Object.values(statusMap).some(s => s.status === 'running')

  useEffect(() => {
    if (anyRunning) {
      pollRef.current = setInterval(() => {
        fetchStatus()
      }, 3000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [anyRunning, fetchStatus])

  async function runSync(type: SyncType | 'all') {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    await fetchStatus()
  }

  return (
    <div className="space-y-6">
      {/* Config status */}
      {config !== null && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
            config.configured
              ? 'bg-green-50 border-green-100 text-green-700'
              : 'bg-amber-50 border-amber-100 text-amber-700'
          }`}
        >
          <span className="font-medium">
            {config.configured ? 'Microsoft configurado correctamente' : 'Configuracion incompleta'}
          </span>
          {!config.configured && config.missingVars.length > 0 && (
            <span className="text-xs opacity-75">
              Faltan: {config.missingVars.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Auto-sync info banner */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-blue-50 border-blue-100">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          <span>
            <strong>Sincronización automática activa</strong>
            {' '}— se ejecuta cada{' '}
            {config?.intervalMinutes === 1
              ? '1 minuto'
              : config?.intervalMinutes && config.intervalMinutes < 60
              ? `${config.intervalMinutes} minutos`
              : config?.intervalMinutes
              ? `${config.intervalMinutes / 60} hora${config.intervalMinutes > 60 ? 's' : ''}`
              : 'intervalo configurado'}{' '}
            mientras el servidor esté corriendo
          </span>
        </div>
        <button
          onClick={() => runSync('all')}
          disabled={anyRunning}
          className="ml-4 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
          style={{ backgroundColor: anyRunning ? '#6b7280' : '#4A7C35' }}
          onMouseEnter={e => {
            if (!anyRunning)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3D6A2C'
          }}
          onMouseLeave={e => {
            if (!anyRunning)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A7C35'
          }}
        >
          {anyRunning ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {/* Cards 2x2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SYNC_CARDS.map(({ type, label, subtitle }) => {
          const st = statusMap[type]
          const isRunning = st?.status === 'running'

          return (
            <div
              key={type}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <SyncTypeIcon type={type} />
                    <span className="font-semibold text-sm" style={{ color: '#2D3F52' }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                </div>
                {st && statusBadge(st.status, isRunning)}
              </div>

              {st ? (
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>
                    Encontrados:{' '}
                    <strong className="text-gray-700">{st.records_found}</strong>
                  </span>
                  <span>
                    Creados:{' '}
                    <strong className="text-green-600">{st.records_created}</strong>
                  </span>
                  <span>
                    Actualizados:{' '}
                    <strong style={{ color: '#4A7C35' }}>{st.records_updated}</strong>
                  </span>
                </div>
              ) : null}

              {st && (
                <p className="text-xs text-gray-400">
                  Ultima sincronizacion: {timeAgo(st.started_at)}
                </p>
              )}
              {!st && !isRunning && (
                <p className="text-xs text-gray-400">Nunca sincronizado</p>
              )}

              {st?.error_detail && (
                <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1 leading-relaxed">
                  {st.error_detail.split('\n')[0]}
                </p>
              )}

              <div className="mt-auto pt-1">
                <button
                  onClick={() => runSync(type)}
                  disabled={anyRunning}
                  className="w-full py-1.5 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: anyRunning ? '#6b7280' : '#4A7C35',
                  }}
                  onMouseEnter={e => {
                    if (!anyRunning)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3D6A2C'
                  }}
                  onMouseLeave={e => {
                    if (!anyRunning)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A7C35'
                  }}
                >
                  {isRunning ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SyncTypeIcon({ type }: { type: SyncType }) {
  const cls = 'w-4 h-4 shrink-0'
  const color = '#4A7C35'

  if (type === 'clientes')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  if (type === 'bcu_local' || type === 'bcu_internacional')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

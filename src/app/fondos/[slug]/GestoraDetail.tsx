'use client'
import { useState, useMemo } from 'react'
import type { FondoWithFactsheet, Manager } from './page'

type Unclassified = {
  id: string
  file_name: string
  pdf_url: string | null
  fecha_factsheet: string | null
  created_at: string
}

interface Props {
  manager: Manager
  fondos: FondoWithFactsheet[]
  unclassified: Unclassified[]
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function GestoraDetail({ manager, fondos, unclassified }: Props) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'fondos' | 'sin-clasificar'>('fondos')

  const filtered = useMemo(() => {
    const lq = q.toLowerCase().trim()
    if (!lq) return fondos
    return fondos.filter(f =>
      f.name.toLowerCase().includes(lq) ||
      (f.isin ?? '').toLowerCase().includes(lq) ||
      (f.ticker ?? '').toLowerCase().includes(lq) ||
      (f.clase ?? '').toLowerCase().includes(lq) ||
      (f.moneda ?? '').toLowerCase().includes(lq)
    )
  }, [q, fondos])

  const filteredUnclassified = useMemo(() => {
    const lq = q.toLowerCase().trim()
    if (!lq) return unclassified
    return unclassified.filter(u => u.file_name.toLowerCase().includes(lq))
  }, [q, unclassified])

  return (
    <div className="space-y-4">
      {/* Search + tabs */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Buscar en ${manager.name}…`}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-[#2D3F52] transition-all placeholder:text-gray-400"
          />
        </div>
        {unclassified.length > 0 && (
          <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
            {(['fondos', 'sin-clasificar'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium transition-all ${
                  tab === t ? 'bg-[#2D3F52] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t === 'fondos' ? `Fondos (${fondos.length})` : `Sin clasificar (${unclassified.length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'fondos' ? (
        <FondosTable rows={filtered} noSearch={q === ''} total={fondos.length} />
      ) : (
        <UnclassifiedTable rows={filteredUnclassified} />
      )}
    </div>
  )
}

function FondosTable({ rows, noSearch, total }: { rows: FondoWithFactsheet[]; noSearch: boolean; total: number }) {
  if (total === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-gray-400">Todavía no hay fondos importados para esta gestora.</p>
        <p className="text-xs text-gray-300 mt-1">Usá <strong>"Sincronizar Gmail"</strong> desde la biblioteca principal para importar factsheets.</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-sm text-gray-400">
        No se encontraron fondos con esa búsqueda.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Fondo</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Clase</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">ISIN</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Moneda</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Factsheet</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Actualización</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(f => (
            <tr key={f.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3.5">
                <p className="font-medium text-gray-800 leading-tight">{f.name}</p>
                {f.ticker && <p className="text-xs text-gray-400 mt-0.5">{f.ticker}</p>}
              </td>
              <td className="px-4 py-3.5 text-gray-500">{f.clase ?? '—'}</td>
              <td className="px-4 py-3.5">
                {f.isin ? (
                  <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{f.isin}</span>
                ) : '—'}
              </td>
              <td className="px-4 py-3.5 text-gray-500">{f.moneda ?? '—'}</td>
              <td className="px-4 py-3.5">
                {f.latest_factsheet ? (
                  <span className="text-xs text-gray-500">{f.latest_factsheet.file_name}</span>
                ) : (
                  <span className="text-xs text-gray-300">Sin factsheet</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                {f.latest_factsheet ? fmtDate(f.latest_factsheet.created_at) : '—'}
              </td>
              <td className="px-4 py-3.5">
                {f.latest_factsheet?.pdf_url ? (
                  <a
                    href={f.latest_factsheet.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2D3F52] text-white rounded-lg text-xs font-medium hover:bg-opacity-90 transition-all whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                  </a>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnclassifiedTable({ rows }: { rows: Unclassified[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-sm text-gray-400">
        No hay factsheets sin clasificar.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-amber-50/60 border-b border-amber-100">
        <p className="text-xs text-amber-700 font-medium">
          Estos factsheets se importaron pero no se pudieron asociar a un fondo específico. Podés clasificarlos manualmente.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Archivo</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Importado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(u => (
            <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3.5 text-gray-700 font-medium">{u.file_name}</td>
              <td className="px-4 py-3.5 text-gray-500 text-xs">{u.fecha_factsheet ? fmtDate(u.fecha_factsheet) : '—'}</td>
              <td className="px-4 py-3.5 text-gray-400 text-xs">{fmtDate(u.created_at)}</td>
              <td className="px-4 py-3.5">
                {u.pdf_url && (
                  <a href={u.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2D3F52] text-white rounded-lg text-xs font-medium hover:bg-opacity-90 transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

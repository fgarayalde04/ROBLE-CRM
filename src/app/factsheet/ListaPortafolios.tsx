'use client'

// Portafolio: una sola lista con todos los portafolios armados (Pershing,
// Morgan Stanley o varias cuentas juntas). Los importados con el formato
// anterior siguen apareciendo, marcados, hasta que se vuelvan a armar.
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConsolidadoRow } from '@/lib/db/consolidados'

interface CuentaAnterior {
  account_number: string
  imported_by: string | null
  client_name: string | null
  advisor: string | null
  snapshot_date: string
  total_market_value: string
  position_count: number
}

interface Fila {
  id: string
  cliente: string
  custodios: string
  fecha: string
  total: number
  cuponCorrido: number | null
  autor: string
  actualizado: string | null
  href: string
  anterior: boolean
  /** Portafolio armado por otro usuario que se lo compartió a este. */
  compartidoPor: string | null
  /** Solo los propios se pueden compartir y borrar. */
  propio: boolean
  guardado: ConsolidadoRow | null
  borrar: () => Promise<boolean>
}

interface Usuario { id: string; name: string }

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
// Los guardados antes de este cambio tenían los números de cuenta en "cuentas".
const sinNumeros = (s: string | null) => (s ?? '').replace(/\s+[A-Z]*\d[A-Z0-9-]*/g, '').trim()

export default function ListaPortafolios({ guardados, usuario }: { guardados: ConsolidadoRow[]; usuario: string }) {
  const router = useRouter()
  const [anteriores, setAnteriores] = useState<CuentaAnterior[]>([])
  const [compartiendo, setCompartiendo] = useState<ConsolidadoRow | null>(null)
  const [q, setQ] = useState('')
  const [borrando, setBorrando] = useState<string | null>(null)

  useEffect(() => {
    // Formato anterior: solo las cuentas que importó este usuario.
    fetch('/api/portfolio/accounts').then((r) => (r.ok ? r.json() : []))
      .then((xs: CuentaAnterior[]) => setAnteriores(xs.filter((a) => a.imported_by === usuario))).catch(() => {})
  }, [])

  const filas: Fila[] = useMemo(() => [
    ...guardados.map((h) => ({
      id: h.id,
      cliente: h.client_name,
      custodios: sinNumeros(h.cuentas) || '—',
      fecha: h.valuation_date,
      total: Number(h.total_value),
      cuponCorrido: Number(h.accrued_interest),
      autor: h.created_by ?? '—',
      actualizado: h.updated_at,
      href: `/factsheet/consolidado?id=${h.id}`,
      anterior: false,
      compartidoPor: h.created_by !== usuario ? h.created_by : null,
      propio: h.created_by === usuario,
      guardado: h,
      borrar: async () => (await fetch(`/api/consolidado/guardados/${h.id}`, { method: 'DELETE' })).ok,
    })),
    ...anteriores.map((a) => ({
      id: `cuenta:${a.account_number}`,
      cliente: a.client_name || a.account_number,
      custodios: 'Pershing',
      fecha: a.snapshot_date,
      total: Number(a.total_market_value),
      cuponCorrido: null,
      autor: a.advisor ?? '—',
      actualizado: null,
      href: `/factsheet/${encodeURIComponent(a.account_number)}`,
      anterior: true,
      compartidoPor: null,
      propio: true,
      guardado: null,
      borrar: async () => (await fetch(`/api/portfolio/${encodeURIComponent(a.account_number)}`, { method: 'DELETE' })).ok,
    })),
  ], [guardados, anteriores, usuario])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? filas.filter((f) => f.cliente.toLowerCase().includes(t) || f.autor.toLowerCase().includes(t)) : filas
  }, [filas, q])

  async function borrar(f: Fila) {
    if (!confirm(`¿Borrar el portafolio de ${f.cliente} al ${ddmmyyyy(f.fecha)}?`)) return
    setBorrando(f.id)
    try {
      if (!(await f.borrar())) { alert('No se pudo borrar'); return }
      if (f.anterior) setAnteriores((prev) => prev.filter((a) => `cuenta:${a.account_number}` !== f.id))
      router.refresh()
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por cliente o asesor…"
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-[#2E7D52]/40 focus:outline-none focus:ring-2 focus:ring-[#2E7D52]/20"
      />
      {visibles.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-gray-600">{filas.length ? 'Sin resultados' : 'Todavía no hay portafolios armados'}</p>
          {!filas.length && <p className="mt-1 text-xs text-gray-400">Tocá “Nuevo reporte” y subí los reportes del cliente.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#1B2A38] text-left text-[11px] uppercase tracking-wide text-white/80">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Custodios</th>
                  <th className="px-3 py-2.5 font-medium">Valuación</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor total</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cupón corrido</th>
                  <th className="px-3 py-2.5 font-medium">Armado por</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibles.map((f) => (
                  <tr key={f.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => router.push(f.href)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{f.cliente}</p>
                      {f.anterior && <p className="text-[11px] text-amber-700">Formato anterior · volvé a armarlo con “Nuevo reporte”</p>}
                      {f.compartidoPor && <p className="text-[11px] text-sky-700">Compartido por {f.compartidoPor}</p>}
                      {f.guardado && f.propio && f.guardado.shared_with_ids?.length > 0 && (
                        <p className="text-[11px] text-gray-400">Compartido con {f.guardado.shared_with_ids.length} {f.guardado.shared_with_ids.length === 1 ? 'persona' : 'personas'}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{f.custodios}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700">{ddmmyyyy(f.fecha)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{fmt(f.total)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-700">{f.cuponCorrido ? fmt(f.cuponCorrido) : <span className="text-gray-300">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                      {f.autor}{f.actualizado ? ` · ${new Date(f.actualizado).toLocaleDateString('es-UY')}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link href={f.href} className="text-xs font-medium text-[#2D3F52] hover:underline">Abrir</Link>
                      {f.guardado && f.propio && (
                        <button onClick={() => setCompartiendo(f.guardado)} className="ml-3 text-xs font-medium text-[#2E7D52] hover:underline">Compartir</button>
                      )}
                      {f.propio && (
                        <button onClick={() => borrar(f)} disabled={borrando === f.id} className="ml-3 text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">
                          {borrando === f.id ? 'Borrando…' : 'Borrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {compartiendo && (
        <ModalCompartir
          portafolio={compartiendo}
          usuario={usuario}
          onClose={() => setCompartiendo(null)}
          onGuardado={() => { setCompartiendo(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function ModalCompartir({ portafolio, usuario, onClose, onGuardado }: {
  portafolio: ConsolidadoRow
  usuario: string
  onClose: () => void
  onGuardado: () => void
}) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(portafolio.shared_with_ids ?? []))
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/users/directory').then((r) => (r.ok ? r.json() : []))
      .then((xs: Usuario[]) => setUsuarios(xs.filter((u) => u.name !== usuario).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setUsuarios([]))
  }, [usuario])

  async function guardar() {
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/consolidado/guardados/${portafolio.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compartidoCon: Array.from(elegidos) }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar'); return }
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  const visibles = (usuarios ?? []).filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-bold text-gray-900">Compartir portafolio</h3>
          <p className="mt-0.5 text-xs text-gray-500">{portafolio.client_name} · los elegidos lo van a ver en su lista y pueden abrirlo, editarlo y descargarlo.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuario…"
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#2E7D52]/40 focus:outline-none" />
          {usuarios == null ? <p className="py-6 text-center text-xs text-gray-400">Cargando…</p> : (
            <ul className="divide-y divide-gray-50">
              {visibles.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-gray-800">
                    <input type="checkbox" checked={elegidos.has(u.id)}
                      onChange={(e) => setElegidos((prev) => { const n = new Set(prev); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n })} />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="px-5 text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 rounded-lg bg-[#2E7D52] py-2 text-sm font-bold text-white hover:bg-[#256841] disabled:opacity-50">
            {guardando ? 'Guardando…' : `Compartir${elegidos.size ? ` con ${elegidos.size}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

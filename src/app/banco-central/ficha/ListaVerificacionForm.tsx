'use client'
import type { ListaData, ListaItem, ItemStatus, TipoCliente } from './types'
import { LISTA_PF_ITEMS, LISTA_PJ_ITEMS } from './types'

interface Props {
  data: ListaData
  tipo: TipoCliente
  onChange: (d: ListaData) => void
}

const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string; bg: string }> = {
  completo:  { label: 'Completo',   color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  pendiente: { label: 'Pendiente',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-100' },
  no_aplica: { label: 'No aplica',  color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
}

function defaultItem(): ListaItem {
  return { status: 'pendiente', comentario: '', responsable: '', fecha: '' }
}

export default function ListaVerificacionForm({ data, tipo, onChange }: Props) {
  const items = tipo === 'pf' ? LISTA_PF_ITEMS : LISTA_PJ_ITEMS
  const set = (patch: Partial<ListaData>) => onChange({ ...data, ...patch })

  const setItem = (id: string, patch: Partial<ListaItem>) => {
    const current = data.items[id] ?? defaultItem()
    set({ items: { ...data.items, [id]: { ...current, ...patch } } })
  }

  const getItem = (id: string): ListaItem => data.items[id] ?? defaultItem()

  const completos = items.filter(i => getItem(i.id).status === 'completo').length
  const pendientes = items.filter(i => getItem(i.id).status === 'pendiente').length

  return (
    <div className="space-y-5">
      {/* Header data */}
      <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Datos generales</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
            <input type="date" value={data.fecha} onChange={e => set({ fecha: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del cliente</label>
            <input value={data.nombre_cliente} onChange={e => set({ nombre_cliente: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Código del cliente</label>
            <input value={data.codigo_cliente} onChange={e => set({ codigo_cliente: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Evaluación de Riesgo</label>
            <select value={data.riesgo} onChange={e => set({ riesgo: e.target.value as any })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]">
              <option value="">— Seleccionar —</option>
              <option>ALTO</option>
              <option>MEDIO</option>
              <option>BAJO</option>
            </select>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-3">
        <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{completos}</p>
          <p className="text-xs text-green-600">Completos</p>
        </div>
        <div className="flex-1 bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{pendientes}</p>
          <p className="text-xs text-amber-600">Pendientes</p>
        </div>
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-500">{items.length - completos - pendientes}</p>
          <p className="text-xs text-gray-400">No aplican</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item) => {
          const current = getItem(item.id)
          const { color, bg } = STATUS_CONFIG[current.status]
          return (
            <div key={item.id} className={`border rounded-xl overflow-hidden transition-all`}>
              <div className={`${bg} p-3`}>
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-gray-400 shrink-0 mt-0.5 w-5">{item.id}.</span>
                  <p className="text-sm text-gray-700 flex-1 leading-snug">{item.label}</p>
                  <div className="shrink-0 flex gap-1">
                    {(Object.keys(STATUS_CONFIG) as ItemStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setItem(item.id, { status: s })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          current.status === s
                            ? `${STATUS_CONFIG[s].color} ${STATUS_CONFIG[s].bg} border ${STATUS_CONFIG[s].bg.replace('bg-', 'border-')}`
                            : 'text-gray-400 bg-white border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
                {item.sub && (
                  <div className="ml-8 mt-2 space-y-1">
                    {item.sub.map(s => (
                      <div key={s} className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Expand row for comments */}
              <div className="bg-white px-3 pb-2 pt-1 flex gap-2">
                <input value={current.comentario} onChange={e => setItem(item.id, { comentario: e.target.value })}
                  placeholder="Comentario..."
                  className="flex-1 text-xs border border-gray-100 rounded px-2 py-1 outline-none focus:border-gray-300 bg-gray-50" />
                <input value={current.responsable} onChange={e => setItem(item.id, { responsable: e.target.value })}
                  placeholder="Responsable"
                  className="w-28 text-xs border border-gray-100 rounded px-2 py-1 outline-none focus:border-gray-300 bg-gray-50" />
                <input type="date" value={current.fecha} onChange={e => setItem(item.id, { fecha: e.target.value })}
                  className="w-32 text-xs border border-gray-100 rounded px-2 py-1 outline-none focus:border-gray-300 bg-gray-50" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Aprobaciones */}
      <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Aprobaciones</p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Aprobada por:</label>
          <input value={data.aprobado_por} onChange={e => set({ aprobado_por: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]"
            placeholder="Nombre y firma" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Constancia Oficial de Cumplimiento:</label>
          <input value={data.oficial_cumplimiento} onChange={e => set({ oficial_cumplimiento: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]"
            placeholder="Nombre y firma" />
        </div>
        {data.riesgo === 'ALTO' && (
          <div>
            <label className="block text-xs font-medium text-amber-600 mb-1">Visto Bueno Oficial de Cumplimiento (Riesgo Alto):</label>
            <input value={data.visto_bueno} onChange={e => set({ visto_bueno: e.target.value })}
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-amber-50 outline-none focus:border-amber-400"
              placeholder="Nombre y firma" />
          </div>
        )}
      </div>
    </div>
  )
}

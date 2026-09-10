'use client'

// Tarjeta con TODOS los datos de un activo dentro de una solicitud/orden.
// Vivía duplicada casi idéntica en MesaHoy y BlotterSolicitudes, y no
// contemplaba las órdenes Stop (solo Mercado/Límite) — una venta Stop
// aparecía sin ningún dato de precio ni de tipo de orden, lo que llevó a
// confusión. Ahora el tipo de orden se muestra siempre y explícito.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAsset = any

const TIPO_ORDEN_LABEL: Record<string, string> = {
  mercado: 'A mercado',
  limite: 'Límite',
  stop: 'Stop',
}
const VIGENCIA_LABEL: Record<string, string> = {
  DIA: 'Día (DAY)',
  DAY: 'Día (DAY)',
  GTC: 'Hasta cancelar (GTC)',
}

function esTotal(cantidad: unknown): boolean {
  return typeof cantidad === 'string' && cantidad.trim().toUpperCase() === 'TOTAL'
}

export default function AssetDetailCard({ asset }: { asset: AnyAsset }) {
  const tipo = asset?.type as string | undefined
  const nombre =
    tipo === 'acciones' ? (asset.nombre || asset.ticker || '—')
    : tipo === 'fondos'  ? (asset.fondo || '—')
    : tipo === 'bonos'   ? (asset.descripcion || '—')
    : (asset?.nombre || asset?.descripcion || '—')

  const isin = asset?.cusipIsin || asset?.cusip_isin || null

  const cantidadMonto =
    tipo === 'fondos'
      ? (asset?.monto ? `${asset.moneda ?? ''} ${Number(asset.monto).toLocaleString('es-UY')}`.trim() : null)
      : esTotal(asset?.cantidad) ? 'TODA LA POSICIÓN'
      : (asset?.cantidad != null && asset.cantidad !== '' ? String(asset.cantidad) : null)

  const tipoOrden = asset?.precio ? (TIPO_ORDEN_LABEL[asset.precio as string] ?? String(asset.precio)) : null
  const precioValor = asset?.precioLimite ?? asset?.precio_limite ?? null
  const precioRow: [string, string] | null =
    asset?.precio === 'stop'   ? ['Precio stop',   `${precioValor ?? '—'}${asset?.moneda ? ` ${asset.moneda}` : ''}`]
    : asset?.precio === 'limite' ? ['Precio límite', `${precioValor ?? '—'}${asset?.moneda ? ` ${asset.moneda}` : ''}`]
    : (asset?.precio == null && precioValor) ? ['Precio', String(precioValor)]
    : null

  const rows = ([
    ['Operación', asset?.operacion === 'venta' ? 'Venta' : 'Compra'],
    tipoOrden ? ['Tipo de orden', tipoOrden] : null,
    precioRow,
    tipo === 'acciones' && asset?.ticker ? ['Ticker', asset.ticker] : null,
    isin ? ['ISIN/CUSIP', isin] : null,
    cantidadMonto ? [tipo === 'fondos' ? 'Monto' : 'Cantidad', cantidadMonto] : null,
    asset?.moneda ? ['Moneda', asset.moneda] : null,
    tipo === 'fondos' && asset?.clase ? ['Clase', asset.clase] : null,
    tipo === 'bonos' && asset?.maturity ? ['Vencimiento', asset.maturity] : null,
    tipo === 'bonos' && asset?.cupon ? ['Cupón', asset.cupon + '%'] : null,
    asset?.fecha ? ['Fecha de la orden', asset.fecha] : null,
    asset?.vigencia ? ['Vigencia', VIGENCIA_LABEL[asset.vigencia as string] ?? asset.vigencia] : null,
    asset?.comision ? ['Comisión', asset.comision] : null,
  ] as ([string, string] | null)[]).filter(Boolean) as [string, string][]

  return (
    <div className={`rounded-lg border px-3 py-2 space-y-1 ${asset?.cancelada ? 'border-red-200 bg-red-50/40 opacity-70' : 'border-gray-200 bg-gray-50/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-700 truncate">{nombre}</p>
        <div className="flex items-center gap-1 shrink-0">
          {asset?.precio === 'stop' && <span className="text-[9px] font-bold text-white bg-purple-500 rounded px-1 py-px">STOP</span>}
          {asset?.precio === 'limite' && <span className="text-[9px] font-bold text-white bg-blue-500 rounded px-1 py-px">LÍMITE</span>}
          {asset?.cancelada && <span className="text-[9px] font-bold text-red-500">CANCELADO</span>}
        </div>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <span className="text-[10px] text-gray-400 shrink-0">{label}</span>
          <span className="text-[10px] text-gray-800 text-right break-words max-w-[170px]">{value}</span>
        </div>
      ))}
      {tipo === 'fondos' && asset?.montoAclaracion && (
        <div className="pt-1 border-t border-gray-200 mt-1">
          <p className="text-[10px] text-gray-400">Aclaración del monto</p>
          <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{asset.montoAclaracion}</p>
        </div>
      )}
      {asset?.observaciones && (
        <div className="pt-1 border-t border-gray-200 mt-1">
          <p className="text-[10px] text-gray-400">Notas internas</p>
          <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{asset.observaciones}</p>
        </div>
      )}
    </div>
  )
}

'use client'
import { fmtUSD2, fmtDate } from './PortfolioAccountClient'
import DocumentUploadButton from '@/components/portfolio/DocumentUploadButton'
import type { PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow } from '@/types/portfolio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActivityRow = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActivityImport = any

export default function MovimientosTab({
  accountNumber, cashProjImport, cashProjRows, onCashProjImported,
  activityImport, activityRows, onActivityImported,
}: {
  accountNumber: string
  cashProjImport: PortfolioCashProjectionsImportRow | null
  cashProjRows: PortfolioCashProjectionRow[]
  onCashProjImported: () => void
  activityImport: ActivityImport | null
  activityRows: ActivityRow[]
  onActivityImported: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">Próximos flujos de caja proyectados</p>
          <DocumentUploadButton accountNumber={accountNumber} endpoint="cashflows" accept=".xlsx,.xls"
            label={cashProjImport ? 'Actualizar cash projections' : 'Importar cash projections (Excel)'} onImported={onCashProjImported} />
        </div>

        {cashProjImport ? (
          <>
            <p className="text-[11px] text-gray-400 mb-4">
              Cupones e intereses proyectados por el custodio — al {fmtDate(cashProjImport.as_of_date)}.
              {cashProjImport.total_cash_flow != null && <> Total proyectado: <strong className="text-gray-600">{fmtUSD2(Number(cashProjImport.total_cash_flow))}</strong>.</>}
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Fecha de pago</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Instrumento</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Monto estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cashProjRows.map(r => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{fmtDate(r.pay_date)}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[320px] truncate">{r.description}</td>
                      <td className="px-3 py-2 text-gray-500">{r.distribution_type ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-semibold font-mono">
                        {r.estimated_amount != null ? fmtUSD2(Number(r.estimated_amount)) : '—'}
                      </td>
                    </tr>
                  ))}
                  {cashProjRows.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">Sin pagos proyectados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Los montos son estimados a partir del cupón informado por el custodio — pueden variar frente al pago real.
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-400">
            Todavía no hay cash projections importadas. Subí el Excel de "Incoming Cash Projections" del custodio para ver los próximos cupones e intereses esperados.
          </p>
        )}
      </div>

      {/* ── Activity / movimientos de la cuenta ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">Movimientos de la cuenta</p>
          <DocumentUploadButton accountNumber={accountNumber} endpoint="activity" accept=".xlsx,.xls,.csv"
            label={activityImport ? 'Actualizar activity' : 'Importar activity (Excel)'} onImported={onActivityImported} />
        </div>

        {activityImport && activityRows.length > 0 ? (
          <>
            <p className="text-[11px] text-gray-400 mb-4">
              {activityRows.length} movimiento{activityRows.length === 1 ? '' : 's'} del reporte de Activity del custodio
              {activityImport.as_of_date && <> — al {fmtDate(activityImport.as_of_date)}</>}.
            </p>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Detalle</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cantidad</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Precio</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activityRows.map((r: ActivityRow) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{r.trade_date ? fmtDate(r.trade_date) : r.settle_date ? fmtDate(r.settle_date) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.activity_type ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[360px] truncate">{r.description}{r.symbol ? ` · ${r.symbol}` : ''}</td>
                      <td className="px-3 py-2 text-right text-gray-700 font-mono">{r.quantity != null ? Number(r.quantity).toLocaleString('en-US') : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700 font-mono">{r.price != null ? fmtUSD2(Number(r.price)) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold font-mono ${r.amount != null ? (Number(r.amount) >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'}`}>
                        {r.amount != null ? `${Number(r.amount) >= 0 ? '+' : ''}${fmtUSD2(Number(r.amount))}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-1">
            Subí el Excel de "Activity" del custodio (Pershing o Morgan Stanley) para que el cliente pueda ver
            los depósitos, retiros, compras, ventas, cupones y dividendos de la cuenta.
          </p>
        )}
      </div>
    </div>
  )
}

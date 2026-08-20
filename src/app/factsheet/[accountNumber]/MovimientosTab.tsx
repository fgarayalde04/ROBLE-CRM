'use client'
import { fmtUSD2, fmtDate } from './PortfolioAccountClient'
import DocumentUploadButton from '@/components/portfolio/DocumentUploadButton'
import type { PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow } from '@/types/portfolio'

export default function MovimientosTab({ accountNumber, cashProjImport, cashProjRows, onCashProjImported }: {
  accountNumber: string
  cashProjImport: PortfolioCashProjectionsImportRow | null
  cashProjRows: PortfolioCashProjectionRow[]
  onCashProjImported: () => void
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

      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <div className="text-3xl mb-3">🧾</div>
        <p className="text-sm font-semibold text-gray-600">Todavía no hay movimientos cargados</p>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
          Esta sección va a mostrar depósitos, retiros, compras, ventas y otros movimientos de la cuenta —
          con fecha, tipo, instrumento y monto — a medida que se incorpore la fuente de datos de transacciones.
          Con eso también va a ser posible calcular una rentabilidad real (TWR) propia, a diferencia de la
          variación de Market Value que se muestra hoy en Resumen y Rendimiento.
        </p>
      </div>
    </div>
  )
}

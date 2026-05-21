'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerTable {
  id: string
  advisor_name: string
  company: string
  year: number
}

interface BrokerRow {
  id: string
  concept: string
  sort_order: number
  is_formula: boolean
  formula_type: string | null
  values: Record<string, { id?: string; value: number | null; raw_value: string | null }>
}

interface Props {
  table: BrokerTable
  rows: BrokerRow[]
  months: string[]
}

// ─── Formula computation ──────────────────────────────────────────────────────

function computeFormulas(
  rows: BrokerRow[],
  editedValues: Record<string, Record<string, string>>,
  months: string[]
): Record<string, Record<string, number>> {

  function getInputVal(rowId: string, month: string): number {
    const row = rows.find(r => r.id === rowId)
    if (!row) return 0
    const edited = editedValues[rowId]?.[month]
    if (edited !== undefined) {
      const n = parseFloat(edited.replace(',', '.'))
      return isNaN(n) ? 0 : n
    }
    return row.values[month]?.value ?? 0
  }

  const inputRows = rows.filter(r => !r.is_formula)
  const facturacionRow = rows.find(r => r.formula_type === 'facturacion')
  const pct40Row = rows.find(r => r.formula_type === 'porcentaje_40')
  const subtotalRow = rows.find(r => r.formula_type === 'subtotal')
  const totalRow = rows.find(r => r.formula_type === 'total')

  const result: Record<string, Record<string, number>> = {}
  result['facturacion'] = {}
  result['porcentaje_40'] = {}
  result['subtotal'] = {}
  result['total'] = {}

  for (const month of months) {
    const facOrder = facturacionRow?.sort_order ?? -1

    // facturacion = sum of input rows BEFORE facturacion formula row
    result['facturacion'][month] = inputRows
      .filter(r => r.sort_order < facOrder)
      .reduce((sum, r) => sum + getInputVal(r.id, month), 0)

    // porcentaje_40 (legacy FRAN JJ backward compat)
    if (pct40Row) {
      result['porcentaje_40'][month] = result['facturacion'][month] * 0.40
    }

    // subtotal = sum of pct formula rows (between fac and sub) + sum of input rows (between fac and sub)
    if (subtotalRow) {
      const subOrder = subtotalRow.sort_order
      const pctFormulaSum = rows
        .filter(r =>
          r.is_formula &&
          (r.formula_type === 'porcentaje_40' || r.formula_type?.startsWith('pct_')) &&
          r.sort_order > facOrder && r.sort_order < subOrder
        )
        .reduce((sum, r) => sum + (result[r.formula_type!]?.[month] ?? 0), 0)

      const inputBetweenSum = inputRows
        .filter(r => r.sort_order > facOrder && r.sort_order < subOrder)
        .reduce((sum, r) => sum + getInputVal(r.id, month), 0)

      result['subtotal'][month] = pctFormulaSum + inputBetweenSum
    }

    // total
    if (totalRow) {
      const totOrder = totalRow.sort_order
      if (subtotalRow) {
        const subOrder = subtotalRow.sort_order
        const postSubSum = inputRows
          .filter(r => r.sort_order > subOrder && r.sort_order < totOrder)
          .reduce((sum, r) => sum + getInputVal(r.id, month), 0)
        result['total'][month] = (result['subtotal'][month] ?? 0) + postSubSum
      } else {
        // no subtotal row — sum all input rows between facturacion and total
        result['total'][month] = inputRows
          .filter(r => r.sort_order > facOrder && r.sort_order < totOrder)
          .reduce((sum, r) => sum + getInputVal(r.id, month), 0)
      }
    }
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayMonth(m: string): string {
  const [mon, yr] = m.split('-')
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${yr}`
}

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0,00'
  return n.toFixed(2).replace('.', ',')
}

// ─── Component ────────────────────────────────────────────────────────────────

const WINDOW_SIZE = 6

export default function BrokerSettlementTable({ table, rows, months }: Props) {
  const router = useRouter()

  const [editedValues, setEditedValues] = useState<Record<string, Record<string, string>>>({})
  const [addingMonth, setAddingMonth] = useState(false)
  const [newMonthInput, setNewMonthInput] = useState('')
  const [savingMonth, setSavingMonth] = useState(false)
  const [windowStart, setWindowStart] = useState(() => Math.max(0, months.length - WINDOW_SIZE))
  const [showHidden, setShowHidden] = useState(false)

  // Hidden rows — persisted in localStorage per table
  const storageKey = `hidden_rows_${table.id}`
  const [hiddenRows, setHiddenRows] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set<string>()
    } catch { return new Set<string>() }
  })

  const toggleHideRow = useCallback((rowId: string) => {
    setHiddenRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }, [storageKey])

  const showAllRows = useCallback(() => {
    setHiddenRows(new Set())
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
  }, [storageKey])

  const visibleMonths = months.slice(windowStart, windowStart + WINDOW_SIZE)

  const computed = useMemo(
    () => computeFormulas(rows, editedValues, months),
    [rows, editedValues, months]
  )

  const handleCellChange = useCallback((rowId: string, month: string, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? {}), [month]: value },
    }))
  }, [])

  const handleCellBlur = useCallback(async (rowId: string, month: string) => {
    const raw = editedValues[rowId]?.[month]
    if (raw === undefined) return

    await fetch(`/api/liquidacion-brokers?action=upsert-value`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, month, raw_value: raw }),
    })

    setEditedValues(prev => {
      const next = { ...prev }
      if (next[rowId]) {
        const rowEdits = { ...next[rowId] }
        delete rowEdits[month]
        if (Object.keys(rowEdits).length === 0) {
          delete next[rowId]
        } else {
          next[rowId] = rowEdits
        }
      }
      return next
    })

    router.refresh()
  }, [editedValues, router])

  const handleDeleteRow = useCallback(async (rowId: string) => {
    if (!confirm('Eliminar esta fila?')) return
    await fetch(`/api/liquidacion-brokers?action=delete-row`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId }),
    })
    router.refresh()
  }, [router])

  const handleAddMonth = useCallback(async () => {
    if (!newMonthInput.trim()) return
    setSavingMonth(true)
    await fetch(`/api/liquidacion-brokers?action=add-month`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: table.id, month: newMonthInput.trim().toLowerCase() }),
    })
    setSavingMonth(false)
    setNewMonthInput('')
    setAddingMonth(false)
    router.refresh()
  }, [newMonthInput, table.id, router])

  const handleExportCSV = useCallback(() => {
    const header = ['Concepto', ...months.map(displayMonth)]
    const rowsData = rows.map(row => {
      const cells: (string | number)[] = [row.concept]
      for (const month of months) {
        if (row.is_formula && row.formula_type) {
          cells.push(computed[row.formula_type]?.[month] ?? 0)
        } else {
          const edited = editedValues[row.id]?.[month]
          if (edited !== undefined) {
            cells.push(edited)
          } else {
            cells.push(row.values[month]?.value ?? 0)
          }
        }
      }
      return cells
    })

    const lines = [header, ...rowsData].map(r =>
      r.map(c => String(c).replace(',', '.')).join(';')
    )
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `liquidacion_${table.advisor_name}_${table.company}_${table.year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, months, computed, editedValues, table])

  // Row style helpers
  function rowClassName(row: BrokerRow): string {
    if (row.formula_type === 'total') return 'border-[#2D3F52]/20 bg-[#2D3F52]/5 font-bold'
    if (row.formula_type === 'facturacion') return 'border-gray-200 bg-gray-50 font-semibold'
    if (row.formula_type === 'subtotal') return 'border-gray-200 bg-gray-50 font-semibold'
    if (row.formula_type === 'porcentaje_40') return 'bg-[#16A34A]/5 font-semibold'
    if (row.is_formula) return 'bg-gray-50 font-semibold'
    return 'bg-white'
  }

  function conceptClassName(row: BrokerRow): string {
    if (row.formula_type === 'total') return 'text-[#2D3F52] text-sm font-bold'
    return 'text-sm text-gray-700'
  }

  function cellDisplayValue(row: BrokerRow, month: string): number | null {
    if (row.is_formula && row.formula_type) {
      return computed[row.formula_type]?.[month] ?? null
    }
    const edited = editedValues[row.id]?.[month]
    if (edited !== undefined) {
      const n = parseFloat(edited.replace(',', '.'))
      return isNaN(n) ? null : n
    }
    return row.values[month]?.value ?? null
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {addingMonth ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="ej. may-26"
                value={newMonthInput}
                onChange={e => setNewMonthInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddMonth() }}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:border-[#16A34A]"
                autoFocus
              />
              <button
                onClick={handleAddMonth}
                disabled={savingMonth}
                className="text-xs px-3 py-1 rounded bg-[#2D3F52] text-white hover:bg-[#2D3F52]/80 disabled:opacity-50"
              >
                {savingMonth ? 'Guardando...' : 'Agregar'}
              </button>
              <button
                onClick={() => { setAddingMonth(false); setNewMonthInput('') }}
                className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingMonth(true)}
              className="text-xs px-3 py-1.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-[#16A34A] hover:text-[#16A34A] transition-colors"
            >
              + Agregar mes
            </button>
          )}

          {/* Hidden rows indicator */}
          {hiddenRows.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">
                {hiddenRows.size} {hiddenRows.size === 1 ? 'fila oculta' : 'filas ocultas'}
              </span>
              <button
                onClick={() => setShowHidden(v => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showHidden
                    ? 'border-[#2D3F52] bg-[#2D3F52] text-white'
                    : 'border-gray-300 text-gray-500 hover:border-[#2D3F52] hover:text-[#2D3F52]'
                }`}
              >
                {showHidden ? 'Ocultar' : 'Mostrar'}
              </button>
              <button
                onClick={showAllRows}
                className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
              >
                Desbloquear todas
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleExportCSV}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      {/* Table — overflow-x only, no vertical scroll */}
      <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#2D3F52] text-white">
                <th className="sticky left-0 z-10 bg-[#2D3F52] text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider min-w-[200px]">
                  Concepto
                </th>
                {visibleMonths.map(m => (
                  <th key={m} className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wider min-w-[120px] whitespace-nowrap">
                    {displayMonth(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isHidden = hiddenRows.has(row.id)

                // Hidden row — show compact stub when "showHidden" is on
                if (isHidden && !showHidden) return null
                if (isHidden && showHidden) {
                  return (
                    <tr key={row.id} className="border-t border-dashed border-gray-200 bg-gray-50/30">
                      <td colSpan={visibleMonths.length + 1} className="px-4 py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-300 italic line-through">{row.concept}</span>
                          <button
                            onClick={() => toggleHideRow(row.id)}
                            className="text-xs text-[#16A34A] hover:text-[#a08040] transition-colors"
                          >
                            mostrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={row.id} className={`group border-t ${rowClassName(row)}`}>
                    {/* Concept cell */}
                    <td className={`sticky left-0 z-10 px-4 py-1.5 min-w-[200px] ${rowClassName(row)}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={conceptClassName(row)}>{row.concept}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => toggleHideRow(row.id)}
                            className="text-gray-300 hover:text-gray-500 transition-colors leading-none p-0.5 text-xs"
                            title="Ocultar fila"
                          >
                            ◎
                          </button>
                          {!row.is_formula && (
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="text-red-300 hover:text-red-500 transition-colors leading-none p-0.5 text-xs"
                              title="Eliminar fila"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Value cells */}
                    {visibleMonths.map(month => {
                      const displayVal = cellDisplayValue(row, month)
                      const isNeg = (displayVal ?? 0) < 0
                      const isTotal = row.formula_type === 'total'

                      if (row.is_formula) {
                        return (
                          <td
                            key={month}
                            className={`text-right px-4 py-1.5 tabular-nums min-w-[120px] text-sm ${
                              isTotal
                                ? 'text-[#2D3F52] font-bold'
                                : isNeg
                                ? 'text-red-500'
                                : 'text-gray-700'
                            }`}
                          >
                            {displayVal !== null && displayVal !== 0
                              ? formatNum(displayVal)
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        )
                      }

                      const editedRaw = editedValues[row.id]?.[month]
                      const inputVal  = editedRaw !== undefined
                        ? editedRaw
                        : (row.values[month]?.raw_value ?? '')

                      return (
                        <td key={month} className="text-right px-1 py-0.5 min-w-[120px]">
                          <input
                            type="text"
                            value={inputVal}
                            onChange={e => handleCellChange(row.id, month, e.target.value)}
                            onBlur={() => handleCellBlur(row.id, month)}
                            className={`text-right bg-transparent border-0 focus:bg-blue-50 focus:outline-none w-full text-sm px-3 py-1.5 rounded tabular-nums ${
                              isNeg ? 'text-red-500' : 'text-gray-800'
                            }`}
                            placeholder="—"
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleMonths.length + 1} className="text-center py-10 text-gray-400 text-sm">
                    Sin datos. Ejecuta el seed para cargar la tabla inicial.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Month navigation — jumps 6 at a time */}
        {months.length > WINDOW_SIZE && (
          <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2.5">
            <button
              onClick={() => setWindowStart(s => Math.max(0, s - WINDOW_SIZE))}
              disabled={windowStart === 0}
              className="px-3 py-1 text-sm font-medium rounded border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              ← Anterior
            </button>

            <div className="flex-1 text-center">
              <span className="text-xs text-gray-500 font-medium">
                {displayMonth(months[windowStart])}
                {' — '}
                {displayMonth(months[Math.min(windowStart + WINDOW_SIZE - 1, months.length - 1)])}
              </span>
              <span className="ml-2 text-xs text-gray-300">
                ({Math.floor(windowStart / WINDOW_SIZE) + 1} / {Math.ceil(months.length / WINDOW_SIZE)})
              </span>
            </div>

            <button
              onClick={() => setWindowStart(s => Math.min(months.length - WINDOW_SIZE, s + WINDOW_SIZE))}
              disabled={windowStart + WINDOW_SIZE >= months.length}
              className="px-3 py-1 text-sm font-medium rounded border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

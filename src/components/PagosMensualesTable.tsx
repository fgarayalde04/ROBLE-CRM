'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentRow {
  id: string
  concept: string
  expense_type: string          // 'recurrente' | 'extra' (legacy: 'fijo' | 'variable')
  category: string
  comment: string | null
  sort_order: number
  values: Record<string, {
    id?: string
    value: number | null
    raw_value: string | null
    payment_status?: string | null
    paid_at?: string | null
  }>
}

interface Props {
  table: { id: string; company: string; year: number; exchange_rate: number }
  rows: PaymentRow[]
  availableYears: number[]
  currentYear: number
  company: string
  closedMonths: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]

const MONTH_LABELS: Record<string, string> = {
  enero: 'Ene', febrero: 'Feb', marzo: 'Mar', abril: 'Abr',
  mayo: 'May', junio: 'Jun', julio: 'Jul', agosto: 'Ago',
  setiembre: 'Set', octubre: 'Oct', noviembre: 'Nov', diciembre: 'Dic',
}

const MONTH_LABELS_FULL: Record<string, string> = {
  enero: 'Enero', febrero: 'Febrero', marzo: 'Marzo', abril: 'Abril',
  mayo: 'Mayo', junio: 'Junio', julio: 'Julio', agosto: 'Agosto',
  setiembre: 'Setiembre', octubre: 'Octubre', noviembre: 'Noviembre', diciembre: 'Diciembre',
}

const WINDOW_SIZE = 6

const CATEGORIES = [
  'salarios', 'alquiler', 'servicios', 'tecnología', 'impuestos',
  'legales', 'oficina', 'marketing', 'proveedores', 'otros',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseVal(raw: string | null | undefined): number {
  if (!raw || raw === '?') return 0
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Backwards compat: 'fijo' treated as recurrente, 'variable' treated as extra
function isRecurrente(type: string) {
  return type === 'recurrente' || type === 'fijo'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PagosMensualesTable({
  table,
  rows: initialRows,
  availableYears,
  currentYear,
  company,
  closedMonths,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<PaymentRow[]>(initialRows)
  const [exchangeRate, setExchangeRate] = useState(table.exchange_rate)
  const [exchangeRateInput, setExchangeRateInput] = useState(String(table.exchange_rate))

  // Month window — default to current month
  const [windowStart, setWindowStart] = useState(() => {
    const now = new Date()
    const idx = now.getMonth()
    return Math.max(0, Math.min(idx - 1, ALL_MONTHS.length - WINDOW_SIZE))
  })
  const visibleMonths = ALL_MONTHS.slice(windowStart, windowStart + WINDOW_SIZE)

  // Payment cell popover
  const [activePopover, setActivePopover] = useState<{ rowId: string; month: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; month: string } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Filter state
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [closedMonthsState, setClosedMonthsState] = useState<string[]>(closedMonths)

  // Copy month modal
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copySource, setCopySource] = useState(ALL_MONTHS[0])
  const [copyTarget, setCopyTarget] = useState('')
  const [copyWithValues, setCopyWithValues] = useState(false)

  // Add row — section-aware
  const [addingRowSection, setAddingRowSection] = useState<'recurrente' | 'extra' | null>(null)
  const [newConcept, setNewConcept] = useState('')
  const [newCategory, setNewCategory] = useState('otros')

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCellChange = useCallback((rowId: string, month: string, rawVal: string) => {
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r, values: { ...r.values, [month]: { ...r.values[month], raw_value: rawVal, value: parseVal(rawVal) || null } },
    }))
  }, [])

  const handleCellBlur = useCallback(async (rowId: string, month: string, rawVal: string) => {
    setEditingCell(null)
    await fetch('/api/pagos-mensuales?action=upsert-value', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, month, raw_value: rawVal }),
    })
  }, [])

  const debounce = useCallback((key: string, fn: () => void, delay: number) => {
    clearTimeout(debounceTimers.current[key])
    debounceTimers.current[key] = setTimeout(fn, delay)
  }, [])

  const handleConceptChange = useCallback((rowId: string, value: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, concept: value } : r))
    debounce(`concept-${rowId}`, () => {
      fetch('/api/pagos-mensuales?action=update-row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: rowId, concept: value }),
      })
    }, 700)
  }, [debounce])

  const handleCommentChange = useCallback((rowId: string, value: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, comment: value } : r))
    debounce(`comment-${rowId}`, () => {
      fetch('/api/pagos-mensuales?action=update-row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: rowId, comment: value }),
      })
    }, 700)
  }, [debounce])

  const handleToggleSection = useCallback(async (rowId: string, currentType: string) => {
    // DB constraint only allows 'fijo'|'variable'; fijo=recurrente, variable=extra
    const newType = isRecurrente(currentType) ? 'variable' : 'fijo'
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, expense_type: newType } : r))
    await fetch('/api/pagos-mensuales?action=update-row', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, expense_type: newType }),
    })
  }, [])

  const handleExchangeRateBlur = useCallback(async () => {
    const val = parseFloat(exchangeRateInput.replace(',', '.'))
    if (!isNaN(val)) {
      setExchangeRate(val)
      await fetch('/api/pagos-mensuales?action=exchange-rate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: table.id, exchange_rate: val }),
      })
    }
  }, [exchangeRateInput, table.id])

  const handleDeleteRow = useCallback(async (rowId: string, concept: string) => {
    if (!confirm(`Eliminar fila "${concept}"?`)) return
    const res = await fetch('/api/pagos-mensuales?action=delete-row', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId }),
    })
    if (res.ok) setRows(prev => prev.filter(r => r.id !== rowId))
  }, [])

  const handleAddRow = useCallback(async () => {
    if (!newConcept.trim() || !addingRowSection) return
    const res = await fetch('/api/pagos-mensuales?action=add-row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_id: table.id,
        concept: newConcept.trim(),
        expense_type: addingRowSection === 'recurrente' ? 'fijo' : 'variable',
        category: newCategory,
      }),
    })
    if (res.ok) {
      const newRow = await res.json() as {
        id: string; concept: string; expense_type: string
        category: string; comment: null; sort_order: number
      }
      setRows(prev => [...prev, { ...newRow, values: {} }])
      setNewConcept('')
      setNewCategory('otros')
      setAddingRowSection(null)
    }
  }, [newConcept, newCategory, addingRowSection, table.id])

  const handleCreateYear = useCallback(async () => {
    const nextYear = currentYear + 1
    if (!confirm(`Crear tabla para ${nextYear} copiando filas de ${currentYear}?`)) return
    const res = await fetch('/api/pagos-mensuales?action=create-year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, year: nextYear, from_year: currentYear }),
    })
    if (res.ok) router.push(`/pagos-mensuales?company=${company}&year=${nextYear}`)
  }, [currentYear, company, router])

  const handleMarkPaid = useCallback(async (rowId: string, month: string) => {
    const now = new Date().toISOString()
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r, values: { ...r.values, [month]: { ...r.values[month], payment_status: 'pagado', paid_at: now } },
    }))
    setActivePopover(null)
    await fetch('/api/pagos-mensuales?action=toggle-payment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, month, payment_status: 'pagado' }),
    })
  }, [])

  const handleMarkPending = useCallback(async (rowId: string, month: string) => {
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r, values: { ...r.values, [month]: { ...r.values[month], payment_status: 'pendiente', paid_at: null } },
    }))
    setActivePopover(null)
    await fetch('/api/pagos-mensuales?action=toggle-payment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, month, payment_status: 'pendiente' }),
    })
  }, [])

  const handleToggleClosedMonth = useCallback(async (month: string) => {
    const isCurrentlyClosed = closedMonthsState.includes(month)
    setClosedMonthsState(isCurrentlyClosed
      ? closedMonthsState.filter(m => m !== month)
      : [...closedMonthsState, month])
    await fetch('/api/pagos-mensuales?action=toggle-closed-month', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: table.id, month }),
    })
  }, [closedMonthsState, table.id])

  const handleCopyMonth = useCallback(async () => {
    if (!copyTarget.trim()) return
    const res = await fetch('/api/pagos-mensuales?action=copy-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_id: table.id,
        source_month: copySource,
        target_month: copyTarget.trim().toLowerCase(),
        copy_values: copyWithValues,
      }),
    })
    if (res.ok) { setShowCopyModal(false); router.refresh() }
  }, [copySource, copyTarget, copyWithValues, table.id, router])

  const handleExportExcel = useCallback(async () => {
    const wb = new ExcelJS.Workbook()
    const companyLabel = company === 'roble' ? 'Roble Capital' : 'Geliene International'
    const ws = wb.addWorksheet(`${companyLabel} ${currentYear}`)
    const NAVY = '0F2240', GOLD = 'C4A35A', WHITE = 'FFFFFF', GRAY_L = 'F3F4F6', AMB_L = 'FFFBEB'
    const navyFill  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${NAVY}` } }
    const goldFill  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${GOLD}` } }
    const grayFill  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${GRAY_L}` } }
    const ambFill   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${AMB_L}` } }
    const thinBorder = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }

    const titleRow = ws.addRow([`${companyLabel.toUpperCase()} — PAGOS MENSUALES ${currentYear}`])
    ws.mergeCells(1, 1, 1, 2 + ALL_MONTHS.length + 1)
    titleRow.getCell(1).fill = navyFill
    titleRow.getCell(1).font = { bold: true, color: { argb: `FF${WHITE}` }, size: 13, name: 'Calibri' }
    titleRow.height = 28

    const headers = ['Concepto', 'Categoría', ...ALL_MONTHS.map(m => MONTH_LABELS_FULL[m]), 'Total', 'Comentario']
    const hRow = ws.addRow(headers)
    hRow.height = 22
    hRow.eachCell(cell => {
      cell.fill = goldFill
      cell.font = { bold: true, color: { argb: `FF${WHITE}` }, size: 10, name: 'Calibri' }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })

    const recurRows = filteredRows.filter(r => isRecurrente(r.expense_type))
    const extraRows = filteredRows.filter(r => !isRecurrente(r.expense_type))

    for (const r of recurRows) {
      const total = ALL_MONTHS.reduce((s, m) => s + parseVal(r.values[m]?.raw_value), 0)
      const monthVals = ALL_MONTHS.map(m => {
        const rv = r.values[m]?.raw_value
        if (!rv || rv === '?') return null
        const n = parseFloat(rv.replace(',', '.'))
        return isNaN(n) ? null : n
      })
      const dr = ws.addRow([r.concept, r.category, ...monthVals, total > 0 ? total : null, r.comment ?? ''])
      dr.height = 18
      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = grayFill
        cell.font = { size: 10, name: 'Calibri' }
        cell.border = thinBorder
        if (ci >= 3 && ci <= 2 + ALL_MONTHS.length + 1 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else if (ci === 1) {
          cell.font = { ...cell.font, bold: true }; cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        } else { cell.alignment = { horizontal: 'center', vertical: 'middle' } }
      })
    }

    // Subtotal row
    const startDataRow = 3
    const subtotalRow = ws.addRow([
      'SUBTOTAL',
      '',
      ...ALL_MONTHS.map((_, i) => `=SUM(${String.fromCharCode(67 + i)}${startDataRow}:${String.fromCharCode(67 + i)}${startDataRow + recurRows.length - 1})`),
      `=SUM(${String.fromCharCode(67 + ALL_MONTHS.length)}${startDataRow}:${String.fromCharCode(67 + ALL_MONTHS.length)}${startDataRow + recurRows.length - 1})`,
      '',
    ])
    subtotalRow.height = 20
    subtotalRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      cell.font = { bold: true, size: 10, name: 'Calibri' }
      cell.border = thinBorder
      if (ci >= 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
      else { cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 } }
    })

    for (const r of extraRows) {
      const total = ALL_MONTHS.reduce((s, m) => s + parseVal(r.values[m]?.raw_value), 0)
      const monthVals = ALL_MONTHS.map(m => {
        const rv = r.values[m]?.raw_value
        if (!rv || rv === '?') return null
        const n = parseFloat(rv.replace(',', '.'))
        return isNaN(n) ? null : n
      })
      const dr = ws.addRow([r.concept, r.category, ...monthVals, total > 0 ? total : null, r.comment ?? ''])
      dr.height = 18
      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.font = { size: 10, name: 'Calibri' }
        cell.border = thinBorder
        if (ci >= 3 && ci <= 2 + ALL_MONTHS.length + 1 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else if (ci === 1) {
          cell.font = { ...cell.font, bold: true }; cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        } else { cell.alignment = { horizontal: 'center', vertical: 'middle' } }
      })
    }

    ws.columns = [{ width: 28 }, { width: 14 }, ...ALL_MONTHS.map(() => ({ width: 11 })), { width: 13 }, { width: 22 }]
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `pagos-${company}-${currentYear}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }, [rows, company, currentYear])

  // ─── Derived data ────────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => rows.filter(r => {
    if (search && !r.concept.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategory !== 'all' && r.category !== filterCategory) return false
    return true
  }), [rows, search, filterCategory])

  const recurringRows = useMemo(() => filteredRows.filter(r => isRecurrente(r.expense_type)), [filteredRows])
  const extraRows = useMemo(() => filteredRows.filter(r => !isRecurrente(r.expense_type)), [filteredRows])

  // Subtotals per month (recurring only)
  const subtotals: Record<string, number> = {}
  for (const m of ALL_MONTHS) subtotals[m] = recurringRows.reduce((s, r) => s + parseVal(r.values[m]?.raw_value), 0)

  const monthTotals: Record<string, number> = {}
  for (const m of ALL_MONTHS) monthTotals[m] = rows.reduce((s, r) => s + parseVal(r.values[m]?.raw_value), 0)
  const grandTotal = ALL_MONTHS.reduce((s, m) => s + monthTotals[m], 0)
  const monthsWithData = ALL_MONTHS.filter(m => monthTotals[m] > 0).length
  const avgMensual = monthsWithData > 0 ? grandTotal / monthsWithData : 0
  const rowTotal = (r: PaymentRow) => ALL_MONTHS.reduce((s, m) => s + parseVal(r.values[m]?.raw_value), 0)

  // ─── Month cell renderer ─────────────────────────────────────────────────────

  function renderCell(row: PaymentRow, m: string) {
    const cell = row.values[m]
    const rawVal = cell?.raw_value ?? ''
    const isPaid = cell?.payment_status === 'pagado'
    const paidAt = cell?.paid_at
      ? new Date(cell.paid_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })
      : null
    const isQuestion = rawVal === '?'
    const hasValue = rawVal && rawVal !== '?'
    const isThisPopover = activePopover?.rowId === row.id && activePopover?.month === m
    const isEditing = editingCell?.rowId === row.id && editingCell?.month === m
    const isClosed = closedMonthsState.includes(m)

    return (
      <td key={m} className={`py-0.5 px-1.5 relative group/cell ${isPaid ? 'bg-emerald-50' : isQuestion ? 'bg-amber-50' : ''}`}
        style={{ minWidth: '90px' }}>

        {isEditing ? (
          <input
            type="text"
            value={rawVal}
            autoFocus
            onChange={e => handleCellChange(row.id, m, e.target.value)}
            onBlur={e => handleCellBlur(row.id, m, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
            className="bg-blue-50 border-0 focus:outline-none text-right w-full text-xs px-1.5 py-1 rounded tabular-nums text-gray-800"
          />
        ) : isPaid ? (
          <button
            className="w-full text-right px-1.5 py-1 rounded text-xs tabular-nums text-emerald-700 font-medium"
            onClick={() => setActivePopover(isThisPopover ? null : { rowId: row.id, month: m })}
          >
            <span className="text-emerald-500 mr-0.5">✓</span>{rawVal}
            {paidAt && <span className="block text-[9px] text-emerald-400 font-normal">{paidAt}</span>}
          </button>
        ) : (
          <div className="flex items-center gap-0.5">
            <button
              className={`flex-1 text-right px-1.5 py-1 rounded text-xs tabular-nums transition-colors ${
                isQuestion ? 'text-amber-600' : 'text-gray-700 hover:bg-gray-100'
              } ${isClosed ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => { if (!isClosed) setEditingCell({ rowId: row.id, month: m }) }}
            >
              {rawVal || <span className="text-gray-300">—</span>}
            </button>
            {hasValue && !isClosed && (
              <button
                onClick={() => handleMarkPaid(row.id, m)}
                className="opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-emerald-600 hover:bg-emerald-50"
                title="Marcar como pagado"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            )}
          </div>
        )}

        {isThisPopover && isPaid && (
          <div
            ref={popoverRef}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
            style={{ minWidth: '110px' }}
          >
            <button
              onClick={() => { setActivePopover(null); setEditingCell({ rowId: row.id, month: m }) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 border-b border-gray-100"
            >
              <span>✏️</span> Editar
            </button>
            <button
              onClick={() => handleMarkPending(row.id, m)}
              className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 flex items-center gap-1.5"
            >
              <span>↩</span> Pendiente
            </button>
          </div>
        )}
      </td>
    )
  }

  // ─── Row renderer ────────────────────────────────────────────────────────────

  function renderRow(row: PaymentRow, bgClass: string) {
    const total = rowTotal(row)
    return (
      <tr key={row.id} className={`group border-b border-gray-100 ${bgClass}`}>
        {/* Concepto */}
        <td className={`py-2 px-4 ${bgClass}`}
          style={{ position: 'sticky', left: 0, zIndex: 5 }}>
          <input
            type="text"
            value={row.concept}
            onChange={e => handleConceptChange(row.id, e.target.value)}
            className="bg-transparent border-0 focus:bg-blue-50 focus:outline-none w-full text-sm text-[#2D3F52]"
          />
        </td>

        {/* Month cells */}
        {visibleMonths.map(m => renderCell(row, m))}

        {/* Total */}
        <td className="py-2 px-3 text-right text-sm text-gray-500 tabular-nums">
          {total > 0 ? fmtNum(total) : ''}
        </td>

        {/* Comentario */}
        <td className="py-2 px-3">
          <input
            type="text"
            value={row.comment ?? ''}
            onChange={e => handleCommentChange(row.id, e.target.value)}
            placeholder="—"
            className="bg-transparent border-0 focus:bg-blue-50 focus:outline-none text-sm text-gray-400 w-full"
          />
        </td>

        {/* Actions: toggle section + delete */}
        <td className="py-2 px-2 text-right whitespace-nowrap">
          <span className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleToggleSection(row.id, row.expense_type)}
              className="text-[10px] text-gray-300 hover:text-blue-500 transition-colors px-1 leading-none"
              title={isRecurrente(row.expense_type) ? 'Mover a Extras' : 'Mover a Recurrentes'}
            >
              {isRecurrente(row.expense_type) ? '↓' : '↑'}
            </button>
            <button
              onClick={() => handleDeleteRow(row.id, row.concept)}
              className="text-red-300 hover:text-red-500 transition-all text-base leading-none"
              title="Eliminar"
            >×</button>
          </span>
        </td>
      </tr>
    )
  }

  // ─── Add row form ─────────────────────────────────────────────────────────────

  function renderAddForm(section: 'recurrente' | 'extra') {
    if (addingRowSection !== section) {
      return (
        <tr className={section === 'recurrente' ? 'bg-gray-50' : 'bg-white'}>
          <td colSpan={visibleMonths.length + 4} className="py-2 px-4">
            <button
              onClick={() => { setAddingRowSection(section); setNewConcept(''); setNewCategory('otros') }}
              className="text-xs text-gray-400 hover:text-[#2D3F52] transition-colors flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span>
              Agregar {section === 'recurrente' ? 'recurrente' : 'extra'}
            </button>
          </td>
        </tr>
      )
    }
    return (
      <tr className="bg-blue-50/50">
        <td className="py-2 px-4" style={{ position: 'sticky', left: 0, zIndex: 5, background: 'rgb(239 246 255 / 0.5)' }}>
          <input
            type="text"
            placeholder="Concepto..."
            value={newConcept}
            onChange={e => setNewConcept(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddRow()}
            autoFocus
            className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] w-full"
          />
        </td>
        <td colSpan={visibleMonths.length + 1} className="py-2 px-3">
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>
        <td colSpan={2} className="py-2 px-3 text-right">
          <button
            onClick={handleAddRow}
            className="px-3 py-1 text-xs font-medium text-white rounded mr-1"
            style={{ backgroundColor: '#2D3F52' }}
          >Agregar</button>
          <button
            onClick={() => setAddingRowSection(null)}
            className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-100"
          >Cancelar</button>
        </td>
      </tr>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Top controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 font-medium">Tipo de cambio USD/UYU:</label>
          <input
            type="text"
            value={exchangeRateInput}
            onChange={e => setExchangeRateInput(e.target.value)}
            onBlur={handleExchangeRateBlur}
            className="w-24 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] text-right"
          />
          <span className="text-xs text-gray-400">UYU</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCopyModal(true)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Copiar mes
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 text-xs font-medium text-white rounded-lg flex items-center gap-1.5"
            style={{ backgroundColor: '#217346' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Excel
          </button>
          {!availableYears.includes(currentYear + 1) && (
            <button
              onClick={handleCreateYear}
              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
              style={{ backgroundColor: '#2D3F52' }}
            >
              Crear {currentYear + 1}
            </button>
          )}
        </div>
      </div>

      {/* KPI pills */}
      <div className="flex gap-3 text-sm">
        <div className="px-3 py-1.5 bg-gray-50 rounded-lg">
          <span className="text-gray-500 text-xs">Total acumulado:</span>
          <span className="ml-1.5 font-semibold text-[#2D3F52]">${fmtNum(grandTotal)}</span>
        </div>
        <div className="px-3 py-1.5 bg-gray-50 rounded-lg">
          <span className="text-gray-500 text-xs">Promedio mensual:</span>
          <span className="ml-1.5 font-semibold text-[#2D3F52]">${fmtNum(avgMensual)}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar concepto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#16A34A] w-48"
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="all">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#2D3F52] text-white">
                <th
                  className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider bg-[#2D3F52] whitespace-nowrap"
                  style={{ position: 'sticky', left: 0, zIndex: 10, minWidth: '220px' }}
                >
                  Concepto
                </th>
                {visibleMonths.map(m => (
                  <th key={m} className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ minWidth: '100px' }}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{MONTH_LABELS[m]}</span>
                      <button
                        onClick={() => handleToggleClosedMonth(m)}
                        className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
                          closedMonthsState.includes(m)
                            ? 'bg-white/20 text-white/70'
                            : 'text-white/30 hover:text-white/60'
                        }`}
                        title={closedMonthsState.includes(m) ? 'Reabrir mes' : 'Cerrar mes'}
                      >
                        {closedMonthsState.includes(m) ? '🔒' : '·'}
                      </button>
                    </div>
                  </th>
                ))}
                <th className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ minWidth: '100px' }}>Total</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider" style={{ minWidth: '140px' }}>Comentario</th>
                <th className="w-12 bg-[#2D3F52]" />
              </tr>
            </thead>

            <tbody>
              {/* ── Recurrentes ── */}
              {recurringRows.map(row => renderRow(row, 'bg-gray-50'))}

              {/* Add recurrente */}
              {renderAddForm('recurrente')}

              {/* ── SUBTOTAL ── */}
              <tr className="border-t-2 border-gray-300 border-b border-gray-200" style={{ backgroundColor: '#E8ECF0' }}>
                <td
                  className="py-3 px-4 text-sm font-bold text-[#2D3F52] tracking-wide"
                  style={{ position: 'sticky', left: 0, zIndex: 5, backgroundColor: '#E8ECF0' }}
                >
                  Subtotal
                </td>
                {visibleMonths.map(m => (
                  <td key={m} className="py-3 px-3 text-right text-sm font-bold text-[#2D3F52] tabular-nums">
                    {subtotals[m] > 0 ? fmtNum(subtotals[m]) : ''}
                  </td>
                ))}
                <td className="py-3 px-3 text-right text-sm font-bold text-[#2D3F52] tabular-nums">
                  {fmtNum(ALL_MONTHS.reduce((s, m) => s + subtotals[m], 0))}
                </td>
                <td /><td />
              </tr>

              {/* ── Extras label ── */}
              {extraRows.length > 0 && (
                <tr className="bg-white">
                  <td
                    colSpan={visibleMonths.length + 4}
                    className="pt-3 pb-1 px-4 text-xs text-gray-400 bg-white"
                  >
                    Extras del mes
                  </td>
                </tr>
              )}
              {extraRows.map(row => renderRow(row, 'bg-white'))}

              {/* Add extra */}
              {renderAddForm('extra')}
            </tbody>

            {/* Totals */}
            <tfoot>
              <tr className="border-t-2 border-[#2D3F52]" style={{ backgroundColor: '#1E2D3D' }}>
                <td
                  className="py-3.5 px-4 text-base font-bold text-white tracking-wide"
                  style={{ position: 'sticky', left: 0, zIndex: 5, backgroundColor: '#1E2D3D' }}
                >Total</td>
                {visibleMonths.map(m => (
                  <td key={m} className="py-3.5 px-3 text-right text-base font-bold text-white tabular-nums">
                    {monthTotals[m] > 0 ? fmtNum(monthTotals[m]) : ''}
                  </td>
                ))}
                <td className="py-3.5 px-3 text-right text-base font-bold text-white tabular-nums">{fmtNum(grandTotal)}</td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2">
          <button
            onClick={() => setWindowStart(s => Math.max(0, s - WINDOW_SIZE))}
            disabled={windowStart === 0}
            className="px-3 py-1 text-sm font-medium rounded border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >← Anterior</button>

          <div className="flex-1 flex items-center justify-center gap-1">
            {Array.from({ length: Math.ceil(ALL_MONTHS.length / WINDOW_SIZE) }, (_, i) => {
              const isActive = Math.floor(windowStart / WINDOW_SIZE) === i
              return (
                <button
                  key={i}
                  onClick={() => setWindowStart(i * WINDOW_SIZE)}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    isActive ? 'bg-[#2D3F52] text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {MONTH_LABELS[ALL_MONTHS[i * WINDOW_SIZE]]}–{MONTH_LABELS[ALL_MONTHS[Math.min(i * WINDOW_SIZE + WINDOW_SIZE - 1, ALL_MONTHS.length - 1)]]}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setWindowStart(s => Math.min(ALL_MONTHS.length - WINDOW_SIZE, s + WINDOW_SIZE))}
            disabled={windowStart + WINDOW_SIZE >= ALL_MONTHS.length}
            className="px-3 py-1 text-sm font-medium rounded border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >Siguiente →</button>
        </div>
      </div>

      {/* Copy month modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
            <h3 className="font-semibold text-[#2D3F52]">Copiar mes</h3>
            <div>
              <label className="text-sm text-gray-600">Mes origen</label>
              <select
                value={copySource}
                onChange={e => setCopySource(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none"
              >
                {ALL_MONTHS.map(m => <option key={m} value={m}>{MONTH_LABELS_FULL[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Mes destino</label>
              <input
                type="text"
                placeholder="ej: julio"
                value={copyTarget}
                onChange={e => setCopyTarget(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A]"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="copyVals"
                checked={copyWithValues}
                onChange={e => setCopyWithValues(e.target.checked)}
              />
              <label htmlFor="copyVals" className="text-sm text-gray-600">Copiar montos también</label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyMonth}
                className="flex-1 py-2 text-sm font-medium text-white rounded"
                style={{ backgroundColor: '#2D3F52' }}
              >Copiar</button>
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

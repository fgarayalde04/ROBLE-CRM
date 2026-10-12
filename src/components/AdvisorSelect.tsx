'use client'

import { useEffect, useState } from 'react'

// Desplegable de asesores registrados (sin texto libre). Si el valor actual no
// está en la lista se muestra igual, para no perderlo al guardar.
export default function AdvisorSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [options, setOptions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/advisors')
      .then((r) => (r.ok ? r.json() : []))
      .then((names) => setOptions(Array.isArray(names) ? names : []))
      .catch(() => setOptions([]))
  }, [])

  const all = value && !options.includes(value) ? [value, ...options] : options

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">— Sin asignar —</option>
      {all.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  )
}

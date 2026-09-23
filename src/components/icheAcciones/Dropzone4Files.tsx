'use client'

import { useRef, useState } from 'react'

interface Props {
  onSubmit: (files: File[]) => void
  loading: boolean
}

export default function Dropzone4Files({ onSubmit, loading }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles(prev => {
      const next = [...prev]
      for (const f of Array.from(list)) {
        const i = next.findIndex(existing => existing.name === f.name)
        if (i >= 0) next[i] = f // mismo nombre: se asume una corrección, reemplaza
        else next.push(f)
      }
      return next
    })
  }

  function removeFile(name: string) {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? 'border-[#3A3A3C] bg-gray-50' : 'border-gray-300'
        }`}
      >
        <p className="text-sm text-gray-600">
          Soltá acá los 4 archivos del mes (Unrealized Pershing, Activity Pershing, Holdings Morgan, Activity Morgan) — el sistema detecta cuál es cuál. Podés subirlos de a uno, cada archivo nuevo se suma a los anteriores.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx"
          className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gray-700">
          {files.map(f => (
            <li key={f.name} className="flex items-center justify-between">
              <span>📄 {f.name}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeFile(f.name) }}
                className="ml-2 text-xs text-gray-400 hover:text-red-600"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        disabled={files.length !== 4 || loading}
        onClick={() => onSubmit(files)}
        className="mt-4 rounded-md bg-[#3A3A3C] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {loading ? 'Procesando…' : `Analizar (${files.length}/4 archivos)`}
      </button>
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'

interface Props {
  onSubmit: (files: File[]) => void
  loading: boolean
}

export default function Dropzone4Files({ onSubmit, loading }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function addFiles(incoming: File[]) {
    setReadError(null)
    const snapshots: File[] = []
    for (const f of incoming) {
      try {
        // Copia a memoria: si el archivo cambia o se vuelve ilegible en disco
        // (OneDrive, descarga en curso) Chrome aborta el envío con un genérico
        // "Failed to fetch"; leyéndolo ya, el error sale acá y con nombre.
        snapshots.push(new File([await f.arrayBuffer()], f.name, { type: f.type, lastModified: f.lastModified }))
      } catch {
        setReadError(`No se pudo leer "${f.name}". Si está en OneDrive o se está descargando, esperá a que termine (o copialo a Descargas) y volvé a elegirlo.`)
      }
    }
    if (!snapshots.length) return
    setFiles(prev => {
      const next = [...prev]
      for (const f of snapshots) {
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
          addFiles(Array.from(e.dataTransfer.files))
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
          onChange={e => {
            const picked = Array.from(e.target.files ?? [])
            e.target.value = ''
            addFiles(picked)
          }}
        />
      </div>

      {readError && <p className="mt-3 text-sm text-red-700">{readError}</p>}

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

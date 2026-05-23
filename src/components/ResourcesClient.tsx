'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Resource {
  id: string
  name: string
  category: string
  description: string | null
  company: string | null
  file_url: string
  file_name: string
  file_size: number | null
  responsible: string | null
  tags: string[]
  is_featured: boolean
  view_count: number
  created_at: string
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  presentacion_empresa: 'Presentación empresa',
  bancos_custodios: 'Bancos / Custodios',
  fondos: 'Fondos',
  marketing: 'Marketing',
  logos_marca: 'Logos y marca',
  formularios_comerciales: 'Formularios comerciales',
  pdfs_institucionales: 'PDFs institucionales',
  otros: 'Otros',
}

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS)

const LS_KEY = 'recursos_favorites'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── PDF Icon ─────────────────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <div className="w-14 h-16 flex flex-col rounded-lg overflow-hidden shadow-sm border border-rose-100 flex-shrink-0">
      <div className="flex-1 bg-rose-50 flex items-center justify-center">
        <svg className="w-7 h-7 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
          <path d="M9 13h1.5a1 1 0 0 1 0 2H9v1h1.5a2 2 0 0 0 0-4H8v5h1v-4zm4 4h1v-4h-1v4zm2-4h-.5v4H16a2 2 0 0 0 0-4h-1zm.5 3h-.5v-2h.5a1 1 0 0 1 0 2z" />
        </svg>
      </div>
      <div className="bg-rose-500 text-white text-[9px] font-bold tracking-wider text-center py-0.5">
        PDF
      </div>
    </div>
  )
}

// ─── Resource Card ────────────────────────────────────────────────────────────

function ResourceCard({
  resource,
  isFavorite,
  onToggleFavorite,
  onEdit,
  onDelete,
}: {
  resource: Resource
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onEdit: (r: Resource) => void
  onDelete: (r: Resource) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleOpen() {
    await fetch(`/api/recursos/${resource.id}/view`, { method: 'POST' })
    window.open(resource.file_url, '_blank')
  }

  return (
    <div
      className="relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
    >
      {/* Featured badge */}
      {resource.is_featured && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <svg className="w-2.5 h-2.5 fill-amber-500" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Destacado
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex gap-3">
        <PdfIcon />
        <div className="flex-1 min-w-0 pr-12">
          <p className="font-medium text-gray-900 text-sm leading-snug break-words">{resource.name}</p>
          <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {CATEGORY_LABELS[resource.category] ?? resource.category}
          </span>
          {resource.description && (
            <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{resource.description}</p>
          )}
          {resource.company && (
            <p className="mt-1 text-xs font-medium text-gray-700">{resource.company}</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {resource.tags && resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resource.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] text-gray-400 border-t border-gray-50 pt-2">
        {resource.file_size && (
          <span>{formatBytes(resource.file_size)}</span>
        )}
        <span>{formatDate(resource.updated_at)}</span>
        {resource.responsible && (
          <span className="truncate">{resource.responsible}</span>
        )}
        {resource.view_count > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {resource.view_count}
          </span>
        )}
      </div>

      {/* Action bar (visible on hover) */}
      <div
        className={`flex items-center gap-1.5 transition-all duration-150 ${hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}
      >
        <button
          onClick={handleOpen}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg text-white transition-colors"
          style={{ backgroundColor: '#2D3F52' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Abrir
        </button>

        <a
          href={resource.file_url}
          download={resource.file_name}
          className="flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Bajar
        </a>

        <button
          onClick={() => onToggleFavorite(resource.id)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-amber-50 transition-colors"
          title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <svg
            className={`w-4 h-4 transition-colors ${isFavorite ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`}
            fill={isFavorite ? 'currentColor' : 'none'}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={isFavorite ? 0 : 2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden z-20">
              <button
                onClick={() => { setMenuOpen(false); onEdit(resource) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                Editar
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(resource) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onUploaded,
  editingResource,
}: {
  onClose: () => void
  onUploaded: () => void
  editingResource: Resource | null
}) {
  const isEdit = !!editingResource
  const [name, setName] = useState(editingResource?.name ?? '')
  const [category, setCategory] = useState(editingResource?.category ?? 'otros')
  const [description, setDescription] = useState(editingResource?.description ?? '')
  const [company, setCompany] = useState(editingResource?.company ?? '')
  const [responsible, setResponsible] = useState(editingResource?.responsible ?? '')
  const [tags, setTags] = useState((editingResource?.tags ?? []).join(', '))
  const [isFeatured, setIsFeatured] = useState(editingResource?.is_featured ?? false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (!isEdit && !file) { setError('Debes seleccionar un archivo PDF'); return }

    setUploading(true)

    try {
      if (isEdit) {
        const res = await fetch(`/api/recursos/${editingResource.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            category,
            description: description.trim() || null,
            company: company.trim() || null,
            responsible: responsible.trim() || null,
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            is_featured: isFeatured,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Error al actualizar')
        }
      } else {
        const fd = new FormData()
        fd.append('name', name.trim())
        fd.append('category', category)
        fd.append('description', description.trim())
        fd.append('company', company.trim())
        fd.append('responsible', responsible.trim())
        fd.append('tags', tags)
        fd.append('is_featured', String(isFeatured))
        fd.append('file', file!)

        const res = await fetch('/api/recursos', { method: 'POST', body: fd })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Error al subir')
        }
      }

      onUploaded()
      onClose()
    } catch (err) {
      setError(String(err).replace('Error: ', ''))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Editar recurso' : 'Subir recurso PDF'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit ? 'Modifica los metadatos del archivo' : 'Agrega un nuevo documento a la biblioteca'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Archivo PDF <span className="text-rose-500">*</span>
              </label>
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
                onClick={() => document.getElementById('pdf-file-input')?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">{file.name}</span>
                    <span className="text-xs text-gray-400">({formatBytes(file.size)})</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm text-gray-500">Haz clic para seleccionar un PDF</p>
                    <p className="text-xs text-gray-400 mt-1">Solo archivos PDF</p>
                  </>
                )}
              </div>
              <input
                id="pdf-file-input"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Nombre <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Presentación institucional 2025"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
            >
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Breve descripción del contenido..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Empresa / Emisor</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Ej: Schroders"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Responsable</label>
              <input
                type="text"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder="Ej: Juan García"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Tags (separados por coma)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ej: 2025, renta fija, onboarding"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              className={`w-9 h-5 rounded-full relative transition-colors ${isFeatured ? 'bg-amber-400' : 'bg-gray-200'}`}
              onClick={() => setIsFeatured((v) => !v)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isFeatured ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-700">Marcar como destacado</span>
          </label>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#2D3F52' }}
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isEdit ? 'Guardando...' : 'Subiendo...'}
                </>
              ) : (
                isEdit ? 'Guardar cambios' : 'Subir recurso'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  resource,
  onClose,
  onDeleted,
}: {
  resource: Resource
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/recursos/${resource.id}`, { method: 'DELETE' })
    onDeleted()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Eliminar recurso</h3>
          <p className="mt-1.5 text-sm text-gray-500">
            ¿Seguro que deseas eliminar <span className="font-medium text-gray-700">&ldquo;{resource.name}&rdquo;</span>?
            Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

interface ResourcesClientProps {
  initialResources: Resource[]
}

export default function ResourcesClient({ initialResources }: ResourcesClientProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null)

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        setFavorites(new Set(JSON.parse(raw) as string[]))
      }
    } catch {
      // ignore
    }
  }, [])

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }

  async function refreshResources() {
    const res = await fetch('/api/recursos')
    if (res.ok) {
      const data = await res.json()
      setResources(data)
    }
  }

  // Filter logic
  const filtered = resources.filter((r) => {
    if (showFavorites && !favorites.has(r.id)) return false
    if (activeCategory && r.category !== activeCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.company ?? '').toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return true
  })

  // Category counts (based on search filter, but not category filter)
  const categoryCounts = resources.reduce<Record<string, number>>((acc, r) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.name.toLowerCase().includes(q) &&
        !(r.description ?? '').toLowerCase().includes(q) &&
        !(r.company ?? '').toLowerCase().includes(q) &&
        !r.tags.some((t) => t.toLowerCase().includes(q))
      ) return acc
    }
    if (showFavorites && !favorites.has(r.id)) return acc
    acc[r.category] = (acc[r.category] ?? 0) + 1
    return acc
  }, {})

  const totalCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0)

  const featuredResources = filtered.filter((r) => r.is_featured)

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sticky top-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 mb-2">Categorías</p>

          {/* All */}
          <button
            onClick={() => { setActiveCategory(null); setShowFavorites(false) }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
              !activeCategory && !showFavorites
                ? 'font-semibold text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={!activeCategory && !showFavorites ? { backgroundColor: '#2D3F52' } : {}}
          >
            <span>Todos</span>
            <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 ${!activeCategory && !showFavorites ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {resources.length}
            </span>
          </button>

          {/* Favorites */}
          <button
            onClick={() => { setShowFavorites(true); setActiveCategory(null) }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm transition-colors mt-0.5 ${
              showFavorites ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={showFavorites ? { backgroundColor: '#2D3F52' } : {}}
          >
            <span className="flex items-center gap-1.5">
              <svg className={`w-3.5 h-3.5 ${showFavorites ? 'text-amber-300 fill-amber-300' : 'text-amber-400'}`} fill={showFavorites ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              Favoritos
            </span>
            <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 ${showFavorites ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {favorites.size}
            </span>
          </button>

          <div className="my-2 border-t border-gray-100" />

          {/* Categories */}
          {CATEGORY_KEYS.map((key) => {
            const count = categoryCounts[key] ?? 0
            const isActive = activeCategory === key && !showFavorites
            return (
              <button
                key={key}
                onClick={() => { setActiveCategory(key); setShowFavorites(false) }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors mt-0.5 ${
                  isActive ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={isActive ? { backgroundColor: '#2D3F52' } : {}}
              >
                <span className="truncate pr-1">{CATEGORY_LABELS[key]}</span>
                <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : count ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-300'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Search + Upload bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa, tag..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => { setEditingResource(null); setShowUploadModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl shadow-sm hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ backgroundColor: '#16A34A' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Subir PDF
          </button>
        </div>

        {/* Featured row */}
        {featuredResources.length > 0 && !showFavorites && !activeCategory && !search && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-amber-500 fill-amber-500" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Destacados
            </p>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featuredResources.map((r) => (
                <div key={r.id} className="w-60 flex-shrink-0">
                  <ResourceCard
                    resource={r}
                    isFavorite={favorites.has(r.id)}
                    onToggleFavorite={toggleFavorite}
                    onEdit={(res) => { setEditingResource(res); setShowUploadModal(true) }}
                    onDelete={setDeletingResource}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400">
            {filtered.length === totalCount
              ? `${totalCount} documento${totalCount !== 1 ? 's' : ''}`
              : `${filtered.length} de ${resources.length} documento${resources.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              {search ? 'No se encontraron resultados' : showFavorites ? 'No hay favoritos aún' : 'No hay documentos en esta categoría'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {search ? 'Intenta con otros términos de búsqueda' : showFavorites ? 'Marca documentos con la estrella para guardarlos aquí' : 'Sube el primer PDF con el botón de arriba'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                isFavorite={favorites.has(r.id)}
                onToggleFavorite={toggleFavorite}
                onEdit={(res) => { setEditingResource(res); setShowUploadModal(true) }}
                onDelete={setDeletingResource}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUploadModal && (
        <UploadModal
          onClose={() => { setShowUploadModal(false); setEditingResource(null) }}
          onUploaded={refreshResources}
          editingResource={editingResource}
        />
      )}

      {deletingResource && (
        <DeleteModal
          resource={deletingResource}
          onClose={() => setDeletingResource(null)}
          onDeleted={refreshResources}
        />
      )}
    </div>
  )
}

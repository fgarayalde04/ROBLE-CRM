'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveItem {
  id: string
  name: string
  webUrl: string
  isFolder: boolean
  mimeType: string | null
  size: number | null
  lastModified: string | null
}

interface BreadcrumbEntry {
  id: string
  name: string
}

interface Props {
  userId: string
  userName: string
  driveId: string | null
  rootFolderId: string | null
  rootFolderPath: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const MIME_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  'application/pdf':                                                        { icon: '📄', color: 'text-red-500',    label: 'PDF'   },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: '📝', color: 'text-blue-600',   label: 'Word'  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       { icon: '📊', color: 'text-green-600',  label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':{ icon: '📑', color: 'text-orange-500', label: 'PPT'   },
  'image/jpeg':    { icon: '🖼️', color: 'text-purple-500', label: 'JPG' },
  'image/png':     { icon: '🖼️', color: 'text-purple-500', label: 'PNG' },
  'image/gif':     { icon: '🖼️', color: 'text-purple-500', label: 'GIF' },
  'text/plain':    { icon: '📃', color: 'text-gray-500',   label: 'TXT' },
  'text/csv':      { icon: '📊', color: 'text-green-500',  label: 'CSV' },
}

function getFileInfo(mime: string | null) {
  if (!mime) return { icon: '📎', color: 'text-gray-400', label: 'Archivo' }
  return MIME_ICONS[mime] ?? { icon: '📎', color: 'text-gray-400', label: mime.split('/')[1]?.toUpperCase() ?? 'Archivo' }
}

const PREVIEWABLE = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif',
])

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MiCarpetaClient({ userName, driveId, rootFolderId, rootFolderPath }: Props) {
  const [items,         setItems]         = useState<DriveItem[]>([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [breadcrumbs,   setBreadcrumbs]   = useState<BreadcrumbEntry[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)

  // Toolbar state
  const [search,       setSearch]       = useState('')
  const [searchMode,   setSearchMode]   = useState(false)
  const [searchItems,  setSearchItems]  = useState<DriveItem[]>([])
  const [searchLoading,setSearchLoading]= useState(false)
  const [sortKey,      setSortKey]      = useState<'name' | 'date' | 'size'>('name')
  const [filterType,   setFilterType]   = useState<'all' | 'folder' | 'pdf' | 'word' | 'excel' | 'image'>('all')
  const [viewMode,     setViewMode]     = useState<'list' | 'grid'>('list')

  // Actions
  const [uploading,       setUploading]       = useState(false)
  const [uploadError,     setUploadError]     = useState<string | null>(null)
  const [mkdirMode,       setMkdirMode]       = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [renamingId,      setRenamingId]      = useState<string | null>(null)
  const [renameValue,     setRenameValue]     = useState('')
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [actionError,     setActionError]     = useState<string | null>(null)

  // Preview modal
  const [previewItem,    setPreviewItem]    = useState<DriveItem | null>(null)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError,   setPreviewError]   = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  // ─── Load folder ─────────────────────────────────────────────────────────────

  const loadFolder = useCallback(async (folderId: string, entry: BreadcrumbEntry, reset = false) => {
    if (!driveId) return
    setLoading(true)
    setError(null)
    setSearch('')
    setSearchMode(false)
    try {
      const res  = await fetch(`/api/onedrive/browse?driveId=${encodeURIComponent(driveId)}&folderId=${encodeURIComponent(folderId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar carpeta')
      const mapped: DriveItem[] = (data.items ?? []).map((i: any) => ({
        id:           i.id,
        name:         i.name,
        webUrl:       i.webUrl,
        isFolder:     !!i.folder,
        mimeType:     i.file?.mimeType ?? null,
        size:         i.size ?? null,
        lastModified: i.lastModifiedDateTime ?? null,
      }))
      setItems(mapped)
      setCurrentFolder(folderId)
      setBreadcrumbs(prev => {
        if (reset) return [entry]
        // Navigate to existing crumb = trim
        const idx = prev.findIndex(b => b.id === entry.id)
        if (idx >= 0) return prev.slice(0, idx + 1)
        return [...prev, entry]
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [driveId])

  // Initial load
  useEffect(() => {
    if (driveId && rootFolderId) {
      const rootLabel = rootFolderPath?.split('/').pop()?.trim() ?? rootFolderPath ?? 'Mi carpeta'
      loadFolder(rootFolderId, { id: rootFolderId, name: rootLabel }, true)
    }
  }, [driveId, rootFolderId, rootFolderPath, loadFolder])

  // ─── Search ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (!search.trim() || !driveId || !rootFolderId) {
      setSearchMode(false)
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      setSearchMode(true)
      try {
        const res  = await fetch(`/api/onedrive/search?q=${encodeURIComponent(search)}&driveId=${encodeURIComponent(driveId)}&folderId=${encodeURIComponent(rootFolderId)}`)
        const data = await res.json()
        if (res.ok) {
          setSearchItems((data.items ?? []).map((i: any) => ({
            id: i.id, name: i.name, webUrl: i.webUrl,
            isFolder: !!i.folder, mimeType: i.file?.mimeType ?? null,
            size: i.size ?? null, lastModified: i.lastModifiedDateTime ?? null,
          })))
        }
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }, [search, driveId, rootFolderId])

  // ─── File upload ──────────────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!driveId || !currentFolder) {
      setUploadError('La carpeta aún no cargó. Esperá un momento y volvé a intentarlo.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file',     file)
      fd.append('driveId',  driveId)
      fd.append('folderId', currentFolder)
      const res  = await fetch('/api/onedrive/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')
      const i = data.item
      const newItem: DriveItem = {
        id: i.id, name: i.name, webUrl: i.webUrl,
        isFolder: false, mimeType: i.file?.mimeType ?? null,
        size: i.size ?? null, lastModified: i.lastModifiedDateTime ?? null,
      }
      setItems(prev => [newItem, ...prev.filter(x => x.name !== newItem.name)])
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── Create folder ────────────────────────────────────────────────────────────

  async function handleMkdir() {
    if (!newFolderName.trim() || !driveId || !currentFolder) return
    setActionError(null)
    try {
      const res  = await fetch('/api/onedrive/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: currentFolder, driveId, name: newFolderName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear carpeta')
      const f = data.item
      const newFolder: DriveItem = {
        id: f.id, name: f.name, webUrl: f.webUrl,
        isFolder: true, mimeType: null, size: null, lastModified: f.lastModifiedDateTime ?? null,
      }
      setItems(prev => [newFolder, ...prev])
      setMkdirMode(false)
      setNewFolderName('')
    } catch (e: any) {
      setActionError(e.message)
    }
  }

  // ─── Rename ───────────────────────────────────────────────────────────────────

  async function handleRename(item: DriveItem) {
    if (!renameValue.trim() || renameValue === item.name || !driveId) return
    setActionError(null)
    try {
      const res  = await fetch(`/api/onedrive/item/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveId, name: renameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al renombrar')
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, name: data.item.name } : x))
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setRenamingId(null)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(item: DriveItem) {
    if (!confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(item.id)
    setActionError(null)
    try {
      const res = await fetch(
        `/api/onedrive/item/${item.id}?driveId=${encodeURIComponent(driveId!)}&name=${encodeURIComponent(item.name)}&type=${item.isFolder ? 'folder' : 'file'}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al eliminar')
      }
      setItems(prev => prev.filter(x => x.id !== item.id))
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Preview ──────────────────────────────────────────────────────────────────

  async function openPreview(item: DriveItem) {
    setPreviewItem(item)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const res  = await fetch(`/api/onedrive/preview/${item.id}?driveId=${encodeURIComponent(driveId!)}&name=${encodeURIComponent(item.name)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar la vista previa')
      setPreviewUrl(data.previewUrl)
    } catch (e: any) {
      setPreviewError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  // ─── Sorting & filtering ──────────────────────────────────────────────────────

  function applyFilters(list: DriveItem[]): DriveItem[] {
    let filtered = list
    if (filterType !== 'all') {
      filtered = filtered.filter(i => {
        if (filterType === 'folder') return i.isFolder
        if (filterType === 'pdf')   return i.mimeType === 'application/pdf'
        if (filterType === 'word')  return i.mimeType?.includes('wordprocessingml') ?? false
        if (filterType === 'excel') return i.mimeType?.includes('spreadsheetml') ?? false
        if (filterType === 'image') return i.mimeType?.startsWith('image/') ?? false
        return true
      })
    }
    return [...filtered].sort((a, b) => {
      // Folders always first
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'date') return (b.lastModified ?? '').localeCompare(a.lastModified ?? '')
      if (sortKey === 'size') return (b.size ?? 0) - (a.size ?? 0)
      return 0
    })
  }

  const displayItems = applyFilters(searchMode ? searchItems : items)

  // ─── No folder assigned ───────────────────────────────────────────────────────

  if (!driveId || !rootFolderId) {
    return (
      <div className="p-8 min-h-screen bg-[#F4F6F8] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-[#2D3F52] mb-1">Sin carpeta asignada</h2>
          <p className="text-sm text-gray-400">
            Un administrador debe asignarte una carpeta de OneDrive desde el panel de usuarios para poder usar esta sección.
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 min-h-screen bg-[#F4F6F8]">

      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Mi carpeta</h1>
          <p className="text-xs text-gray-400 mt-0.5">{userName} · OneDrive</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !currentFolder}
            title={!currentFolder ? 'Esperá a que cargue la carpeta' : 'Subir archivo'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg bg-[#2D3F52] hover:bg-[#354A5E] transition-colors disabled:opacity-50"
          >
            {uploading
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Subiendo…</>
              : <><UploadIcon />Subir archivo</>
            }
          </button>
          <button
            onClick={() => { setMkdirMode(true); setNewFolderName(''); setActionError(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2D3F52] border border-[#2D3F52]/20 rounded-lg hover:bg-white transition-colors"
          >
            <FolderPlusIcon />Nueva carpeta
          </button>
        </div>
      </div>

      {/* ── Errors ── */}
      {uploadError && <Alert msg={uploadError} onClose={() => setUploadError(null)} color="red" />}
      {actionError && <Alert msg={actionError} onClose={() => setActionError(null)} color="red" />}

      {/* ── New folder inline form ── */}
      {mkdirMode && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-white border border-amber-200 rounded-xl shadow-sm">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleMkdir(); if (e.key === 'Escape') setMkdirMode(false) }}
            placeholder="Nombre de la carpeta"
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-300"
          />
          <button onClick={handleMkdir} disabled={!newFolderName.trim()} className="text-xs px-2.5 py-1 bg-[#2D3F52] text-white rounded-lg font-medium disabled:opacity-40">Crear</button>
          <button onClick={() => setMkdirMode(false)} className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 flex-1 min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-gray-300 text-xs">/</span>}
              <button
                onClick={() => loadFolder(crumb.id, crumb)}
                className={`text-xs truncate max-w-[160px] transition-colors ${
                  i === breadcrumbs.length - 1
                    ? 'font-semibold text-[#2D3F52] cursor-default'
                    : 'text-blue-600 hover:underline'
                }`}
              >
                {i === 0 ? <span className="flex items-center gap-1"><HomeIcon />{crumb.name}</span> : crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="pl-7 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#2D3F52]/20 w-40 placeholder-gray-300"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs">✕</button>}
        </div>

        {/* Filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none focus:ring-1 focus:ring-[#2D3F52]/20"
        >
          <option value="all">Todo</option>
          <option value="folder">Carpetas</option>
          <option value="pdf">PDF</option>
          <option value="word">Word</option>
          <option value="excel">Excel</option>
          <option value="image">Imágenes</option>
        </select>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as any)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none focus:ring-1 focus:ring-[#2D3F52]/20"
        >
          <option value="name">Nombre</option>
          <option value="date">Fecha</option>
          <option value="size">Tamaño</option>
        </select>

        {/* View toggle */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setViewMode('list')} className={`px-2 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-[#2D3F52] text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}>
            <ListIcon />
          </button>
          <button onClick={() => setViewMode('grid')} className={`px-2 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-[#2D3F52] text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}>
            <GridIcon />
          </button>
        </div>
      </div>

      {/* ── File browser ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading || searchLoading ? (
          <div className="py-16 text-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-400">Cargando…</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button onClick={() => loadFolder(breadcrumbs[breadcrumbs.length - 1]?.id ?? rootFolderId!, breadcrumbs[breadcrumbs.length - 1] ?? { id: rootFolderId!, name: 'Mi carpeta' })} className="text-xs text-blue-600 hover:underline">
              Reintentar
            </button>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </div>
            <p className="text-sm text-gray-400">{searchMode ? 'Sin resultados' : 'Carpeta vacía'}</p>
          </div>
        ) : viewMode === 'list' ? (
          <ListView
            items={displayItems}
            driveId={driveId}
            renamingId={renamingId}
            renameValue={renameValue}
            deletingId={deletingId}
            onEnter={(item) => loadFolder(item.id, { id: item.id, name: item.name })}
            onPreview={openPreview}
            onStartRename={(item) => { setRenamingId(item.id); setRenameValue(item.name) }}
            onRename={handleRename}
            onCancelRename={() => setRenamingId(null)}
            onRenameChange={setRenameValue}
            onDelete={handleDelete}
          />
        ) : (
          <GridView
            items={displayItems}
            driveId={driveId}
            deletingId={deletingId}
            onEnter={(item) => loadFolder(item.id, { id: item.id, name: item.name })}
            onPreview={openPreview}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* ── Preview Modal ── */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          url={previewUrl}
          loading={previewLoading}
          error={previewError}
          onClose={() => { setPreviewItem(null); setPreviewUrl(null) }}
        />
      )}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  items, driveId, renamingId, renameValue, deletingId,
  onEnter, onPreview, onStartRename, onRename, onCancelRename, onRenameChange, onDelete,
}: {
  items: DriveItem[]
  driveId: string
  renamingId: string | null
  renameValue: string
  deletingId: string | null
  onEnter: (item: DriveItem) => void
  onPreview: (item: DriveItem) => void
  onStartRename: (item: DriveItem) => void
  onRename: (item: DriveItem) => void
  onCancelRename: () => void
  onRenameChange: (v: string) => void
  onDelete: (item: DriveItem) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-100 bg-gray-50/60">
        <tr>
          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nombre</th>
          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Tipo</th>
          <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Tamaño</th>
          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Modificado</th>
          <th className="px-4 py-2.5 w-28" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map(item => {
          const info = item.isFolder ? { icon: '📁', color: 'text-amber-400', label: 'Carpeta' } : getFileInfo(item.mimeType)
          const isDeleting = deletingId === item.id
          return (
            <tr key={item.id} className={`hover:bg-gray-50/60 transition-colors group ${isDeleting ? 'opacity-30' : ''}`}>
              {/* Name */}
              <td className="px-4 py-2.5">
                {renamingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-base">{info.icon}</span>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => onRenameChange(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') onRename(item); if (e.key === 'Escape') onCancelRename() }}
                      onBlur={() => onRename(item)}
                      className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-300"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => item.isFolder ? onEnter(item) : (!PREVIEWABLE.has(item.mimeType ?? '') ? window.open(item.webUrl, '_blank') : onPreview(item))}
                    className="flex items-center gap-2 text-left w-full min-w-0"
                  >
                    <span className="text-base shrink-0">{info.icon}</span>
                    <span className={`text-sm font-medium truncate ${item.isFolder ? 'text-[#2D3F52] hover:text-blue-600' : 'text-gray-800 hover:text-blue-600'} transition-colors`}>
                      {item.name}
                    </span>
                  </button>
                )}
              </td>
              {/* Type */}
              <td className="px-4 py-2.5 hidden sm:table-cell">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 ${info.color}`}>{info.label}</span>
              </td>
              {/* Size */}
              <td className="px-4 py-2.5 text-right text-xs text-gray-400 tabular-nums hidden md:table-cell">
                {item.isFolder ? '—' : fmtSize(item.size)}
              </td>
              {/* Modified */}
              <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell">
                {fmtDate(item.lastModified)}
              </td>
              {/* Actions */}
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!item.isFolder && PREVIEWABLE.has(item.mimeType ?? '') && (
                    <ActionBtn onClick={() => onPreview(item)} title="Vista previa">
                      <EyeIcon />
                    </ActionBtn>
                  )}
                  <ActionBtn onClick={() => window.open(item.webUrl, '_blank')} title="Abrir en OneDrive">
                    <ExternalIcon />
                  </ActionBtn>
                  <ActionBtn onClick={() => onStartRename(item)} title="Renombrar">
                    <PencilIcon />
                  </ActionBtn>
                  <ActionBtn onClick={() => onDelete(item)} title="Eliminar" danger>
                    <TrashIcon />
                  </ActionBtn>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Grid View ────────────────────────────────────────────────────────────────

function GridView({
  items, driveId, deletingId, onEnter, onPreview, onDelete,
}: {
  items: DriveItem[]
  driveId: string
  deletingId: string | null
  onEnter: (item: DriveItem) => void
  onPreview: (item: DriveItem) => void
  onDelete: (item: DriveItem) => void
}) {
  return (
    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {items.map(item => {
        const info = item.isFolder ? { icon: '📁', color: 'text-amber-400', label: 'Carpeta' } : getFileInfo(item.mimeType)
        const isDeleting = deletingId === item.id
        return (
          <div
            key={item.id}
            className={`group relative flex flex-col items-center p-3 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all cursor-pointer ${isDeleting ? 'opacity-30' : ''}`}
            onClick={() => item.isFolder ? onEnter(item) : (!PREVIEWABLE.has(item.mimeType ?? '') ? window.open(item.webUrl, '_blank') : onPreview(item))}
          >
            <span className="text-4xl mb-2 select-none">{info.icon}</span>
            <span className="text-xs text-center text-gray-700 font-medium leading-tight line-clamp-2 w-full">{item.name}</span>
            <span className="text-[10px] text-gray-400 mt-1">{item.isFolder ? '—' : fmtSize(item.size)}</span>
            {/* Hover actions */}
            <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5">
              {!item.isFolder && PREVIEWABLE.has(item.mimeType ?? '') && (
                <button onClick={e => { e.stopPropagation(); onPreview(item) }} className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-gray-400 hover:text-blue-600"><EyeIcon /></button>
              )}
              <button onClick={e => { e.stopPropagation(); onDelete(item) }} className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500"><TrashIcon /></button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ item, url, loading, error, onClose }: {
  item: DriveItem
  url: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const isImage = item.mimeType?.startsWith('image/') ?? false

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 bg-white shadow-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{getFileInfo(item.mimeType).icon}</span>
          <span className="text-sm font-semibold text-[#2D3F52] truncate max-w-[40vw]">{item.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={item.webUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">
            Abrir en Microsoft 365
          </a>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative" onClick={e => e.stopPropagation()}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Cargando vista previa…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center max-w-sm">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <a href={item.webUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">Abrir en OneDrive →</a>
            </div>
          </div>
        )}
        {url && !loading && !error && (
          isImage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={item.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            </div>
          ) : (
            <iframe
              src={url}
              className="w-full h-full border-0"
              allow="fullscreen"
              title={item.name}
            />
          )
        )}
      </div>
    </div>
  )
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Alert({ msg, onClose, color }: { msg: string; onClose: () => void; color: 'red' | 'amber' }) {
  const cls = color === 'red'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-amber-50 border-amber-200 text-amber-700'
  return (
    <div className={`mb-3 flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm ${cls}`}>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}

function ActionBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
        danger
          ? 'text-gray-300 hover:text-red-500 hover:bg-red-50'
          : 'text-gray-300 hover:text-[#2D3F52] hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const UploadIcon   = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
const FolderPlusIcon = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
const HomeIcon     = () => <svg className="w-3 h-3 mr-0.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
const EyeIcon      = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
const ExternalIcon = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
const PencilIcon   = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
const TrashIcon    = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
const ListIcon     = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
const GridIcon     = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>

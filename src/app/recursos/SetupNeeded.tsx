'use client'

import { useState } from 'react'

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS resources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  company text,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  responsible text,
  tags text[] DEFAULT '{}',
  is_featured boolean DEFAULT false,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_is_featured ON resources(is_featured);`

export default function SetupNeeded() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(CREATE_TABLE_SQL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Recursos</h1>
        <p className="mt-1 text-sm text-gray-500">Centro de materiales de trabajo</p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-amber-900">Configuración requerida</h2>
              <p className="mt-1 text-sm text-amber-700">
                La tabla <code className="font-mono bg-amber-100 px-1 rounded">resources</code> no existe aún en la base de datos.
                Ejecuta el siguiente SQL en el editor de Supabase para crearla.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">SQL a ejecutar</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: copied ? '#d1fae5' : '#2D3F52',
                color: copied ? '#065f46' : 'white',
              }}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Copiado
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  Copiar SQL
                </>
              )}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
            {CREATE_TABLE_SQL}
          </pre>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-100">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Pasos:</span> Abre el editor SQL de Supabase &rarr; pega el SQL de arriba &rarr; ejecuta &rarr; recarga esta página.
            También debes crear un bucket de Storage llamado <code className="font-mono bg-blue-100 px-1 rounded">recursos</code> con acceso público.
          </p>
        </div>
      </div>
    </div>
  )
}

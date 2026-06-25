'use client'
import { useState, useEffect } from 'react'
import type { Empresa, TipoCliente, BcFicha } from './types'
import FichaWizard from './FichaWizard'
import FichaEditor from './FichaEditor'

interface Props {
  fichaId: string | null
}

export default function FichaModule({ fichaId }: Props) {
  const [state, setState] = useState<'wizard' | 'editor'>('wizard')
  const [empresa, setEmpresa] = useState<Empresa>('roble')
  const [tipo, setTipo] = useState<TipoCliente>('pf')
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [loadedFichaId, setLoadedFichaId] = useState<string | null>(fichaId)
  const [initialData, setInitialData] = useState<Partial<BcFicha> | null>(null)
  const [loading, setLoading] = useState(!!fichaId)

  useEffect(() => {
    if (!fichaId) return
    fetch(`/api/bc-ficha/${fichaId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setEmpresa(data.empresa)
          setTipo(data.tipo_cliente)
          setClientId(data.client_id)
          setClientName(data.client_name ?? '')
          setInitialData(data)
          setState('editor')
        }
      })
      .finally(() => setLoading(false))
  }, [fichaId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'wizard') {
    return (
      <FichaWizard
        onConfirm={(emp, t, client, name) => {
          setEmpresa(emp)
          setTipo(t)
          setClientId(client?.id ?? null)
          setClientName(name)
          setLoadedFichaId(null)
          setInitialData(null)
          setState('editor')
        }}
      />
    )
  }

  return (
    <FichaEditor
      empresa={empresa}
      tipo={tipo}
      clientId={clientId}
      clientName={clientName}
      fichaId={loadedFichaId}
      initialData={initialData}
      onBack={() => {
        setState('wizard')
        setLoadedFichaId(null)
        setInitialData(null)
        window.history.replaceState({}, '', '/banco-central/ficha')
      }}
    />
  )
}

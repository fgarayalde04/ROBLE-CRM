'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Event, EventType } from '@/types/platform'
import { supabase } from '@/lib/supabase/client'

interface ClientOption { id: string; first_name: string; last_name: string; client_number: string }
interface Props { initial?: Partial<Event>; mode: 'new' | 'edit' }

const typeLabel: Record<EventType, string> = {
  reunion:     'Reunión',
  llamada:     'Llamada',
  seguimiento: 'Seguimiento',
  vencimiento: 'Vencimiento',
  interno:     'Interno',
  otro:        'Otro',
}

function GoogleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function EventForm({ initial, mode }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [meetUrl, setMeetUrl] = useState<string | null>(null)

  const [form, setForm] = useState({
    title:            initial?.title ?? '',
    description:      initial?.description ?? '',
    event_date:       initial?.event_date ?? '',
    start_time:       initial?.start_time ?? '',
    end_time:         initial?.end_time ?? '',
    type:             (initial?.type ?? 'reunion') as EventType,
    client_id:        initial?.client_id ?? '',
    participants:     (initial?.participants ?? []).join(', '),
    reminder_minutes: initial?.reminder_minutes?.toString() ?? '',
    add_meet:         false,
  })

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, first_name, last_name, client_number')
      .order('last_name')
      .then(({ data }) => setClients(data ?? []))
  }, [])

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    setMeetUrl(null)

    try {
      const participants = form.participants
        ? form.participants.split(',').map((p) => p.trim()).filter(Boolean)
        : []

      if (mode === 'new') {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:            form.title.trim(),
            description:      form.description.trim() || null,
            event_date:       form.event_date,
            start_time:       form.start_time || null,
            end_time:         form.end_time   || null,
            type:             form.type,
            client_id:        form.client_id  || null,
            participants,
            reminder_minutes: form.reminder_minutes ? parseInt(form.reminder_minutes) : null,
            add_meet:         form.add_meet,
          }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error inesperado')

        if (data.meet_url) {
          setMeetUrl(data.meet_url)
          setSuccessMsg('Evento creado con enlace de Google Meet.')
        } else if (data.google_error) {
          // Local succeeded but Google Calendar failed
          setSuccessMsg(`Evento guardado en CRM. Google Calendar: ${data.google_error}`)
          setTimeout(() => { router.push('/events'); router.refresh() }, 3000)
        } else {
          router.push('/events')
          router.refresh()
        }
      } else {
        // Edit: update local only
        const { error: err } = await supabase.from('events').update({
          title:            form.title.trim(),
          description:      form.description.trim() || null,
          event_date:       form.event_date,
          start_time:       form.start_time || null,
          end_time:         form.end_time   || null,
          type:             form.type,
          client_id:        form.client_id  || null,
          participants,
          reminder_minutes: form.reminder_minutes ? parseInt(form.reminder_minutes) : null,
        }).eq('id', initial!.id!)
        if (err) throw err
        router.push('/events')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message ?? 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {successMsg}
        </div>
      )}
      {meetUrl && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-800 mb-2">¡Evento creado con Google Meet!</p>
          <a
            href={meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline font-mono break-all"
          >
            {meetUrl}
          </a>
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(meetUrl)}
              className="text-xs px-3 py-1 border border-blue-300 rounded text-blue-700 hover:bg-blue-100"
            >
              Copiar enlace
            </button>
            <button
              type="button"
              onClick={() => { router.push('/events'); router.refresh() }}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Ver agenda
            </button>
          </div>
        </div>
      )}

      <section className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-4">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Evento</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Título *" span={2}>
            <input required value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tipo">
            <select value={form.type} onChange={(e) => set('type', e.target.value as EventType)} className={selectClass}>
              {Object.entries(typeLabel).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </Field>
          <Field label="Cliente">
            <select value={form.client_id} onChange={(e) => set('client_id', e.target.value)} className={selectClass}>
              <option value="">— Sin cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} ({c.client_number})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descripción" span={2}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-4">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Fecha y hora</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Fecha *">
            <input required type="date" value={form.event_date} onChange={(e) => set('event_date', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hora inicio">
            <input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hora fin">
            <input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-4">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Participantes y opciones</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Participantes (emails, separados por coma)" span={2}>
            <input
              value={form.participants}
              onChange={(e) => set('participants', e.target.value)}
              placeholder="juan@empresa.com, maria@empresa.com"
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Los emails válidos recibirán invitación de Google Calendar.
            </p>
          </Field>
          <Field label="Recordatorio">
            <select value={form.reminder_minutes} onChange={(e) => set('reminder_minutes', e.target.value)} className={selectClass}>
              <option value="">Sin recordatorio</option>
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="1440">1 día</option>
            </select>
          </Field>
          {mode === 'new' && (
            <Field label="Google Meet">
              <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                <input
                  type="checkbox"
                  checked={form.add_meet}
                  onChange={(e) => set('add_meet', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Generar enlace de Google Meet</span>
              </label>
            </Field>
          )}
        </div>
      </section>

      {mode === 'new' && (
        <div className="flex items-center gap-2 px-1">
          <GoogleIcon />
          <p className="text-xs text-gray-400">
            Si tu Google Calendar está conectado, el evento también se creará en Workspace.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-white text-sm rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#2D3F52' }}
        >
          {loading ? 'Guardando...' : mode === 'new' ? 'Crear evento' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={() => router.back()} className="px-5 py-2 border border-[#E2E8F0] text-gray-600 text-sm rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full text-sm border border-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white text-gray-900 placeholder:text-gray-300'
const selectClass = 'w-full text-sm border border-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white text-gray-900'

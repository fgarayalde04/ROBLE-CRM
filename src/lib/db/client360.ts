import { pool } from './pool'

// Vista 360 del cliente: junta en un solo lugar lo que está repartido en
// Órdenes, Propuestas, Calendario, Aperturas, Suitability, Portfolio y el log
// de actividad. Cada fuente se consulta por separado y si una falla (tabla que
// no existe en un ambiente, columna vieja) esa parte queda vacía en vez de
// romper la ficha.

export type TimelineKind =
  | 'orden' | 'respuesta' | 'propuesta' | 'reunion' | 'tarea'
  | 'documento' | 'apertura' | 'suitability' | 'actividad'

export interface TimelineItem {
  id: string
  kind: TimelineKind
  date: string
  title: string
  detail: string | null
  status: string | null
  href: string | null
}

export interface ClientAccount {
  account_number: string
  account_name: string | null
  custodian: string | null
  entity: string | null
  snapshot_date: string | null
  total_market_value: number | null
  base_currency: string | null
}

export interface Client360 {
  accounts: ClientAccount[]
  totalMarketValue: number | null
  lastSnapshotDate: string | null
  ordersInProgress: number
  openProposals: number
  nextMeeting: { title: string; date: string; start_time: string | null } | null
  timeline: TimelineItem[]
}

async function safe<T>(q: Promise<{ rows: T[] }>): Promise<T[]> {
  try {
    return (await q).rows
  } catch (e) {
    console.error('[client360]', e instanceof Error ? e.message : e)
    return []
  }
}

const ORDEN_ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: 'Pendiente revisión', en_revision: 'En revisión', devuelta: 'Devuelta',
  mesa_operaciones: 'Trading Desk', mail_enviado: 'Mail enviado', aprobada_cliente: 'Aprobada por cliente',
  rechazada_cliente: 'Rechazada por cliente', en_ejecucion: 'En ejecución', ejecutada: 'Ejecutada',
  cancelada: 'Cancelada',
}
const ORDEN_CERRADA = ['ejecutada', 'cancelada', 'rechazada_cliente']
const OP_LABEL: Record<string, string> = { compra: 'Compra', venta: 'Venta', suscripcion: 'Compra', rescate: 'Venta' }

const PROPUESTA_LABEL: Record<string, string> = {
  draft: 'Borrador', review: 'En revisión', sent: 'Enviada', accepted: 'Aceptada', archived: 'Archivada',
}
const PROPUESTA_ABIERTA = ['draft', 'review', 'sent']

const APERTURA_LABEL: Record<string, string> = {
  carpeta_creada: 'Pendiente de apertura', recolectando_informacion: 'Recolectando info',
  documentacion_incompleta: 'Doc. incompleta', documentacion_completa: 'Doc. completa',
  formularios_enviados: 'Form. enviados', enviado_al_banco: 'Enviado al banco',
  en_revision_banco: 'En revisión banco', cuenta_abierta: 'Cuenta abierta', trabado: 'Trabado',
  descartado: 'Descartado',
}

const DOC_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', completo: 'Completo', vencido: 'Vencido', revisar: 'Revisar',
  enviado: 'Enviado', firmado: 'Firmado',
}
const TASK_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', bloqueado: 'Bloqueado', completado: 'Completada',
}

const ACTIVIDAD_OMITIR = ['actualizar']

function money(n: unknown, cur?: string | null) {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return null
  return `${cur || 'USD'} ${v.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
}

export async function getClient360(client: { id: string; client_number: string | null }): Promise<Client360> {
  const id = client.id
  const num = client.client_number?.toString().trim() || null
  const today = new Date().toISOString().slice(0, 10)

  const [accounts, solicitudes, legacy, replies, proposals, events, tasks, documents, openings, reviews, activity] =
    await Promise.all([
      num
        ? safe<ClientAccount>(pool.query(
            `select a.account_number, a.account_name, coalesce(i.custodian, a.custodian) as custodian, a.entity,
                    i.snapshot_date, i.total_market_value, i.base_currency
               from monitoring_base_accounts a
               left join lateral (
                 select snapshot_date, total_market_value, base_currency, custodian
                   from portfolio_imports p
                  where p.account_number = a.account_number
                  order by snapshot_date desc limit 1
               ) i on true
              where trim(a.client_code::text) = $1 and coalesce(a.is_active, true)
              order by i.total_market_value desc nulls last, a.account_number`,
            [num]))
        : Promise.resolve([] as ClientAccount[]),
      safe<any>(pool.query(
        `select id, solicitud_id, estado, tipo_operacion, instrumento_nombre, monto, cantidad, moneda,
                asesor, aprobacion_cliente, aprobacion_comentario, aprobacion_at, created_at, ejecutado_at
           from solicitudes
          where client_id = $1 ${num ? `or trim(client_number::text) = $2` : ''}
          order by created_at desc limit 100`,
        num ? [id, num] : [id])),
      num
        ? safe<any>(pool.query(
            `select id, orden_id, subject, status, order_count, created_at, user_name
               from order_history where trim(client_number::text) = $1
              order by created_at desc limit 50`,
            [num]))
        : Promise.resolve([]),
      safe<any>(pool.query(
        `select e.id, e.from_email, e.received_at, e.subject, e.snippet, s.id as solicitud_uuid, s.solicitud_id
           from email_replies e
           join solicitudes s on s.id = e.solicitud_id
          where s.client_id = $1 ${num ? `or trim(s.client_number::text) = $2` : ''}
          order by e.received_at desc limit 50`,
        num ? [id, num] : [id])),
      safe<any>(pool.query(
        `select id, title, status, total_amount, currency, advisor_name, created_at, sent_at
           from investment_proposals where client_id = $1
          order by created_at desc limit 50`,
        [id])),
      safe<any>(pool.query(
        `select id, title, description, event_date, start_time, type
           from events where client_id = $1
          order by event_date desc, start_time desc nulls last limit 100`,
        [id])),
      safe<any>(pool.query(
        `select id, title, status, priority, due_date, created_at, updated_at
           from tasks where client_id = $1
          order by created_at desc limit 100`,
        [id])),
      safe<any>(pool.query(
        `select id, name, category, status, onedrive_url, created_at
           from documents where client_id = $1
          order by created_at desc limit 100`,
        [id])),
      safe<any>(pool.query(
        `select id, folder_name, status, start_date, opened_date, advisor, created_at
           from account_openings where client_id = $1
          order by created_at desc`,
        [id])),
      safe<any>(pool.query(
        `select id, portfolio_profile, client_profile, portfolio_score, file_name, created_at
           from portfolio_reviews where client_id = $1
          order by created_at desc limit 30`,
        [id])),
      safe<any>(pool.query(
        `select id, action, description, user_name, created_at
           from activity_log
          where entity_type = 'client' and entity_id::text = $1 and not (action = any($2::text[]))
          order by created_at desc limit 100`,
        [id, ACTIVIDAD_OMITIR])),
    ])

  const timeline: TimelineItem[] = []

  for (const s of solicitudes) {
    const op = OP_LABEL[s.tipo_operacion] ?? s.tipo_operacion ?? 'Orden'
    const importe = money(s.monto, s.moneda) ?? (s.cantidad ? `${Number(s.cantidad).toLocaleString('es-UY')} u.` : null)
    timeline.push({
      id: `sol-${s.id}`, kind: 'orden', date: s.created_at,
      title: `${op}${s.instrumento_nombre ? ` · ${s.instrumento_nombre}` : ''}`,
      detail: [s.solicitud_id, importe, s.asesor].filter(Boolean).join(' · ') || null,
      status: ORDEN_ESTADO_LABEL[s.estado] ?? s.estado,
      href: `/solicitudes?open=${s.id}`,
    })
    if (s.aprobacion_at && s.aprobacion_cliente) {
      const aprobo = s.aprobacion_cliente === 'aprobada'
      timeline.push({
        id: `apr-${s.id}`, kind: 'respuesta', date: s.aprobacion_at,
        title: aprobo ? 'Cliente aprobó la orden' : 'Cliente no aprobó la orden',
        detail: [s.solicitud_id, s.aprobacion_comentario ? `"${s.aprobacion_comentario}"` : null].filter(Boolean).join(' · '),
        status: null,
        href: `/solicitudes?open=${s.id}`,
      })
    }
  }

  for (const o of legacy) {
    timeline.push({
      id: `oh-${o.id}`, kind: 'orden', date: o.created_at,
      title: o.subject || `Orden${o.order_count ? ` (${o.order_count} instrumentos)` : ''}`,
      detail: [o.orden_id, o.user_name].filter(Boolean).join(' · ') || null,
      status: o.status ?? null,
      href: null,
    })
  }

  for (const r of replies) {
    timeline.push({
      id: `rep-${r.id}`, kind: 'respuesta', date: r.received_at,
      title: `Respuesta por mail${r.from_email ? ` de ${r.from_email}` : ''}`,
      detail: [r.solicitud_id, r.snippet].filter(Boolean).join(' · ') || null,
      status: null,
      href: r.solicitud_uuid ? `/solicitudes?open=${r.solicitud_uuid}` : null,
    })
  }

  for (const p of proposals) {
    timeline.push({
      id: `prop-${p.id}`, kind: 'propuesta', date: p.sent_at ?? p.created_at,
      title: p.title || 'Propuesta de inversión',
      detail: [money(p.total_amount, p.currency), p.advisor_name].filter(Boolean).join(' · ') || null,
      status: PROPUESTA_LABEL[p.status] ?? p.status,
      href: `/propuestas/${p.id}`,
    })
  }

  for (const e of events) {
    timeline.push({
      id: `ev-${e.id}`, kind: 'reunion', date: eventIso(e.event_date, e.start_time),
      title: e.title,
      detail: e.description || null,
      status: dateOnly(e.event_date) >= today ? 'Próxima' : null,
      href: `/events`,
    })
  }

  for (const t of tasks) {
    const done = t.status === 'completado'
    timeline.push({
      id: `task-${t.id}`, kind: 'tarea', date: done ? (t.updated_at ?? t.created_at) : t.created_at,
      title: t.title,
      detail: t.due_date ? `Vence ${fmtDay(t.due_date)}` : null,
      status: TASK_STATUS_LABEL[t.status] ?? t.status,
      href: `/tasks?clientId=${id}`,
    })
  }

  for (const d of documents) {
    timeline.push({
      id: `doc-${d.id}`, kind: 'documento', date: d.created_at,
      title: d.name,
      detail: null,
      status: DOC_STATUS_LABEL[d.status] ?? d.status,
      href: d.onedrive_url ?? null,
    })
  }

  for (const o of openings) {
    timeline.push({
      id: `open-${o.id}`, kind: 'apertura', date: o.opened_date ? eventIso(o.opened_date, '12:00') : o.start_date ? eventIso(o.start_date, '12:00') : o.created_at,
      title: o.opened_date ? 'Cuenta abierta' : 'Apertura de cuenta',
      detail: [o.folder_name, o.advisor].filter(Boolean).join(' · ') || null,
      status: APERTURA_LABEL[o.status] ?? o.status,
      href: `/openings/${o.id}`,
    })
  }

  for (const r of reviews) {
    timeline.push({
      id: `rev-${r.id}`, kind: 'suitability', date: r.created_at,
      title: 'Revisión de suitability',
      detail: [
        r.portfolio_profile ? `Cartera: ${r.portfolio_profile}` : null,
        r.client_profile ? `Perfil: ${r.client_profile}` : null,
      ].filter(Boolean).join(' · ') || r.file_name || null,
      status: null,
      href: `/suitability/${r.id}`,
    })
  }

  for (const a of activity) {
    timeline.push({
      id: `act-${a.id}`, kind: 'actividad', date: a.created_at,
      title: a.description,
      detail: a.user_name || null,
      status: null,
      href: null,
    })
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const valued = accounts.filter((a) => a.total_market_value != null)
  const totalMarketValue = valued.length ? valued.reduce((s, a) => s + Number(a.total_market_value), 0) : null
  const lastSnapshotDate = valued.reduce<string | null>((max, a) => {
    const d = a.snapshot_date ? dateOnly(a.snapshot_date) : null
    return d && (!max || d > max) ? d : max
  }, null)

  const upcoming = events
    .filter((e) => dateOnly(e.event_date) >= today)
    .sort((a, b) => eventIso(a.event_date, a.start_time).localeCompare(eventIso(b.event_date, b.start_time)))[0]

  return {
    accounts,
    totalMarketValue,
    lastSnapshotDate,
    ordersInProgress: solicitudes.filter((s) => !ORDEN_CERRADA.includes(s.estado)).length,
    openProposals: proposals.filter((p) => PROPUESTA_ABIERTA.includes(p.status)).length,
    nextMeeting: upcoming ? { title: upcoming.title, date: dateOnly(upcoming.event_date), start_time: upcoming.start_time } : null,
    timeline,
  }
}

// event_date puede venir como Date (columna date) o string.
function dateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v ?? '').slice(0, 10)
}

function eventIso(date: unknown, time: string | null): string {
  return `${dateOnly(date)}T${(time || '00:00').slice(0, 5)}:00-03:00`
}

function fmtDay(v: unknown): string {
  const [y, m, d] = dateOnly(v).split('-')
  return d && m && y ? `${d}/${m}/${y}` : String(v)
}

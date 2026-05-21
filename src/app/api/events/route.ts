import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getValidGoogleToken } from '@/lib/google/tokens'
import { getCalendarEvents, createCalendarEvent, deleteCalendarEvent } from '@/lib/google/calendar'

export const dynamic = 'force-dynamic'

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — fetch Google Calendar events
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') // YYYY-MM-DD
  const to   = searchParams.get('to')   // YYYY-MM-DD

  const accessToken = await getValidGoogleToken()
  if (!accessToken) {
    return NextResponse.json({ source: 'none', events: [] })
  }

  try {
    const events = from && to
      ? await getCalendarEvents(accessToken, from, to)
      : await getCalendarEvents(accessToken, 1, 14)
    return NextResponse.json({ source: 'google', events })
  } catch (err: any) {
    console.error('[api/events GET]', err.message)
    const status = err.message?.includes('403') ? 403 : 500
    return NextResponse.json({
      source: 'error',
      events: [],
      consent_required: status === 403,
      error: err.message,
    })
  }
}

// POST /api/events — create in local DB + Google Calendar (if connected)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    event_date,
    start_time,
    end_time,
    type,
    client_id,
    participants,
    reminder_minutes,
    add_meet,
  } = body

  if (!title || !event_date) {
    return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
  }

  // ── 1. Create in local Supabase ────────────────────────────────────────────
  const { data: localEvent, error: localError } = await supabaseAdmin
    .from('events')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      event_date,
      start_time: start_time || null,
      end_time:   end_time   || null,
      type:       type       || 'reunion',
      client_id:  client_id  || null,
      participants: participants ?? [],
      reminder_minutes: reminder_minutes || null,
      created_by: session.name,
    })
    .select()
    .single()

  if (localError) {
    return NextResponse.json({ error: localError.message }, { status: 400 })
  }

  const result: {
    local: typeof localEvent
    google?: any
    google_error?: string
    meet_url?: string
  } = { local: localEvent }

  // ── 2. Try Google Calendar (fire-and-forget style) ─────────────────────────
  const accessToken = await getValidGoogleToken()
  if (accessToken) {
    try {
      // Extract email addresses from participants list
      const attendeeEmails = (participants ?? []).filter((p: string) => p.includes('@'))

      const gcalEvent = await createCalendarEvent(accessToken, {
        title: title.trim(),
        description: description?.trim(),
        date:      event_date,
        startTime: start_time,
        endTime:   end_time,
        attendeeEmails,
        addMeet:   add_meet ?? false,
      })

      result.google = gcalEvent

      // Extract Meet link if generated
      const meetEntry = gcalEvent.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === 'video'
      )
      if (meetEntry) result.meet_url = meetEntry.uri
      else if (gcalEvent.hangoutLink) result.meet_url = gcalEvent.hangoutLink

    } catch (err: any) {
      console.error('[api/events POST] Google Calendar create failed:', err.message)
      result.google_error = err.message
    }
  }

  return NextResponse.json(result)
}

// DELETE /api/events?google_id=...&id=... — delete from Google + local
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const googleId = searchParams.get('google_id')
  const localId  = searchParams.get('id')

  const accessToken = await getValidGoogleToken()

  await Promise.allSettled([
    googleId && accessToken
      ? deleteCalendarEvent(accessToken, googleId)
      : Promise.resolve(),
    localId
      ? supabaseAdmin.from('events').delete().eq('id', localId)
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true })
}

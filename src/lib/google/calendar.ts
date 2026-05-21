// Google Calendar API helpers (v3)

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
    self?: boolean
    organizer?: boolean
  }>
  hangoutLink?: string               // legacy Google Meet link
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string         // 'video' | 'phone' | ...
      uri: string
      label?: string
    }>
    conferenceSolution?: { name: string }
  }
  htmlLink?: string                  // link to event in Google Calendar
  status?: 'confirmed' | 'tentative' | 'cancelled'
  organizer?: { email: string; displayName?: string; self?: boolean }
}

export interface CreateCalendarEventInput {
  title: string
  description?: string
  location?: string
  date: string        // YYYY-MM-DD
  startTime?: string  // HH:mm  (default 09:00)
  endTime?: string    // HH:mm  (default 10:00)
  attendeeEmails?: string[]
  addMeet?: boolean
}

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

/**
 * List calendar events using /calendarView equivalent.
 * Accepts either explicit ISO date strings (timeMin/timeMax) or
 * legacy daysBack/daysAhead offsets from now.
 */
export async function getCalendarEvents(
  accessToken: string,
  timeMinOrDaysBack: string | number = 1,
  timeMaxOrDaysAhead: string | number = 14
): Promise<GoogleCalendarEvent[]> {
  let timeMin: string
  let timeMax: string

  if (typeof timeMinOrDaysBack === 'string') {
    // Explicit date strings passed (YYYY-MM-DD or ISO)
    timeMin = timeMinOrDaysBack.length === 10
      ? `${timeMinOrDaysBack}T00:00:00.000Z`
      : timeMinOrDaysBack
    timeMax = (timeMaxOrDaysAhead as string).length === 10
      ? `${timeMaxOrDaysAhead}T23:59:59.999Z`
      : (timeMaxOrDaysAhead as string)
  } else {
    const now = new Date()
    timeMin = new Date(now.getTime() - (timeMinOrDaysBack as number) * 86_400_000).toISOString()
    timeMax = new Date(now.getTime() + (timeMaxOrDaysAhead as number) * 86_400_000).toISOString()
  }

  const url = new URL(`${CAL_BASE}/calendars/primary/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '100')
  url.searchParams.set(
    'fields',
    'items(id,summary,description,location,start,end,attendees,hangoutLink,conferenceData,htmlLink,status,organizer)'
  )

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[google/calendar] List events error:', res.status, err)
    throw new Error(`Google Calendar error: ${res.status}`)
  }

  const data = await res.json()
  return ((data.items ?? []) as GoogleCalendarEvent[]).filter(
    (e) => e.status !== 'cancelled'
  )
}

/** Create a calendar event, optionally with Google Meet */
export async function createCalendarEvent(
  accessToken: string,
  input: CreateCalendarEventInput
): Promise<GoogleCalendarEvent> {
  const TZ = 'America/Montevideo'
  const startDt = input.startTime
    ? `${input.date}T${input.startTime}:00`
    : `${input.date}T09:00:00`
  const endDt = input.endTime
    ? `${input.date}T${input.endTime}:00`
    : `${input.date}T10:00:00`

  const body: Record<string, unknown> = {
    summary: input.title,
    start: { dateTime: startDt, timeZone: TZ },
    end:   { dateTime: endDt,   timeZone: TZ },
  }

  if (input.description) body.description = input.description
  if (input.location)    body.location    = input.location

  if (input.attendeeEmails?.length) {
    body.attendees = input.attendeeEmails.map((email) => ({ email }))
  }

  // Add Google Meet
  if (input.addMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `crm-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const url = new URL(`${CAL_BASE}/calendars/primary/events`)
  if (input.addMeet) url.searchParams.set('conferenceDataVersion', '1')
  url.searchParams.set('sendNotifications', 'true')   // send invite emails to attendees

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Create calendar event failed: ${err}`)
  }

  return res.json()
}

/** Delete a calendar event */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Delete calendar event failed: ${res.status}`)
  }
}

/** Extract date string (YYYY-MM-DD) from a Google Calendar event start */
export function gcalEventDate(ev: GoogleCalendarEvent): string {
  return (ev.start.dateTime ?? ev.start.date ?? '').slice(0, 10)
}

/** Extract time string (HH:mm) from a Google Calendar event start, or '' for all-day */
export function gcalEventTime(ev: GoogleCalendarEvent): string {
  const dt = ev.start.dateTime
  if (!dt) return ''
  // dt is ISO8601, e.g. "2025-05-21T14:30:00-03:00"
  const local = new Date(dt)
  return local.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function gcalEventEndTime(ev: GoogleCalendarEvent): string {
  const dt = ev.end.dateTime
  if (!dt) return ''
  const local = new Date(dt)
  return local.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Extract the Google Meet join URL from an event (prefers conferenceData, falls back to hangoutLink) */
export function gcalMeetUrl(ev: GoogleCalendarEvent): string | null {
  const videoEntry = ev.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  )
  return videoEntry?.uri ?? ev.hangoutLink ?? null
}

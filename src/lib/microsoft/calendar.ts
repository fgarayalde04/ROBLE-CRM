export interface MsCalendarEvent {
  id: string
  subject: string
  bodyPreview?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  location?: { displayName?: string }
  attendees?: Array<{
    emailAddress: { name: string; address: string }
    status: { response: string }
  }>
  onlineMeeting?: { joinUrl: string }
  webLink?: string
  isOnlineMeeting?: boolean
  categories?: string[]
}

export interface CreateEventInput {
  title: string
  description?: string
  date: string       // YYYY-MM-DD
  startTime?: string // HH:mm
  endTime?: string   // HH:mm
  participants?: string[] // email addresses or names
  isOnlineMeeting?: boolean
}

/**
 * Fetch calendar events using /me/calendarView (respects recurring events).
 * daysBack: how many days before today to include (default 1 for "today")
 * daysAhead: how many days ahead to fetch (default 14)
 */
export async function getCalendarEvents(
  accessToken: string,
  daysBack = 1,
  daysAhead = 14
): Promise<MsCalendarEvent[]> {
  const now = new Date()
  const start = new Date(now.getTime() - daysBack * 86_400_000)
  const end = new Date(now.getTime() + daysAhead * 86_400_000)

  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView')
  url.searchParams.set('startDateTime', start.toISOString())
  url.searchParams.set('endDateTime', end.toISOString())
  url.searchParams.set(
    '$select',
    'id,subject,bodyPreview,start,end,location,attendees,onlineMeeting,webLink,isOnlineMeeting,categories'
  )
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '100')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="America/Montevideo"',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[calendar] getCalendarEvents failed:', res.status, err)
    throw new Error(`Graph calendar error: ${res.status}`)
  }

  const data = await res.json()
  return (data.value ?? []) as MsCalendarEvent[]
}

/** Create an event on the user's default calendar */
export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput
): Promise<MsCalendarEvent> {
  const startDt = input.startTime
    ? `${input.date}T${input.startTime}:00`
    : `${input.date}T09:00:00`
  const endDt = input.endTime
    ? `${input.date}T${input.endTime}:00`
    : `${input.date}T10:00:00`

  const body: Record<string, unknown> = {
    subject: input.title,
    start: { dateTime: startDt, timeZone: 'America/Montevideo' },
    end: { dateTime: endDt, timeZone: 'America/Montevideo' },
  }

  if (input.description) {
    body.body = { contentType: 'text', content: input.description }
  }

  if (input.participants?.length) {
    // Only include valid email addresses as attendees
    const emails = input.participants.filter((p) => p.includes('@'))
    if (emails.length) {
      body.attendees = emails.map((address) => ({
        emailAddress: { address },
        type: 'required',
      }))
    }
  }

  if (input.isOnlineMeeting) {
    body.isOnlineMeeting = true
    body.onlineMeetingProvider = 'teamsForBusiness'
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
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

/** Delete an event from the user's calendar */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete calendar event failed: ${res.status}`)
  }
}

/** Parse a Microsoft Graph dateTime string to a local YYYY-MM-DD and HH:mm */
export function parseMsDateTime(dt: string): { date: string; time: string } {
  // dt is like "2025-05-21T14:30:00.0000000" already in Uruguay time due to Prefer header
  const [datePart, timePart] = dt.split('T')
  return {
    date: datePart,
    time: timePart?.slice(0, 5) ?? '',
  }
}

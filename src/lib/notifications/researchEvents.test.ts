// Regresión: notifyMorningBriefPublished() hacía Promise.all(recipients.map(...))
// con createNotification() FUERA de cualquier try/catch por destinatario — si
// a uno solo le fallaba el insert, todo el Promise.all rechazaba, la función
// entera tiraba, y como el webhook que la llama devolvía 500, el caller
// reintentaba — pero el Morning Brief ya estaba creado (un solo post por día,
// unique violation), así que el reintento nunca volvía a notificar a NADIE,
// ni siquiera a los que sí habían funcionado la primera vez. El fix envuelve
// cada destinatario en su propio try/catch. Este test fija ese contrato: un
// destinatario que falla no debe impedir que los demás sean notificados, ni
// que la función misma rechace.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/notifications', () => ({ createNotification: vi.fn(), markAllUnreadByType: vi.fn() }))
vi.mock('@/lib/db/users', () => ({ getUsersByRoles: vi.fn() }))
vi.mock('@/lib/push/server', () => ({ sendPushNotification: vi.fn() }))

import { createNotification, markAllUnreadByType } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'
import { sendPushNotification } from '@/lib/push/server'
import { notifyMorningBriefPublished } from './researchEvents'

const mockCreateNotification = vi.mocked(createNotification)
const mockMarkAllUnreadByType = vi.mocked(markAllUnreadByType)
const mockGetUsersByRoles = vi.mocked(getUsersByRoles)
const mockSendPushNotification = vi.mocked(sendPushNotification)

const RECIPIENTS = [
  { id: 'u1', name: 'Falla' },
  { id: 'u2', name: 'OK' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockMarkAllUnreadByType.mockResolvedValue(undefined as any)
  mockGetUsersByRoles.mockResolvedValue(RECIPIENTS as any)
  mockSendPushNotification.mockResolvedValue({ sent: 1 } as any)
})

describe('notifyMorningBriefPublished', () => {
  it('no rechaza si un destinatario falla, y sigue notificando a los demás', async () => {
    mockCreateNotification.mockImplementation(async ({ userId }: any) => {
      if (userId === 'u1') throw new Error('insert falló para u1')
      return { id: 'notif-u2' } as any
    })

    await expect(notifyMorningBriefPublished('post-1', '2026-09-09')).resolves.toBeUndefined()

    // El que falló: no se le manda push (nunca se creó la notificación).
    expect(mockSendPushNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' })
    )
    // El que funcionó: sí recibe su push, pese a que el otro falló.
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2' })
    )
  })

  it('no manda push si createNotification indica duplicado (created === null)', async () => {
    mockCreateNotification.mockResolvedValue(null as any)

    await notifyMorningBriefPublished('post-1', '2026-09-09')

    expect(mockSendPushNotification).not.toHaveBeenCalled()
  })
})

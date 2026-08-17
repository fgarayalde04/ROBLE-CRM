import webpush from 'web-push'
import {
  listEnabledSubscriptionsForUser, markSubscriptionUsed, deactivateSubscriptionById,
} from '@/lib/db/pushSubscriptions'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Web Push no está configurado (faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface SendPushInput {
  userId: string
  title: string
  body: string
  url?: string
  type?: string
  entityId?: string
}

export interface SendPushResult {
  sent: number
  failed: number
  deactivated: number
}

// Centralized Web Push sender — every future module (órdenes, tareas, BCU, etc.)
// should call this instead of talking to `web-push` directly.
export async function sendPushNotification(input: SendPushInput): Promise<SendPushResult> {
  ensureConfigured()

  const subs = await listEnabledSubscriptionsForUser(input.userId)
  const result: SendPushResult = { sent: 0, failed: 0, deactivated: 0 }
  if (subs.length === 0) return result

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    type: input.type ?? null,
    entityId: input.entityId ?? null,
  })

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      result.sent++
      await markSubscriptionUsed(sub.id)
    } catch (err: any) {
      result.failed++
      const statusCode = err?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Subscription no longer exists on the push service — stop retrying it.
        await deactivateSubscriptionById(sub.id)
        result.deactivated++
      } else {
        console.error('[push] send failed', { subscriptionId: sub.id, statusCode, message: err?.message })
      }
    }
  }))

  return result
}

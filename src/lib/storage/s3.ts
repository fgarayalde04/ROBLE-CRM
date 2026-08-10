import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Generic S3-compatible storage layer. Works with any S3-compatible provider
 * (MinIO on Railway, AWS S3, Cloudflare R2, Backblaze B2, ...) via env vars:
 *
 *   S3_ENDPOINT           — e.g. https://bucket-production-xxxx.up.railway.app (MinIO) or omit for AWS
 *   S3_REGION              — e.g. us-east-1 (required by the SDK even for MinIO; any value works)
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_BUCKET              — single bucket; objects are namespaced by prefix (recursos/..., personal-files/...)
 *   S3_PUBLIC_URL_BASE     — optional. If set, public objects are served from `${S3_PUBLIC_URL_BASE}/${key}`
 *                            (e.g. behind a CDN or a public MinIO console URL). If unset, falls back to a
 *                            long-lived signed URL.
 *   S3_FORCE_PATH_STYLE    — 'true' for MinIO/most self-hosted S3 (default: true)
 */

let cached: S3Client | null = null

function getClient(): S3Client {
  if (cached) return cached
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION || 'us-east-1'
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY not configured — storage not set up yet')
  }
  cached = new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId, secretAccessKey },
  })
  return cached
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET
  if (!bucket) throw new Error('S3_BUCKET not configured — storage not set up yet')
  return bucket
}

export async function ensureBucketExists() {
  const client = getClient()
  const Bucket = getBucket()
  try {
    await client.send(new HeadBucketCommand({ Bucket }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket }))
  }
}

export async function uploadObject(key: string, body: Buffer, contentType: string) {
  const client = getClient()
  await client.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function deleteObject(key: string) {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }))
}

/** Public-style URL for objects meant to be publicly readable (e.g. recursos/). */
export function getPublicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_URL_BASE
  if (base) return `${base.replace(/\/$/, '')}/${key}`
  const endpoint = process.env.S3_ENDPOINT
  if (endpoint) return `${endpoint.replace(/\/$/, '')}/${getBucket()}/${key}`
  return `https://${getBucket()}.s3.amazonaws.com/${key}`
}

/** Signed, time-limited URL for objects in private storage (e.g. personal-files/). */
export async function getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
  const client = getClient()
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/**
 * Cloudflare R2 client — SERVER-ONLY (ADR-019 P0).
 *
 * R2 is S3-compatible; the token is scoped to one bucket, Object Read & Write.
 * The bucket is never public: browsers only ever see short-lived presigned
 * URLs, issued after the route's ACL check. Env is read lazily so a build or
 * a route that never touches files doesn't need it.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { contentDisposition } from "@/lib/workspaceFiles"

const PUT_TTL_S = 5 * 60
const GET_TTL_S = 60

const globalForR2 = globalThis as unknown as { __avryR2?: { client: S3Client; bucket: string } }

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} env var is required for workspace files`)
  return v
}

function r2(): { client: S3Client; bucket: string } {
  if (!globalForR2.__avryR2) {
    const endpoint = process.env.R2_ENDPOINT || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`
    globalForR2.__avryR2 = {
      client: new S3Client({
        region: "auto",
        endpoint,
        // Path-style keeps every presigned URL on the one account host, so the
        // CSP connect-src can name that host instead of *.r2.cloudflarestorage.com
        // (a wildcard would also allow uploads to anyone else's bucket).
        forcePathStyle: true,
        credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
      }),
      bucket: env("R2_BUCKET"),
    }
  }
  return globalForR2.__avryR2
}

export function r2Configured(): boolean {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID))
}

/** Presigned PUT: content-type is signed, so the browser must send exactly it. */
export async function presignPut(key: string, mime: string): Promise<string> {
  const { client, bucket } = r2()
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime }), {
    expiresIn: PUT_TTL_S,
  })
}

export async function presignGet(key: string, name: string): Promise<string> {
  const { client, bucket } = r2()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: contentDisposition(name) }),
    { expiresIn: GET_TTL_S },
  )
}

/** Size + type of an uploaded object, or null when it isn't there. */
export async function headObject(key: string): Promise<{ size: number; mime: string } | null> {
  const { client, bucket } = r2()
  try {
    const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { size: Number(r.ContentLength ?? 0), mime: (r.ContentType ?? "").toLowerCase() }
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404) return null
    throw e
  }
}

/** Object bytes for server-side processing (text extraction), capped at `maxBytes`. */
export async function getObjectBytes(key: string, maxBytes: number): Promise<Uint8Array | null> {
  const { client, bucket } = r2()
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (Number(r.ContentLength ?? 0) > maxBytes || !r.Body) return null
  return r.Body.transformToByteArray()
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = r2()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export const R2_TTL = { put: PUT_TTL_S, get: GET_TTL_S }

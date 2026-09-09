import { S3Client } from "@aws-sdk/client-s3"

export function getS3Client() {
  const endpoint = process.env.MINIO_ENDPOINT || "http://avry-minio:9000"
  const accessKeyId = process.env.MINIO_ROOT_USER || "aivory"
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || "AivoryMinio2026!@#"
  return new S3Client({
    region: "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function getBucket() {
  return process.env.WORKSPACE_BLOB_BUCKET || "workspace-blobs"
}

export function getPublicUrl(key: string) {
  const base = (process.env.MINIO_PUBLIC_URL || "https://s3.aivory.uk").replace(/\/$/, "")
  const bucket = getBucket()
  return `${base}/${bucket}/${key}`
}

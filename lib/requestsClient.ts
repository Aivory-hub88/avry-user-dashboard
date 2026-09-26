"use client"

/**
 * Browser helpers for teams, project requests and file uploads (ADR-019 P1).
 * Uploads go browser → R2 directly: presign, PUT with the signed
 * Content-Type, then /complete so the server verifies size and type.
 */
import { collabAuthHeaders } from "@/lib/collabClient"
import type { ProjectRequest, ReviewDecision } from "@/lib/projectRequests"
import type { WorkspaceFile } from "@/lib/workspaceFiles"
import { ALLOWED_MIME, MAX_FILE_BYTES } from "@/lib/workspaceFiles"

export type TeamSummary = { id: string; name: string; role: "owner" | "editor" | "viewer"; owner: string }
export type RequestWithTeam = ProjectRequest & { teamName: string }
export type RequestCan = { edit: boolean; submit: boolean; withdraw: boolean; review: boolean }

export class ApiError extends Error {
  constructor(public status: number, message: string, public problems: string[] = []) {
    super(message)
  }
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...collabAuthHeaders() }
  if (init?.json !== undefined) headers["Content-Type"] = "application/json"
  const r = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    const message =
      r.status === 401 ? "Your session has expired. Sign in again." : typeof j.error === "string" ? j.error : "Something went wrong. Try again."
    throw new ApiError(r.status, message, Array.isArray(j.problems) ? (j.problems as string[]) : [])
  }
  return j as T
}

export const teamsApi = {
  list: () => api<{ teams: TeamSummary[] }>("/api/workspaces").then((j) => j.teams),
  create: (name: string) => api<{ team: TeamSummary }>("/api/workspaces", { method: "POST", json: { name } }).then((j) => j.team),
  members: (id: string) =>
    api<{ name: string; owner: string; members: { user_id: string; role: string; email: string | null; full_name: string | null }[] }>(
      `/api/workspaces/${id}/members`,
    ),
  addMember: (id: string, email: string, role: "editor" | "viewer" | "owner") =>
    api(`/api/workspaces/${id}/members`, { method: "POST", json: { email, role } }),
  removeMember: (id: string, userId: string) => api(`/api/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
}

export const requestsApi = {
  list: (scope: "mine" | "inbox") =>
    api<{ requests: RequestWithTeam[] }>(`/api/workspace/requests?scope=${scope}`).then((j) => j.requests),
  create: (workspaceId: string, title: string) =>
    api<{ request: ProjectRequest }>("/api/workspace/requests", { method: "POST", json: { workspaceId, title } }).then((j) => j.request),
  get: (id: string) => api<{ request: RequestWithTeam; can: RequestCan }>(`/api/workspace/requests/${id}`),
  patch: (id: string, patch: Record<string, unknown>) =>
    api<{ request: ProjectRequest }>(`/api/workspace/requests/${id}`, { method: "PATCH", json: patch }).then((j) => j.request),
  submit: (id: string) => api<{ request: ProjectRequest }>(`/api/workspace/requests/${id}/submit`, { method: "POST", json: {} }),
  withdraw: (id: string) => api<{ request: ProjectRequest }>(`/api/workspace/requests/${id}/withdraw`, { method: "POST", json: {} }),
  review: (id: string, decision: ReviewDecision, note: string) =>
    api<{ request: ProjectRequest; roomId?: string; notFound?: string[]; seedError?: boolean }>(
      `/api/workspace/requests/${id}/review`,
      { method: "POST", json: { decision, note } },
    ),
}

/** Base path for a file scope: a request's attachments or a room's files. */
export type FileBase = `/api/workspace/requests/${string}/files` | `/api/workspace/${string}/files`

export const filesApi = {
  list: (base: FileBase) => api<{ files: WorkspaceFile[] }>(base).then((j) => j.files),
  download: (base: FileBase, fileId: string) => api<{ url: string }>(`${base}/${fileId}`).then((j) => j.url),
  remove: (base: FileBase, fileId: string) => api(`${base}/${fileId}`, { method: "DELETE" }),
}

/** Browsers report some types differently (or not at all); map by extension as a fallback. */
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [ext, mime]),
)
EXT_MIME.jpeg = "image/jpeg"
EXT_MIME.markdown = "text/markdown"

export function mimeFor(file: File): string | null {
  const t = file.type.toLowerCase()
  if (t in ALLOWED_MIME) return t
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return EXT_MIME[ext] ?? null
}

export function uploadProblem(file: File): string | null {
  if (!mimeFor(file)) return `${file.name}: this file type isn't supported`
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 25 MB`
  if (file.size === 0) return `${file.name} is empty`
  return null
}

/** presign → PUT to R2 (with progress) → complete. Resolves with the ready file. */
export async function uploadFile(base: FileBase, file: File, onProgress?: (fraction: number) => void): Promise<WorkspaceFile> {
  const mime = mimeFor(file)
  if (!mime) throw new ApiError(400, "This file type isn't supported")
  const { file: pending, upload } = await api<{ file: WorkspaceFile; upload: { url: string; headers: Record<string, string> } }>(base, {
    method: "POST",
    json: { name: file.name, mime, size: file.size },
  })
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", upload.url)
    for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "The upload didn't go through. Try again.")))
    xhr.onerror = () => reject(new ApiError(0, "The upload didn't go through. Check your connection and try again."))
    xhr.send(file)
  })
  const done = await api<{ file: WorkspaceFile }>(`${base}/${pending.id}/complete`, { method: "POST", json: {} })
  return done.file
}

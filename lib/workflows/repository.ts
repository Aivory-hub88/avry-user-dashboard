/**
 * File-backed workflow repository.
 * Persists to .data/workflows.json so workflows survive server restarts.
 * Falls back to in-memory if the filesystem is unavailable (e.g. read-only deploy).
 */
import { randomUUID } from 'crypto'
import { AivoryWorkflowSpec, WorkflowStatus } from '@/types/workflow'
import path from 'path'
import fs from 'fs'

// ── Storage path ─────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), '.data')
const STORE_FILE = path.join(DATA_DIR, 'workflows.json')

// ── In-memory cache (populated from file on first access) ─
let cache: Map<string, AivoryWorkflowSpec> | null = null

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch { /* read-only fs — will use in-memory only */ }
}

function readFile(): Map<string, AivoryWorkflowSpec> {
  try {
    ensureDir()
    if (!fs.existsSync(STORE_FILE)) return new Map()
    const raw = fs.readFileSync(STORE_FILE, 'utf-8')
    const arr = JSON.parse(raw) as AivoryWorkflowSpec[]
    return new Map(arr.map(w => [w.id, w]))
  } catch {
    return new Map()
  }
}

function writeFile(store: Map<string, AivoryWorkflowSpec>) {
  try {
    ensureDir()
    const arr = Array.from(store.values())
    fs.writeFileSync(STORE_FILE, JSON.stringify(arr, null, 2), 'utf-8')
  } catch { /* read-only fs — changes live in memory only for this process */ }
}

function getStore(): Map<string, AivoryWorkflowSpec> {
  if (!cache) cache = readFile()
  return cache
}

export interface WorkflowRepository {
  list(): AivoryWorkflowSpec[]
  get(id: string): AivoryWorkflowSpec | undefined
  create(data: Omit<AivoryWorkflowSpec, 'id' | 'createdAt' | 'updatedAt'>): AivoryWorkflowSpec
  update(id: string, patch: Partial<Omit<AivoryWorkflowSpec, 'id' | 'createdAt'>>): AivoryWorkflowSpec | undefined
  upsert(spec: AivoryWorkflowSpec): AivoryWorkflowSpec
  remove(id: string): boolean
}

export const workflowRepository: WorkflowRepository = {
  list() {
    return Array.from(getStore().values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  get(id) {
    return getStore().get(id)
  },

  create(data) {
    const store = getStore()
    const now = new Date().toISOString()
    const spec: AivoryWorkflowSpec = {
      ...data,
      id: randomUUID(),
      status: (data.status as WorkflowStatus) ?? 'draft',
      createdAt: now,
      updatedAt: now,
    }
    store.set(spec.id, spec)
    writeFile(store)
    return spec
  },

  update(id, patch) {
    const store = getStore()
    const existing = store.get(id)
    if (!existing) return undefined
    const updated: AivoryWorkflowSpec = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    store.set(id, updated)
    writeFile(store)
    return updated
  },

  remove(id) {
    const store = getStore()
    const deleted = store.delete(id)
    if (deleted) writeFile(store)
    return deleted
  },

  upsert(spec) {
    const store = getStore()
    const now = new Date().toISOString()
    const entry: AivoryWorkflowSpec = {
      ...spec,
      updatedAt: now,
      createdAt: spec.createdAt || now,
    }
    store.set(spec.id, entry)
    writeFile(store)
    return entry
  },
}

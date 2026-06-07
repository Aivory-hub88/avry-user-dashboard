/**
 * File-backed canvas state repository.
 * Stores React Flow nodes + edges per workflow in .data/canvas_states.json.
 * Falls back to in-memory if the filesystem is unavailable.
 */
import path from 'path'
import fs from 'fs'
import type { Node, Edge } from '@xyflow/react'

const DATA_DIR = path.join(process.cwd(), '.data')
const STORE_FILE = path.join(DATA_DIR, 'canvas_states.json')

export interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  savedAt: string
}

type Store = Record<string, CanvasState>

let cache: Store | null = null

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch { /* read-only fs */ }
}

function readStore(): Store {
  try {
    ensureDir()
    if (!fs.existsSync(STORE_FILE)) return {}
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  try {
    ensureDir()
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8')
  } catch { /* read-only fs */ }
}

function getStore(): Store {
  if (!cache) cache = readStore()
  return cache
}

export const canvasRepository = {
  get(workflowId: string): CanvasState | null {
    return getStore()[workflowId] ?? null
  },

  set(workflowId: string, nodes: Node[], edges: Edge[]): CanvasState {
    const store = getStore()
    const state: CanvasState = { nodes, edges, savedAt: new Date().toISOString() }
    store[workflowId] = state
    writeStore(store)
    return state
  },

  remove(workflowId: string): void {
    const store = getStore()
    delete store[workflowId]
    writeStore(store)
  },
}

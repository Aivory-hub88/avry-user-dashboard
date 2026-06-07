"use client"

import { useRef, useEffect, useState } from "react"
import { extractTextFromFile } from "@/lib/fileExtractor"

export type AttachmentType = 'json_schema' | 'file' | 'image' | 'blueprint'

export interface Attachment {
  type: AttachmentType
  label: string
  // json_schema / file
  filename?: string
  content?: string
  // image
  base64?: string
  // blueprint
  version?: string
  data?: unknown
}

interface BlueprintVersion {
  version: string
  label: string
  timestamp: string
  company_name: string
  diagnostic_score: number
  maturity_level: string
  blueprint_data: unknown
}

interface UploadMenuProps {
  isOpen: boolean
  onClose: () => void
  onAttach: (attachment: Attachment) => void
  onToast: (msg: string) => void
  onExtractingChange?: (extracting: boolean) => void
}

const MB = 1024 * 1024
const LIMITS = { json_schema: 5 * MB, file: 10 * MB, image: 10 * MB }

export default function UploadMenu({ isOpen, onClose, onAttach, onToast, onExtractingChange }: UploadMenuProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [showBlueprintModal, setShowBlueprintModal] = useState(false)
  const [blueprintVersions, setBlueprintVersions] = useState<BlueprintVersion[]>([])
  const [sizeWarning, setSizeWarning] = useState('')
  const [extracting, setExtracting] = useState(false)
  const sizeWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSizeWarning = (msg: string) => {
    setSizeWarning(msg)
    if (sizeWarningTimer.current) clearTimeout(sizeWarningTimer.current)
    sizeWarningTimer.current = setTimeout(() => setSizeWarning(''), 4000)
  }

  const checkSize = (file: File, limit: number, inputEl: HTMLInputElement): boolean => {
    if (file.size > limit) {
      const limitMB = limit / MB
      showSizeWarning(`File too large. Please choose a file under ${limitMB}MB.`)
      inputEl.value = ''
      return false
    }
    return true
  }

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.upload-menu') && !target.closest('.add-btn')) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  // ── JSON Schema ──────────────────────────────────────────
  const handleJSONSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!checkSize(file, LIMITS.json_schema, e.target)) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        onAttach({
          type: 'json_schema',
          label: `${file.name}`,
          filename: file.name,
          content: JSON.stringify(parsed),
        })
        onClose()
      } catch {
        onToast('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── File ─────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!checkSize(file, LIMITS.file, e.target)) return

    setExtracting(true)
    onExtractingChange?.(true)
    onClose()

    // Safety timeout — never leave extracting stuck
    const safetyTimer = setTimeout(() => {
      setExtracting(false)
      onExtractingChange?.(false)
    }, 30000)

    try {
      const text = await extractTextFromFile(file)
      onAttach({
        type: 'file',
        label: `${file.name}`,
        filename: file.name,
        content: text,
      })
    } catch {
      showSizeWarning('Could not read file content. Try a different format.')
    } finally {
      clearTimeout(safetyTimer)
      setExtracting(false)
      onExtractingChange?.(false)
    }

    e.target.value = ''
  }

  // ── Image ────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!checkSize(file, LIMITS.image, e.target)) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1] ?? ''
      onAttach({
        type: 'image',
        label: `${file.name}`,
        filename: file.name,
        base64: b64,
      })
      onClose()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Blueprint ────────────────────────────────────────────
  const handleImportBlueprint = () => {
    try {
      const raw = localStorage.getItem('aivory_blueprint_versions')
      const versions: BlueprintVersion[] = raw ? JSON.parse(raw) : []
      if (!versions.length) {
        onToast('No saved blueprints found. Complete a Deep Diagnostic first.')
        onClose()
        return
      }
      setBlueprintVersions(versions)
      setShowBlueprintModal(true)
      onClose()
    } catch {
      onToast('Failed to load blueprints.')
      onClose()
    }
  }

  const handleBlueprintPick = (v: BlueprintVersion) => {
    onAttach({
      type: 'blueprint',
      label: `Blueprint ${v.version} — ${v.company_name}`,
      version: v.version,
      data: v.blueprint_data,
    })
    setShowBlueprintModal(false)
  }

  return (
    <>
      {/* Hidden file inputs */}
      <input ref={jsonInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleJSONSelect} />
      <input ref={fileInputRef} type="file" accept=".txt,.csv,.md,.json,.pdf,.docx" style={{ display: 'none' }} onChange={handleFileSelect} />
      <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" style={{ display: 'none' }} onChange={handleImageSelect} />

      {/* Dropdown menu */}
      <div className={`upload-menu ${isOpen ? 'active' : ''}`}>
        <div className="upload-menu-hint">Supported: TXT, CSV, MD, JSON, PDF, DOCX (max 10MB)</div>
        <div className="upload-item" onClick={() => { jsonInputRef.current?.click() }}>
          Upload JSON Schema
        </div>
        <div className="upload-item" onClick={() => { fileInputRef.current?.click() }}>
          Upload File
        </div>
        <div className="upload-item" onClick={() => { imageInputRef.current?.click() }}>
          Upload Image
        </div>
        <div className="upload-item" onClick={handleImportBlueprint}>
          Import Blueprint
        </div>
      </div>

      {/* Size warning */}
      {sizeWarning && (
        <div className="upload-size-warning" role="alert">{sizeWarning}</div>
      )}

      {/* Extracting indicator */}
      {extracting && (
        <div className="upload-size-warning" role="status" style={{ color: '#00e59e' }}>
          Extracting file content…
        </div>
      )}

      {/* Blueprint picker modal */}
      {showBlueprintModal && (
        <div className="blueprint-modal-overlay" onClick={() => setShowBlueprintModal(false)}>
          <div className="blueprint-modal" onClick={e => e.stopPropagation()}>
            <div className="blueprint-modal-header">
              <span className="blueprint-modal-title">Select Blueprint</span>
              <button className="blueprint-modal-close" onClick={() => setShowBlueprintModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="blueprint-modal-list">
              {blueprintVersions.map(v => (
                <button key={v.version} className="blueprint-modal-item" onClick={() => handleBlueprintPick(v)}>
                  <span className="bmi-version">{v.version}</span>
                  <span className="bmi-meta">
                    {v.company_name} · Score {v.diagnostic_score} · {new Date(v.timestamp).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

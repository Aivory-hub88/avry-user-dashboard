'use client'
import { useState, useCallback, useEffect } from 'react'
import { validateFileSize } from '@/lib/streaming'
import { extractTextFromFile } from '@/lib/fileExtractor'
import { makeImageThumb } from '@/lib/imageThumb'
import type { Attachment } from '@/components/UploadMenu'

const ALLOWED_TYPES = [
  "text/plain", "text/csv", "text/markdown", "application/json", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png", "image/jpeg", "image/gif", "image/webp",
]

export interface FileUploadOptions {
  /** Listen for drop / paste. Default true. */
  enabled?: boolean
  /** Keep the File on the attachment and skip text extraction (it is uploaded as-is). */
  keepFile?: boolean
  /** Replaces the Console type + size check; return an error message to reject the file. */
  validate?: (file: File) => string | null
}

export function useFileUpload(addToast: (type: "error" | "success", msg: string) => void, opts: FileUploadOptions = {}) {
  const { enabled = true, keepFile = false, validate } = opts
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (validate) {
        const problem = validate(file)
        if (problem) { addToast("error", problem); continue }
      } else {
        if (!ALLOWED_TYPES.includes(file.type)) { addToast("error", `Unsupported file: ${file.name}`); continue }
        const err = validateFileSize(file.size, file.name)
        if (err) { addToast("error", err); continue }
      }
      const text = keepFile ? undefined : await extractTextFromFile(file)
      const attType: Attachment["type"] = file.type.startsWith("image/") ? "image" : "file"
      const thumb = attType === "image" ? await makeImageThumb(file) : undefined
      setAttachments(p => [...p, { type: attType, label: file.name, filename: file.name, ...(text !== undefined ? { content: text } : {}), ...(thumb ? { thumb } : {}), ...(keepFile ? { file } : {}) }])
    }
  }, [addToast, keepFile, validate])

  // Global window drag & drop listeners
  useEffect(() => {
    if (!enabled) return
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) handleFileSelect(files)
    }
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }
    // Paste: files on the clipboard (a screenshot, a copied file) attach; plain text pastes as usual.
    const handlePaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      const dt = new DataTransfer()
      files.forEach((f) => dt.items.add(f))
      handleFileSelect(dt.files)
    }
    window.addEventListener('paste', handlePaste)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    return () => {
      window.removeEventListener('paste', handlePaste)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
    }
  }, [enabled, handleFileSelect])

  return { attachments, setAttachments, isDragging, handleFileSelect }
}

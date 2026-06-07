'use client'
import { useState, useCallback, useEffect } from 'react'
import { validateFileSize } from '@/lib/streaming'
import { extractTextFromFile } from '@/lib/fileExtractor'
import type { Attachment } from '@/components/UploadMenu'

const ALLOWED_TYPES = [
  "text/plain", "text/csv", "text/markdown", "application/json", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png", "image/jpeg", "image/gif", "image/webp",
]

export function useFileUpload(addToast: (type: "error" | "success", msg: string) => void) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) { addToast("error", `Unsupported file: ${file.name}`); continue }
      const err = validateFileSize(file.size, file.name)
      if (err) { addToast("error", err); continue }
      const text = await extractTextFromFile(file)
      const attType: Attachment["type"] = file.type.startsWith("image/") ? "image" : "file"
      setAttachments(p => [...p, { type: attType, label: file.name, filename: file.name, content: text }])
    }
  }, [addToast])

  // Global window drag & drop listeners
  useEffect(() => {
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
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    return () => {
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
    }
  }, [handleFileSelect])

  return { attachments, setAttachments, isDragging, handleFileSelect }
}

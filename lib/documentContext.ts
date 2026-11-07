/**
 * Optional company document for the Deep Diagnostic (a company profile, deck or about page the user may attach).
 * It is extra context for profiling, never required. Text is extracted on the server, kept in the saved progress,
 * and forwarded to the bridge as `_document_text`, where it is treated as untrusted data (ADR-022).
 */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
export const DOCUMENT_MAX_CHARS = 12_000

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
}

export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md'

/** The mime the extractor understands for this file name, or null for an unsupported type. */
export function documentMimeFor(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? null
}

export type DocumentError = 'TOO_LARGE' | 'UNSUPPORTED' | 'NO_TEXT' | 'UNREADABLE' | 'FAILED'

/** What the user is told when attaching fails. Never blocks the diagnostic: they can just continue. */
export function documentErrorMessage(code: DocumentError, locale: 'en' | 'id'): string {
  const id: Record<DocumentError, string> = {
    TOO_LARGE: 'File terlalu besar (maks 5 MB). Anda bisa lanjut tanpa dokumen.',
    UNSUPPORTED: 'Format belum didukung. Gunakan PDF, DOCX, TXT atau MD, atau lanjut tanpa dokumen.',
    NO_TEXT: 'Tidak ada teks yang bisa dibaca di file ini (mungkin hasil scan). Anda bisa lanjut tanpa dokumen.',
    UNREADABLE: 'File tidak bisa dibaca. Anda bisa lanjut tanpa dokumen.',
    FAILED: 'Gagal mengunggah dokumen. Anda bisa lanjut tanpa dokumen.',
  }
  const en: Record<DocumentError, string> = {
    TOO_LARGE: 'File is too large (max 5 MB). You can continue without a document.',
    UNSUPPORTED: 'Unsupported format. Use PDF, DOCX, TXT or MD, or continue without a document.',
    NO_TEXT: 'No readable text in this file (it may be a scan). You can continue without a document.',
    UNREADABLE: 'The file could not be read. You can continue without a document.',
    FAILED: 'Could not upload the document. You can continue without a document.',
  }
  return (locale === 'id' ? id : en)[code]
}

/** Client-side pre-check so an obviously wrong file never travels. */
export function precheckDocument(file: { name: string; size: number }): DocumentError | null {
  if (file.size > DOCUMENT_MAX_BYTES) return 'TOO_LARGE'
  if (!documentMimeFor(file.name)) return 'UNSUPPORTED'
  return null
}

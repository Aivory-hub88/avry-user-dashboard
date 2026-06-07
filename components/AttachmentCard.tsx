import type { Attachment } from "@/components/UploadMenu"

interface AttachmentCardProps {
  attachment: Attachment
  onRemove: () => void
  readOnly?: boolean
}

export function AttachmentCard({ attachment, onRemove, readOnly }: AttachmentCardProps) {
  const filename = attachment.filename || attachment.label || "File"
  const fileType = attachment.type || ""
  const ext = filename.split(".").pop()?.toUpperCase() || ""
  const { bg, text, icon } = getFileStyle(fileType, ext)

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl px-4 py-3 min-w-[200px] max-w-[280px]"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        <span className={`text-[11px] font-bold ${text}`}>{icon}</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="truncate text-sm font-medium text-white/90 max-w-[160px]">{filename}</span>
        <span className="text-xs text-white/40">{ext}</span>
      </div>
      {!readOnly && (
        <button
          onClick={onRemove}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          aria-label="Remove attachment"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function getFileStyle(mimeType: string, ext: string) {
  if (mimeType.includes("pdf") || ext === "PDF")
    return { bg: "bg-red-500/20", text: "text-red-400", icon: "PDF" }
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword") || ["DOC", "DOCX"].includes(ext))
    return { bg: "bg-blue-500/20", text: "text-blue-400", icon: "DOC" }
  if (mimeType.includes("spreadsheetml") || mimeType.includes("excel") || ["XLS", "XLSX"].includes(ext))
    return { bg: "bg-green-500/20", text: "text-green-400", icon: "XLS" }
  if (mimeType.includes("presentationml") || mimeType.includes("powerpoint") || ["PPT", "PPTX"].includes(ext))
    return { bg: "bg-orange-500/20", text: "text-orange-400", icon: "PPT" }
  if (mimeType.startsWith("image") || ["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG", "AVIF", "HEIC"].includes(ext))
    return { bg: "bg-purple-500/20", text: "text-purple-400", icon: "IMG" }
  if (mimeType.includes("json") || ext === "JSON")
    return { bg: "bg-yellow-500/20", text: "text-yellow-400", icon: "JSON" }
  if (mimeType.includes("csv") || ext === "CSV")
    return { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: "CSV" }
  if (mimeType.startsWith("text") || ["TXT", "MD", "MDX", "YAML", "YML", "ENV", "LOG"].includes(ext))
    return { bg: "bg-slate-500/20", text: "text-slate-300", icon: "TXT" }
  if (["JS", "TS", "TSX", "JSX", "PY", "GO", "RS", "JAVA", "CPP", "C", "SH", "BASH"].includes(ext))
    return { bg: "bg-cyan-500/20", text: "text-cyan-400", icon: ext }
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gz") || ["ZIP", "TAR", "GZ", "RAR", "7Z"].includes(ext))
    return { bg: "bg-amber-500/20", text: "text-amber-400", icon: "ZIP" }
  if (mimeType.startsWith("audio") || ["MP3", "WAV", "M4A", "OGG", "FLAC"].includes(ext))
    return { bg: "bg-pink-500/20", text: "text-pink-400", icon: "AUD" }
  if (mimeType.startsWith("video") || ["MP4", "MOV", "AVI", "MKV", "WEBM"].includes(ext))
    return { bg: "bg-indigo-500/20", text: "text-indigo-400", icon: "VID" }
  return { bg: "bg-white/10", text: "text-white/50", icon: ext || "FILE" }
}

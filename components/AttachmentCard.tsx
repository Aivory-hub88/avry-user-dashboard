import type { Attachment } from "@/components/UploadMenu"

interface AttachmentCardProps {
  attachment: Attachment
  onRemove: () => void
  readOnly?: boolean
}

/** What the tile shows as its picture: the thumbnail, else a still-in-memory image. */
export function attachmentPreviewSrc(att: Attachment): string | undefined {
  if (att.thumb) return att.thumb
  if (att.content?.startsWith("data:image/")) return att.content
  if (att.base64?.startsWith("data:image/")) return att.base64
  return undefined
}

/** Square tile: the picture for images, a typed badge + file name for everything else. */
export function AttachmentCard({ attachment, onRemove, readOnly }: AttachmentCardProps) {
  const filename = attachment.filename || attachment.label || "File"
  const fileType = attachment.type || ""
  const ext = filename.split(".").pop()?.toUpperCase() || ""
  const { bg, text, icon } = getFileStyle(fileType, ext)
  const src = attachmentPreviewSrc(attachment)

  return (
    <div
      className="group/att relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-black"
      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
      title={filename}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={filename} draggable={false} className="h-full w-full object-contain" />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-1 px-1.5 ${bg}`}>
          <span className={`text-[13px] font-bold leading-none ${text}`}>{icon}</span>
          <span className="w-full truncate text-center text-[9px] leading-tight text-white/60">{filename}</span>
        </div>
      )}
      {!readOnly && (
        <button
          onClick={onRemove}
          className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/60 text-[10px] text-white/70 transition-colors hover:bg-black/80 hover:text-white"
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

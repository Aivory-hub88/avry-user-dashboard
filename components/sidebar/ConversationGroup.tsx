"use client"
import { useState, useRef, useEffect } from "react"
import { Pin, MoreHorizontal, Edit, Trash2 } from "lucide-react"
import { Conversation, ConversationGroup as GroupType } from "@/types/conversation"

interface ConversationGroupProps {
  label: GroupType
  conversations: Conversation[]
  searchQuery: string
  onPin: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  activeId?: string
}

export default function ConversationGroup({
  label,
  conversations,
  searchQuery,
  onPin,
  onRename,
  onDelete,
  onSelect,
  activeId,
}: ConversationGroupProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contextMenu) {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setContextMenu(null)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [contextMenu])

  const handleRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle)
  }

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle("")
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      saveRename(id)
    } else if (e.key === "Escape") {
      setEditingId(null)
      setEditTitle("")
    }
  }

  const openContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  const handleContextAction = (action: "pin" | "rename" | "delete") => {
    if (contextMenu) {
      if (action === "pin") {
        onPin(contextMenu.id)
      } else if (action === "rename") {
        handleRename(contextMenu.id, conversations.find((c) => c.id === contextMenu.id)?.title || "")
      } else if (action === "delete") {
        onDelete(contextMenu.id)
      }
      setContextMenu(null)
    }
  }

  if (conversations.length === 0) return null

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)
    if (index === -1) return text
    return (
      <>
        {text.slice(0, index)}
        <mark className="bg-accent/20 text-accent rounded-sm">
          {text.slice(index, index + query.length)}
        </mark>
        {text.slice(index + query.length)}
      </>
    )
  }

  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 pt-3 pb-1">{label}</div>
      <div className="flex flex-col gap-0.5">
        {conversations.map((chat) => (
          <div
            key={chat.id}
            className="group relative flex items-center gap-2 px-2 py-1 mx-1 rounded-md cursor-pointer hover:bg-white/[0.06] transition-colors"
            onClick={() => onSelect(chat.id)}
            onContextMenu={(e) => openContextMenu(e, chat.id)}
          >
            {editingId === chat.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, chat.id)}
                onBlur={() => saveRename(chat.id)}
                autoFocus
                className="flex-1 bg-transparent text-xs text-white/90 outline-none"
              />
            ) : (
              <span className="flex-1 text-xs text-white/60 group-hover:text-white/90 truncate">
                {highlightText(chat.title, searchQuery)}
              </span>
            )}
            <span suppressHydrationWarning className="text-[10px] text-white/25 group-hover:opacity-0 transition-opacity shrink-0">
              {new Date(chat.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onPin(chat.id)
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] text-white/30 hover:text-white/70"
              >
                <Pin className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRename(chat.id, chat.title)
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] text-white/30 hover:text-white/70"
              >
                <Edit className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(chat.id)
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] text-white/30 hover:text-white/70"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] bg-[#1E1E1B] border border-white/[0.08] rounded-lg py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => handleContextAction("pin")}
            className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] transition-colors"
          >
            Pin
          </button>
          <button
            onClick={() => handleContextAction("rename")}
            className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] transition-colors"
          >
            Rename
          </button>
          <div className="border-t border-white/[0.08] my-1" />
          <button
            onClick={() => handleContextAction("delete")}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  )
}

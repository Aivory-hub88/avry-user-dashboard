"use client"
import { useState, useRef, useEffect } from "react"
import { Pin, MoreHorizontal, Edit, Trash2 } from "lucide-react"
import { Conversation } from "@/types/conversation"

interface PinnedChatsProps {
  chats: Conversation[]
  onUnpin: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  activeId?: string
}

export default function PinnedChats({
  chats,
  onUnpin,
  onRename,
  onDelete,
  onSelect,
  activeId,
}: PinnedChatsProps) {
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

  const handleContextAction = (action: "rename" | "unpin" | "delete") => {
    if (contextMenu) {
      if (action === "rename") {
        handleRename(contextMenu.id, chats.find((c) => c.id === contextMenu.id)?.title || "")
      } else if (action === "unpin") {
        onUnpin(contextMenu.id)
      } else if (action === "delete") {
        onDelete(contextMenu.id)
      }
      setContextMenu(null)
    }
  }

  if (chats.length === 0) return null

  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 pt-2 pb-1">Pinned</div>
      <div className="flex flex-col gap-0.5">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className="group flex items-center gap-2 px-2 py-1 mx-1 rounded-md cursor-pointer hover:bg-white/[0.06] transition-colors"
            onClick={() => onSelect(chat.id)}
            onContextMenu={(e) => openContextMenu(e, chat.id)}
          >
            <Pin className="w-3 h-3 text-accent shrink-0" />
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
              <span className="flex-1 text-xs text-white/60 group-hover:text-white/90 truncate">{chat.title}</span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
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
                  onUnpin(chat.id)
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] text-white/30 hover:text-white/70"
              >
                <MoreHorizontal className="w-3 h-3" />
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
            onClick={() => handleContextAction("rename")}
            className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => handleContextAction("unpin")}
            className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] transition-colors"
          >
            Unpin
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

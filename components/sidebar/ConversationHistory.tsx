"use client"
import { useConversationHistory } from "@/hooks/useConversationHistory"
import SearchBar from "./SearchBar"
import PinnedChats from "./PinnedChats"
import ConversationGroup from "./ConversationGroup"
import { ConversationGroup as GroupType } from "@/types/conversation"

interface ConversationHistoryProps {
  collapsed: boolean
}

export default function ConversationHistory({ collapsed }: ConversationHistoryProps) {
  const {
    pinnedConversations,
    filteredConversations,
    searchQuery,
    setSearchQuery,
    pinConversation,
    unpinConversation,
    renameConversation,
    deleteConversation,
  } = useConversationHistory()

  if (collapsed) return null

  const groups: GroupType[] = ["Today", "Yesterday", "Last 7 Days", "Older"]

  const hasAnyConversations = groups.some((g) => filteredConversations[g].length > 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 mt-6 shrink min-h-0">
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <div
        className="flex-1 overflow-y-auto scrollbar-invisible"
        style={{
          maxHeight: 'calc(5 * 44px)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <PinnedChats
          chats={pinnedConversations}
          onUnpin={unpinConversation}
          onRename={renameConversation}
          onDelete={deleteConversation}
          onSelect={() => {}}
        />
        {groups.map((group) => (
          <ConversationGroup
            key={group}
            label={group}
            conversations={filteredConversations[group]}
            searchQuery={searchQuery}
            onPin={pinConversation}
            onRename={renameConversation}
            onDelete={deleteConversation}
            onSelect={() => {}}
          />
        ))}
        {!hasAnyConversations && (
          <div className="px-4 py-6 text-center text-xs text-white/25">No conversations found</div>
        )}
      </div>
    </div>
  )
}

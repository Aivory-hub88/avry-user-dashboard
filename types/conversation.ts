export type ConversationGroup = 'Today' | 'Yesterday' | 'Last 7 Days' | 'Older'

export interface Conversation {
  id: string
  title: string
  updatedAt: Date
  pinned: boolean
}

'use client'

import { createContext, useContext, useState } from 'react'

interface ChatContextValue {
  chatOpen: boolean
  setChatOpen: (v: boolean) => void
  openConversationId: string | null
  setOpenConversationId: (id: string | null) => void
}

const ChatContext = createContext<ChatContextValue>({
  chatOpen: false,
  setChatOpen: () => {},
  openConversationId: null,
  setOpenConversationId: () => {},
})

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [openConversationId, setOpenConversationId] = useState<string | null>(null)
  return (
    <ChatContext.Provider value={{ chatOpen, setChatOpen, openConversationId, setOpenConversationId }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  return useContext(ChatContext)
}

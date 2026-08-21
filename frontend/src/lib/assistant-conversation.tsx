import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import type { UIMessage } from "ai"

export type AssistantConversationStatus = "submitted" | "streaming" | "ready" | "error"

type AssistantConversationSnapshot = {
  messages: UIMessage[]
  status: AssistantConversationStatus
  error: string
  profileName: string
  model: string
}

type AssistantConversationController = {
  send: (text: string) => Promise<void>
  stop: () => void
  clear: () => void
}

type AssistantConversationContextValue = {
  snapshot: AssistantConversationSnapshot
  ready: boolean
  attach: (controller: AssistantConversationController) => () => void
  publish: (snapshot: AssistantConversationSnapshot) => void
  send: (text: string) => Promise<void>
  stop: () => void
  clear: () => void
}

const initialSnapshot: AssistantConversationSnapshot = {
  messages: [],
  status: "ready",
  error: "",
  profileName: "",
  model: "",
}

const AssistantConversationContext = createContext<AssistantConversationContextValue | null>(null)

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [ready, setReady] = useState(false)
  const controllerRef = useRef<AssistantConversationController | null>(null)

  const attach = useCallback((controller: AssistantConversationController) => {
    controllerRef.current = controller
    setReady(true)
    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setReady(false)
      }
    }
  }, [])

  const publish = useCallback((next: AssistantConversationSnapshot) => setSnapshot(next), [])
  const send = useCallback(async (text: string) => {
    if (!controllerRef.current) throw new Error("页面助手尚未准备好，请先在设置中完成 AI 配置。")
    await controllerRef.current.send(text)
  }, [])
  const stop = useCallback(() => controllerRef.current?.stop(), [])
  const clear = useCallback(() => controllerRef.current?.clear(), [])

  const value = useMemo(() => ({ snapshot, ready, attach, publish, send, stop, clear }), [snapshot, ready, attach, publish, send, stop, clear])
  return <AssistantConversationContext.Provider value={value}>{children}</AssistantConversationContext.Provider>
}

export function useAssistantConversation() {
  const context = useContext(AssistantConversationContext)
  if (!context) throw new Error("AssistantConversationProvider is missing")
  return context
}

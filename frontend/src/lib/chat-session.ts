import { useChat } from "@ai-sdk/react"
import type { ChatTransport, UIMessage } from "ai"
import { useEffect, useMemo } from "react"
import { createNativeAIFetch } from "./ai-native-proxy"
import type { ProxySettings } from "./proxy"

// Conversation state is session-local; no prompts or tool results are written to disk.
const history = new Map<string, UIMessage[]>()
export function useConversationChat<M extends UIMessage>(transport: ChatTransport<M>, key: string) {
  const initial = useMemo(() => (history.get(key) ?? []) as M[], [key])
  const chat = useChat<M>({ id: key, transport, messages: initial, throttle: 40 })
  useEffect(() => {
    history.set(key, chat.messages)
    while (history.size > 20) history.delete(history.keys().next().value!)
  }, [key, chat.messages])
  useEffect(
    () => () => {
      void chat.stop()
    },
    [chat.stop],
  )
  return chat
}
export function useAINetwork(proxy: ProxySettings) {
  const network = useMemo(() => createNativeAIFetch(proxy), [proxy.mode, proxy.url])
  useEffect(
    () => () => {
      void network.close()
    },
    [network],
  )
  return network
}

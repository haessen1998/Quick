import { appSessionStorage } from "@/lib/app-storage"
import { useEffect,useRef } from "react"

import type { PageId } from "@/lib/pages"

export type SmartInputPayload = Record<string, unknown>

const STORAGE_KEY = "quick-smart-input"
const EVENT_NAME = "quick-smart-input"

export function sendSmartInput(page: PageId, payload: SmartInputPayload) {
  const detail = { page, payload }
  appSessionStorage.setItem(STORAGE_KEY, JSON.stringify(detail))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }))
}

export function useSmartInput(page: PageId, receive: (payload: SmartInputPayload) => void) {
  const receiver = useRef(receive)
  receiver.current = receive
  useEffect(() => {
    const consume = (detail: unknown) => {
      if (!detail || typeof detail !== "object") return
      const value = detail as { page?: unknown; payload?: unknown }
      if (value.page !== page || !value.payload || typeof value.payload !== "object") return
      appSessionStorage.removeItem(STORAGE_KEY)
      receiver.current(value.payload as SmartInputPayload)
    }
    const saved = appSessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { consume(JSON.parse(saved)) } catch { appSessionStorage.removeItem(STORAGE_KEY) }
    }
    const listener = (event: Event) => consume((event as CustomEvent).detail)
    window.addEventListener(EVENT_NAME, listener)
    return () => window.removeEventListener(EVENT_NAME, listener)
  }, [page])
}

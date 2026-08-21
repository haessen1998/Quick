import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"

import type { PageId } from "@/lib/pages"

type CapabilityAction = (input: Record<string, unknown>) => unknown | Promise<unknown>

export type AssistantPageCapability = {
  page: PageId
  getContext: () => Record<string, unknown>
  actions: Record<string, CapabilityAction>
}

type PendingAction = {
  action: string
  input: Record<string, unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: number
}

type RegistryValue = {
  execute: (page: PageId, action: string, input: Record<string, unknown>) => Promise<unknown>
  getPageContext: (page: PageId) => Record<string, unknown> | null
}

type RegistryContextValue = RegistryValue & {
  register: (page: PageId, current: () => AssistantPageCapability) => () => void
}

const AssistantCapabilityContext = createContext<RegistryContextValue | null>(null)

export function AssistantCapabilityProvider({ children }: { children: ReactNode }) {
  const capabilities = useRef(new Map<PageId, () => AssistantPageCapability>())
  const pending = useRef(new Map<PageId, PendingAction[]>())

  const register = useCallback((page: PageId, current: () => AssistantPageCapability) => {
    capabilities.current.set(page, current)
    const queued = pending.current.get(page) ?? []
    pending.current.delete(page)
    for (const item of queued) {
      window.clearTimeout(item.timer)
      const capability = current()
      const handler = capability.actions[item.action]
      if (!handler) item.reject(new Error(`页面 ${page} 未注册动作 ${item.action}`))
      else Promise.resolve(handler(item.input)).then(item.resolve, item.reject)
    }
    return () => {
      if (capabilities.current.get(page) === current) capabilities.current.delete(page)
    }
  }, [])

  const execute = useCallback(async (page: PageId, action: string, input: Record<string, unknown>) => {
    const current = capabilities.current.get(page)
    if (current) {
      const handler = current().actions[action]
      if (!handler) throw new Error(`页面 ${page} 未注册动作 ${action}`)
      return handler(input)
    }
    return new Promise<unknown>((resolve, reject) => {
      const item: PendingAction = {
        action,
        input,
        resolve,
        reject,
        timer: window.setTimeout(() => {
          const items = pending.current.get(page) ?? []
          pending.current.set(page, items.filter((candidate) => candidate !== item))
          reject(new Error(`等待页面 ${page} 注册能力超时`))
        }, 5000),
      }
      pending.current.set(page, [...(pending.current.get(page) ?? []), item])
    })
  }, [])

  const getPageContext = useCallback((page: PageId) => capabilities.current.get(page)?.().getContext() ?? null, [])
  const value = useMemo(() => ({ execute, getPageContext, register }), [execute, getPageContext, register])

  return <AssistantCapabilityContext.Provider value={value}>{children}</AssistantCapabilityContext.Provider>
}

export function useAssistantCapability(capability: AssistantPageCapability) {
  const context = useContext(AssistantCapabilityContext)
  const current = useRef(capability)
  current.current = capability
  useEffect(() => context?.register(capability.page, () => current.current), [capability.page, context])
}

export function useAssistantCapabilityRegistry() {
  const context = useContext(AssistantCapabilityContext)
  if (!context) throw new Error("AssistantCapabilityProvider is missing")
  return context
}

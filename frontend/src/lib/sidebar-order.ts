import { loadPersistentConfig, savePersistentConfig } from "@/lib/persistent-config"
import type { PageId } from "@/lib/pages"

const STORAGE_KEY = "quick-sidebar-order"

export const DEFAULT_SIDEBAR_ORDER: PageId[] = [
  "navigation",
  "ai-chat",
  "text-workbench",
  "file-tools",
  "formatter",
  "converter",
  "validation",
  "frontend",
  "time-ids",
  "crypto",
  "network",
  "mcp-inspector",
]

const movablePages = new Set<PageId>(DEFAULT_SIDEBAR_ORDER)

export function isSidebarMovablePage(value: unknown): value is PageId {
  return typeof value === "string" && movablePages.has(value as PageId)
}

export function normalizeSidebarOrder(value: unknown): PageId[] {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) } catch { return null } })() : value
  const seen = new Set<PageId>()
  const order: PageId[] = []
  if (Array.isArray(parsed)) {
    for (const page of parsed) {
      if (isSidebarMovablePage(page) && !seen.has(page)) {
        seen.add(page)
        order.push(page)
      }
    }
  }
  for (const page of DEFAULT_SIDEBAR_ORDER) if (!seen.has(page)) order.push(page)
  return order
}

export function loadSidebarOrder() {
  if (typeof window === "undefined") return [...DEFAULT_SIDEBAR_ORDER]
  return normalizeSidebarOrder(window.localStorage.getItem(STORAGE_KEY))
}

export function saveSidebarOrder(order: PageId[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSidebarOrder(order)))
}

export async function hydrateSidebarOrder(fallback: PageId[]) {
  try {
    const saved = await loadPersistentConfig("sidebar-order")
    if (saved) return normalizeSidebarOrder(saved)
    await savePersistentConfig("sidebar-order", normalizeSidebarOrder(fallback))
  } catch (error) {
    console.warn("Unable to hydrate durable sidebar order", error)
  }
  return normalizeSidebarOrder(fallback)
}

export async function persistSidebarOrder(order: PageId[]) {
  await savePersistentConfig("sidebar-order", normalizeSidebarOrder(order))
}

export function moveSidebarPage(order: PageId[], page: PageId, targetIndex: number) {
  const current = normalizeSidebarOrder(order)
  const sourceIndex = current.indexOf(page)
  if (sourceIndex < 0) return current
  const next = [...current]
  next.splice(sourceIndex, 1)
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, page)
  return next
}

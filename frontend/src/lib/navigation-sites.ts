import { loadPersistentConfig, savePersistentConfig } from "@/lib/persistent-config"

export type NavigationCardSize = "1x1" | "2x2" | "4x2"

export type NavigationItem = {
  id: string
  title: string
  url: string
  icon: string
  description: string
  size: NavigationCardSize
}

export type NavigationGroup = {
  id: string
  name: string
  items: NavigationItem[]
}

const STORAGE_KEY = "quick-navigation-sites-v1"

export function navigationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultGroups: NavigationGroup[] = [
  {
    id: "quick",
    name: "Quick",
    items: [
      { id: "quick-github", title: "Quick GitHub", url: "https://github.com/haessen1998/Quick", icon: "", description: "源码、Issue 与版本发布", size: "2x2" },
      { id: "wails-docs", title: "Wails 3", url: "https://v3.wails.io/", icon: "", description: "Wails 3 官方文档", size: "4x2" },
    ],
  },
]

function isNavigationSize(value: unknown): value is NavigationCardSize {
  return value === "1x1" || value === "2x2" || value === "4x2"
}

export function normalizeNavigationURL(value: string) {
  const trimmed = value.trim()
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只支持 http 或 https 地址")
  return url.toString()
}

export function automaticSiteIcon(value: string) {
  try {
    return new URL("/favicon.ico", normalizeNavigationURL(value)).toString()
  } catch {
    return ""
  }
}

export function loadNavigationGroups(): NavigationGroup[] {
  if (typeof window === "undefined") return defaultGroups
  return parseNavigationGroups(window.localStorage.getItem(STORAGE_KEY)) ?? defaultGroups
}

function parseNavigationGroups(raw: string | null): NavigationGroup[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const groups = parsed.flatMap((raw): NavigationGroup[] => {
      if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.name !== "string" || !Array.isArray(raw.items)) return []
      const items = raw.items.flatMap((item: unknown): NavigationItem[] => {
        if (!item || typeof item !== "object") return []
        const value = item as Partial<NavigationItem>
        if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.url !== "string") return []
        return [{ id: value.id, title: value.title, url: value.url, icon: typeof value.icon === "string" ? value.icon : "", description: typeof value.description === "string" ? value.description : "", size: isNavigationSize(value.size) ? value.size : "2x2" }]
      })
      return [{ id: raw.id, name: raw.name, items }]
    })
    return groups
  } catch {
    return null
  }
}

export function saveNavigationGroups(groups: NavigationGroup[]) {
  const serialized = JSON.stringify(groups)
  const previous = window.localStorage.getItem(STORAGE_KEY)
  if (previous && previous !== serialized) window.localStorage.setItem(`${STORAGE_KEY}-backup`, previous)
  window.localStorage.setItem(STORAGE_KEY, serialized)
}

export async function hydrateNavigationGroups(fallback: NavigationGroup[]) {
  try {
    const durable = await loadPersistentConfig("navigation-groups")
    const groups = parseNavigationGroups(durable)
    if (groups) return groups
    await savePersistentConfig("navigation-groups", fallback)
  } catch (error) {
    console.warn("Unable to hydrate durable navigation groups", error)
  }
  return fallback
}

export async function persistNavigationGroups(groups: NavigationGroup[]) {
  await savePersistentConfig("navigation-groups", groups)
}

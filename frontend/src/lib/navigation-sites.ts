import { loadPersistentConfig, savePersistentConfig } from "@/lib/persistent-config"

export type NavigationCardSize = "1x1" | "2x2" | "4x2"

export type NavigationItem = {
  id: string
  title: string
  url: string
  icon: string
  description: string
  list: string
  size: NavigationCardSize
}

export type NavigationGroup = {
  id: string
  name: string
  items: NavigationItem[]
}

const STORAGE_KEY = "quick-navigation-sites-v1"
const SCHEMA_VERSION_KEY = "quick-navigation-sites-schema-version"
const CURRENT_SCHEMA_VERSION = 2
export const NAVIGATION_GROUPS_CHANGED_EVENT = "quick:navigation-groups-changed"
let migrateDurableGroups = false

export function navigationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultGroups: NavigationGroup[] = [
  {
    id: "quick",
    name: "Quick",
    items: [
      { id: "quick-github", title: "Quick GitHub", url: "https://github.com/haessen1998/Quick", icon: "", description: "源码、Issue 与版本发布", list: "", size: "2x2" },
      { id: "wails-docs", title: "Wails 3", url: "https://v3.wails.io/", icon: "", description: "Wails 3 官方文档", list: "", size: "4x2" },
    ],
  },
  {
    id: "other",
    name: "Other",
    items: [],
  },
]

function addOtherGroup(groups: NavigationGroup[]) {
  if (groups.some((group) => group.name.trim().toLocaleLowerCase() === "other")) return groups
  return [...groups, { id: navigationId("group"), name: "Other", items: [] }]
}

function migrateLocalGroups(groups: NavigationGroup[]) {
  if (typeof window === "undefined") return groups
  const version = Number(window.localStorage.getItem(SCHEMA_VERSION_KEY) ?? 0)
  if (version >= CURRENT_SCHEMA_VERSION) return groups
  window.localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
  migrateDurableGroups = true
  return addOtherGroup(groups)
}

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
  return migrateLocalGroups(parseNavigationGroups(window.localStorage.getItem(STORAGE_KEY)) ?? defaultGroups)
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
        return [{ id: value.id, title: value.title, url: value.url, icon: typeof value.icon === "string" ? value.icon : "", description: typeof value.description === "string" ? value.description : "", list: typeof value.list === "string" ? value.list : "", size: isNavigationSize(value.size) ? value.size : "2x2" }]
      })
      return [{ id: raw.id, name: raw.name, items }]
    })
    return groups
  } catch {
    return null
  }
}

export function parseNavigationGroupsPayload(value: unknown): NavigationGroup[] | null {
  if (typeof value === "string") return parseNavigationGroups(value)
  try { return parseNavigationGroups(JSON.stringify(value)) } catch { return null }
}

export function saveNavigationGroups(groups: NavigationGroup[]) {
  const serialized = JSON.stringify(groups)
  const previous = window.localStorage.getItem(STORAGE_KEY)
  if (previous && previous !== serialized) window.localStorage.setItem(`${STORAGE_KEY}-backup`, previous)
  window.localStorage.setItem(STORAGE_KEY, serialized)
}

export function publishNavigationGroups(groups: NavigationGroup[]) {
  saveNavigationGroups(groups)
  window.dispatchEvent(new CustomEvent(NAVIGATION_GROUPS_CHANGED_EVENT, { detail: groups }))
}

export async function hydrateNavigationGroups(fallback: NavigationGroup[]) {
  try {
    const durable = await loadPersistentConfig("navigation-groups")
    const groups = parseNavigationGroups(durable)
    if (groups) return migrateDurableGroups ? addOtherGroup(groups) : groups
    await savePersistentConfig("navigation-groups", fallback)
  } catch (error) {
    console.warn("Unable to hydrate durable navigation groups", error)
  }
  return fallback
}

export async function persistNavigationGroups(groups: NavigationGroup[]) {
  await savePersistentConfig("navigation-groups", groups)
}

const CSV_HEADERS = ["group", "list", "title", "url", "icon", "description", "size"] as const

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function parseCSVRows(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ",") { row.push(field); field = "" }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = "" }
    else if (character !== "\r") field += character
  }
  if (quoted) throw new Error("CSV 中存在未闭合的双引号")
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((values) => values.some((value) => value.trim()))
}

export function navigationGroupsToCSV(groups: NavigationGroup[]) {
  const rows = groups.flatMap((group) => group.items.map((item) => [group.name, item.list, item.title, item.url, item.icon, item.description, item.size]))
  return `\uFEFF${[CSV_HEADERS, ...rows].map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n")}`
}

export function navigationCSVTemplate() {
  const example = [{ id: "template", name: "Quick", items: [{ id: "template-site", title: "Quick GitHub", url: "https://github.com/haessen1998/Quick", icon: "", description: "源码、Issue 与版本发布", list: "开发资源", size: "2x2" as const }] }]
  return navigationGroupsToCSV(example)
}

export function parseNavigationCSV(input: string) {
  const rows = parseCSVRows(input.replace(/^\uFEFF/, ""))
  if (!rows.length) throw new Error("CSV 文件为空")
  const headers = rows[0].map((value) => value.trim().toLocaleLowerCase())
  for (const required of ["group", "title", "url"]) if (!headers.includes(required)) throw new Error(`CSV 缺少 ${required} 列`)
  const column = (row: string[], name: string) => row[headers.indexOf(name)]?.trim() ?? ""
  const groups: NavigationGroup[] = []
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const groupName = column(row, "group") || "Other"
    const title = column(row, "title")
    const rawURL = column(row, "url")
    if (!title || !rawURL) throw new Error(`第 ${index + 1} 行需要填写 title 和 url`)
    const rawSize = column(row, "size")
    const size: NavigationCardSize = rawSize === "1x1" || rawSize === "4x2" ? rawSize : "2x2"
    let group = groups.find((item) => item.name.toLocaleLowerCase() === groupName.toLocaleLowerCase())
    if (!group) { group = { id: navigationId("group"), name: groupName, items: [] }; groups.push(group) }
    group.items.push({ id: navigationId("site"), title, url: normalizeNavigationURL(rawURL), icon: column(row, "icon"), description: column(row, "description"), list: column(row, "list"), size })
  }
  if (!groups.length) throw new Error("CSV 中没有可导入的站点")
  return groups
}

export function mergeNavigationGroups(current: NavigationGroup[], incoming: NavigationGroup[]) {
  const merged = current.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }))
  for (const source of incoming) {
    let target = merged.find((group) => group.name.toLocaleLowerCase() === source.name.toLocaleLowerCase())
    if (!target) { merged.push({ ...source, items: source.items.map((item) => ({ ...item })) }); continue }
    for (const item of source.items) {
      const existingIndex = target.items.findIndex((candidate) => candidate.url.toLocaleLowerCase() === item.url.toLocaleLowerCase())
      if (existingIndex >= 0) target.items[existingIndex] = { ...item, id: target.items[existingIndex].id }
      else target.items.push({ ...item })
    }
  }
  return merged
}

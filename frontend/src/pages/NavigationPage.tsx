import { useEffect, useMemo, useRef, useState } from "react"
import { Browser, Events } from "@wailsio/runtime"
import * as NavigationService from "@/../bindings/changeme/services/navigationservice"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, FolderCog, Globe2, GripVertical, ImagePlus, Layers3, LayoutGrid, Link2, Plus, Pencil, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { NAVIGATION_GROUPS_CHANGED_EVENT, automaticSiteIcon, hydrateNavigationGroups, loadNavigationGroups, navigationId, normalizeNavigationURL, parseNavigationGroupsPayload, persistNavigationGroups, publishNavigationGroups, saveNavigationGroups, type NavigationCardSize, type NavigationGroup, type NavigationItem } from "@/lib/navigation-sites"
import { cn } from "@/lib/utils"

const sizeClasses: Record<NavigationCardSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x2": "col-span-2 row-span-2",
  "4x2": "col-span-4 row-span-2",
}

type ItemEditor = { groupId: string; value: NavigationItem; isNew: boolean }
type PendingDelete = { kind: "group" | "item"; groupId: string; itemId?: string; name: string }

function saveItemToGroup(groups: NavigationGroup[], targetGroupId: string, value: NavigationItem, isNew: boolean) {
  if (!groups.some((group) => group.id === targetGroupId)) return groups
  return groups.map((group) => {
    if (group.id === targetGroupId) {
      const existingIndex = group.items.findIndex((item) => item.id === value.id)
      if (existingIndex < 0) return { ...group, items: [...group.items, value] }
      const items = [...group.items]
      items[existingIndex] = value
      return { ...group, items }
    }
    if (!isNew && group.items.some((item) => item.id === value.id)) {
      return { ...group, items: group.items.filter((item) => item.id !== value.id) }
    }
    return group
  })
}

function emptyItem(): NavigationItem {
  return { id: navigationId("site"), title: "", url: "https://", icon: "", description: "", list: "", size: "2x2" }
}

function siteHost(url: string) {
  try { return new URL(normalizeNavigationURL(url)).hostname } catch { return url }
}

function SiteIcon({ item, className }: { item: NavigationItem; className?: string }) {
  const source = item.icon || automaticSiteIcon(item.url)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [source])
  if (!source || failed) return <span className={cn("flex size-full items-center justify-center", className)}>{item.title.trim().slice(0, 1).toUpperCase() || "?"}</span>
  return <img src={source} alt="" className={cn("size-full object-cover", className)} onError={() => setFailed(true)} />
}

async function localIconDataURL(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件")
  if (file.size > 5 * 1024 * 1024) throw new Error("图片不能超过 5 MB")
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("读取本地图片失败"))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error("无法解析这张图片"))
    element.src = source
  })
  const edge = 256
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("当前环境无法处理图片")
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL("image/webp", 0.9)
}

async function discoverSiteIcon(url: string) {
  try {
    return await NavigationService.DiscoverSiteIcon(normalizeNavigationURL(url))
  } catch {
    return automaticSiteIcon(url)
  }
}

function SortableCard({ item, onEdit }: { item: NavigationItem; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const open = async () => {
    try { await Browser.OpenURL(normalizeNavigationURL(item.url)) } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
  }
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group relative min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm transition-[box-shadow,border-color,opacity] hover:border-primary/40 hover:shadow-md", sizeClasses[item.size], isDragging && "z-20 opacity-60 shadow-xl")}>
      <button type="button" className={cn("app-interactive flex size-full min-w-0 flex-col text-left", item.size === "1x1" ? "items-center justify-center p-2" : "items-start justify-between p-2.5")} onClick={open} title={item.url}>
        <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary", item.size === "1x1" ? "size-7 text-xs" : "size-9 text-sm")}>
          <SiteIcon item={item} />
        </span>
        {item.size !== "1x1" && <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{item.title}</span>{item.size === "4x2" && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">{item.description || siteHost(item.url)}</span>}</span>}
      </button>
      <div className="absolute right-1.5 top-1.5 flex rounded-md border bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" className="app-interactive flex size-7 items-center justify-center text-muted-foreground hover:text-foreground" onClick={onEdit} aria-label={`编辑 ${item.title}`}><Pencil className="size-3.5" /></button>
        <button type="button" className="app-interactive flex size-7 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label={`拖动 ${item.title}`} {...attributes} {...listeners}><GripVertical className="size-3.5" /></button>
      </div>
    </article>
  )
}

export default function NavigationPage() {
  const [groups, setGroups] = useState<NavigationGroup[]>(loadNavigationGroups)
  const [activeGroupId, setActiveGroupId] = useState("all")
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [groupEditor, setGroupEditor] = useState<{ id?: string; name: string; position: number } | null>(null)
  const [itemEditor, setItemEditor] = useState<ItemEditor | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [persistentConfigReady, setPersistentConfigReady] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    let cancelled = false
    hydrateNavigationGroups(groups).then((savedGroups) => {
      if (cancelled) return
      setGroups(savedGroups)
      setPersistentConfigReady(true)
    })
    return () => { cancelled = true }
    // Initial WebView value is intentionally captured once for migration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveNavigationGroups(groups)
    if (persistentConfigReady) void persistNavigationGroups(groups).catch((error) => console.warn("Unable to persist navigation groups", error))
  }, [groups, persistentConfigReady])

  useEffect(() => {
    const update = (event: Event) => setGroups((event as CustomEvent<NavigationGroup[]>).detail)
    window.addEventListener(NAVIGATION_GROUPS_CHANGED_EVENT, update)
    return () => window.removeEventListener(NAVIGATION_GROUPS_CHANGED_EVENT, update)
  }, [])

  useEffect(() => Events.On("navigation-groups-changed", (event: any) => {
    const updated = parseNavigationGroupsPayload(event?.data)
    if (updated) publishNavigationGroups(updated)
  }), [])

  const itemLocation = useMemo(() => {
    const locations = new Map<string, { groupId: string; index: number }>()
    for (const group of groups) group.items.forEach((item, index) => locations.set(item.id, { groupId: group.id, index }))
    return locations
  }, [groups])

  const visibleItems = useMemo(() => activeGroupId === "all"
    ? groups.flatMap((group) => group.items)
    : groups.find((group) => group.id === activeGroupId)?.items ?? [], [activeGroupId, groups])
  const activeGroup = groups.find((group) => group.id === activeGroupId)
  const visibleGroupBlocks = useMemo(() => {
    const visibleGroups = activeGroupId === "all" ? groups : groups.filter((group) => group.id === activeGroupId)
    return visibleGroups.filter((group) => group.items.length > 0).map((group) => {
      const sections: { key: string; name: string; items: NavigationItem[] }[] = []
      const ungrouped = group.items.filter((item) => !item.list.trim())
      if (ungrouped.length) sections.push({ key: "ungrouped", name: "", items: ungrouped })
      for (const item of group.items) {
        const name = item.list.trim()
        if (!name) continue
        const key = name.toLocaleLowerCase()
        const section = sections.find((value) => value.key === key)
        if (section) section.items.push(item)
        else sections.push({ key, name, items: [item] })
      }
      return { group, sections }
    })
  }, [activeGroupId, groups])
  const availableLists = useMemo(() => {
    const values = new Map<string, string>()
    const group = groups.find((value) => value.id === itemEditor?.groupId)
    for (const item of group?.items ?? []) {
      const name = item.list.trim()
      if (name && !values.has(name.toLocaleLowerCase())) values.set(name.toLocaleLowerCase(), name)
    }
    return [...values.values()]
  }, [groups, itemEditor?.groupId])

  useEffect(() => {
    if (activeGroupId !== "all" && !groups.some((group) => group.id === activeGroupId)) setActiveGroupId("all")
  }, [activeGroupId, groups])

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = itemLocation.get(String(active.id))
    const to = itemLocation.get(String(over.id))
    if (!from || !to) return
    setGroups((current) => {
      if (from.groupId === to.groupId) return current.map((group) => group.id === from.groupId ? { ...group, items: arrayMove(group.items, from.index, to.index) } : group)
      const moving = current.find((group) => group.id === from.groupId)?.items[from.index]
      if (!moving) return current
      return current.map((group) => {
        if (group.id === from.groupId) return { ...group, items: group.items.filter((item) => item.id !== moving.id) }
        if (group.id === to.groupId) { const items = [...group.items]; items.splice(to.index, 0, moving); return { ...group, items } }
        return group
      })
    })
  }

  const saveGroup = () => {
    if (!groupEditor?.name.trim()) return toast.error("请输入分组名称")
    setGroups((current) => {
      if (!groupEditor.id) {
        const next = [...current]
        next.splice(Math.min(Math.max(groupEditor.position, 0), next.length), 0, { id: navigationId("group"), name: groupEditor.name.trim(), items: [] })
        return next
      }
      const originalIndex = current.findIndex((group) => group.id === groupEditor.id)
      if (originalIndex < 0) return current
      const next = [...current]
      const [edited] = next.splice(originalIndex, 1)
      next.splice(Math.min(Math.max(groupEditor.position, 0), next.length), 0, { ...edited, name: groupEditor.name.trim() })
      return next
    })
    setGroupEditor(null)
  }

  const editGroup = (group?: NavigationGroup) => {
    setGroupEditor(group
      ? { id: group.id, name: group.name, position: Math.max(0, groups.findIndex((item) => item.id === group.id)) }
      : { name: "", position: groups.length })
  }

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    setGroups((current) => arrayMove(current, index, target))
  }

  const openNewItem = () => {
    const group = activeGroup ?? groups[0]
    if (!group) { setGroupManagerOpen(true); return }
    setItemEditor({ groupId: group.id, value: emptyItem(), isNew: true })
  }

  const saveItem = async () => {
    if (!itemEditor) return
    try {
      const url = normalizeNavigationURL(itemEditor.value.url)
      const configuredIcon = itemEditor.value.icon.trim()
      const value = { ...itemEditor.value, title: itemEditor.value.title.trim(), url, icon: configuredIcon || await discoverSiteIcon(url), description: itemEditor.value.description.trim(), list: itemEditor.value.list.trim() }
      if (!value.title) throw new Error("请输入站点名称")
      setGroups((current) => saveItemToGroup(current, itemEditor.groupId, value, itemEditor.isNew))
      setItemEditor(null)
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
  }

  const updateItem = (changes: Partial<NavigationItem>) => {
    setItemEditor((current) => current ? { ...current, value: { ...current.value, ...changes } } : current)
  }

  const chooseLocalIcon = async (file: File | undefined) => {
    if (!file) return
    setIconBusy(true)
    try {
      updateItem({ icon: await localIconDataURL(file) })
      toast.success("已使用本地图片，并压缩到导航配置中")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setIconBusy(false)
      if (iconInputRef.current) iconInputRef.current.value = ""
    }
  }

  const discoverEditorIcon = async (quiet = false) => {
    if (!itemEditor) return
    setIconBusy(true)
    try {
      const icon = await discoverSiteIcon(itemEditor.value.url)
      if (icon) updateItem({ icon })
      if (!quiet) toast.success(icon ? "已获取站点图标" : "没有找到可用图标")
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setIconBusy(false)
    }
  }

  const removePending = () => {
    if (!pendingDelete) return
    setGroups((current) => pendingDelete.kind === "group" ? current.filter((group) => group.id !== pendingDelete.groupId) : current.map((group) => group.id === pendingDelete.groupId ? { ...group, items: group.items.filter((item) => item.id !== pendingDelete.itemId) } : group))
    setPendingDelete(null)
  }

  const locateNamedSite = (name: string) => {
    const normalized = name.trim().toLocaleLowerCase()
    const candidates = groups.flatMap((group) => group.items.map((item) => ({ group, item })))
    if (!normalized) return { match: undefined, matches: [] as typeof candidates, message: "请提供要操作的站点名称" }
    const exact = candidates.filter(({ item }) => item.title.trim().toLocaleLowerCase() === normalized)
    const matches = exact.length ? exact : candidates.filter(({ item }) => item.title.toLocaleLowerCase().includes(normalized))
    if (matches.length !== 1) return { match: undefined, matches, message: matches.length ? "匹配到多个站点，请提供更准确的名称" : "没有找到匹配站点" }
    return { match: matches[0], matches, message: "" }
  }

  const resolveGroup = (name: unknown, fallback?: NavigationGroup) => {
    const normalized = String(name ?? "").trim().toLocaleLowerCase()
    if (!normalized) return fallback ?? groups[0]
    return groups.find((group) => group.name.trim().toLocaleLowerCase() === normalized)
  }

  const assistantItem = (values: Record<string, unknown>) => ({
    ...emptyItem(),
    title: String(values.title ?? ""),
    url: String(values.url ?? "https://"),
    icon: String(values.icon ?? ""),
    description: String(values.description ?? ""),
    list: String(values.list ?? ""),
    size: (["1x1", "2x2", "4x2"].includes(String(values.size)) ? String(values.size) : "2x2") as NavigationCardSize,
  })

  const prepareNewSite = (values: Record<string, unknown>) => {
    const group = resolveGroup(values.group)
    if (!group) return { success: false, executed: false, message: String(values.group ?? "").trim() ? "没有找到指定的导航分组" : "请先创建一个导航分组" }
    setItemEditor({ groupId: group.id, value: assistantItem(values), isNew: true })
    return { success: true, executed: false, prepared: true, group: group.name, message: "已打开新增站点表单，请用户检查后保存" }
  }

  const openNamedSite = async (name: string) => {
    const result = locateNamedSite(name)
    if (!result.match) return { success: false, executed: false, matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`), message: result.message }
    await Browser.OpenURL(normalizeNavigationURL(result.match.item.url))
    return { success: true, executed: true, group: result.match.group.name, title: result.match.item.title, url: result.match.item.url }
  }

  const updateNamedSite = (values: Record<string, unknown>, moveOnly = false) => {
    const result = locateNamedSite(String(values.name ?? ""))
    if (!result.match) return { success: false, executed: false, matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`), message: result.message }
    const { group: sourceGroup, item: sourceItem } = result.match
    const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key)
    const targetGroup = has("group") ? resolveGroup(values.group, sourceGroup) : sourceGroup
    if (!targetGroup) return { success: false, executed: false, message: `没有找到导航分组“${String(values.group ?? "")}”` }
    if (moveOnly && !has("group") && !has("list")) return { success: false, executed: false, message: "移动站点时请提供目标 group 或 list" }
    if (!moveOnly && !["title", "url", "icon", "description", "size", "group", "list"].some(has)) return { success: false, executed: false, message: "请至少提供一项要修改的内容" }

    const next = { ...sourceItem }
    if (has("title")) next.title = String(values.title ?? "").trim()
    if (!next.title) return { success: false, executed: false, message: "站点标题不能为空" }
    if (has("url")) {
      try { next.url = normalizeNavigationURL(String(values.url ?? "")) } catch (error) { return { success: false, executed: false, message: error instanceof Error ? error.message : String(error) } }
      if (!has("icon")) next.icon = ""
    }
    if (has("icon")) next.icon = String(values.icon ?? "").trim()
    if (has("description")) next.description = String(values.description ?? "").trim()
    if (has("list")) next.list = String(values.list ?? "").trim()
    if (has("size")) {
      const size = String(values.size)
      if (!["1x1", "2x2", "4x2"].includes(size)) return { success: false, executed: false, message: "卡片尺寸只支持 1x1、2x2 或 4x2" }
      next.size = size as NavigationCardSize
    }

    if (!values.operationAutoApproved) {
      setItemEditor({ groupId: targetGroup.id, value: next, isNew: false })
      return { success: true, executed: false, prepared: true, message: "已打开站点编辑表单，请用户检查后保存" }
    }
    setGroups((current) => saveItemToGroup(current, targetGroup.id, next, false))
    return { success: true, executed: true, previous: { title: sourceItem.title, group: sourceGroup.name, list: sourceItem.list }, site: { title: next.title, group: targetGroup.name, list: next.list } }
  }

  useAssistantCapability({
    page: "navigation",
    getContext: () => ({ groups: groups.map((group) => ({ name: group.name, lists: [...new Set(group.items.map((item) => item.list.trim()).filter(Boolean))], items: group.items.map((item) => ({ title: item.title, url: item.url, description: item.description, list: item.list, size: item.size })) })) }),
    actions: {
      list: () => ({ success: true, groups: groups.map((group) => ({ name: group.name, lists: [...new Set(group.items.map((item) => item.list.trim()).filter(Boolean))], sites: group.items.map((item) => ({ title: item.title, url: item.url, description: item.description, list: item.list, size: item.size })) })) }),
      open: (values) => openNamedSite(String(values.name ?? "")),
      prepare: (values) => prepareNewSite(values),
      add: (values) => {
        if (!values.operationAutoApproved) return prepareNewSite(values)
        const group = resolveGroup(values.group)
        if (!group) return { success: false, executed: false, message: String(values.group ?? "").trim() ? "没有找到指定的导航分组" : "没有可用分组" }
        const item = assistantItem(values)
        item.title = item.title.trim()
        item.description = item.description.trim()
        item.list = item.list.trim()
        item.icon = item.icon.trim()
        if (!item.title) return { success: false, executed: false, message: "站点名称不能为空" }
        try { item.url = normalizeNavigationURL(item.url) } catch (error) { return { success: false, executed: false, message: error instanceof Error ? error.message : String(error) } }
        setGroups((current) => current.map((value) => value.id === group.id ? { ...value, items: [...value.items, item] } : value))
        return { success: true, executed: true, group: group.name, list: item.list, site: item.title }
      },
      update: (values) => updateNamedSite(values),
      move: (values) => updateNamedSite(values, true),
      delete: (values) => {
        const result = locateNamedSite(String(values.name ?? ""))
        if (!result.match) return { success: false, executed: false, matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`), message: result.message }
        const { group, item } = result.match
        if (!values.operationAutoApproved) {
          setPendingDelete({ kind: "item", groupId: group.id, itemId: item.id, name: item.title })
          return { success: true, executed: false, prepared: true, requiresConfirmation: true, message: "已打开删除确认框，等待用户确认" }
        }
        setGroups((current) => current.map((value) => value.id === group.id ? { ...value, items: value.items.filter((candidate) => candidate.id !== item.id) } : value))
        return { success: true, executed: true, group: group.name, site: item.title }
      },
    },
  })

  return (
    <section className="page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="mr-auto"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />快捷入口</div><h1 className="text-3xl font-semibold tracking-tight">站点导航</h1><p className="mt-2 text-sm text-muted-foreground">使用一级 Tab 与可选 list 小组整理站点，拖动卡片调整顺序。</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setGroupManagerOpen(true)}><FolderCog />分组管理</Button><Button onClick={openNewItem} disabled={!groups.length}><Plus />新增站点</Button></div>
        </div>

        <div className="mb-5 flex min-w-0 items-end gap-1 overflow-x-auto border-b" role="tablist" aria-label="导航分组">
          <button type="button" role="tab" tabIndex={activeGroupId === "all" ? 0 : -1} aria-selected={activeGroupId === "all"} className={cn("app-interactive relative shrink-0 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground", activeGroupId === "all" && "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary")} onClick={() => setActiveGroupId("all")}>All <span className="ml-1 text-[11px] text-muted-foreground">{groups.reduce((count, group) => count + group.items.length, 0)}</span></button>
          {groups.map((group) => <button key={group.id} type="button" role="tab" tabIndex={activeGroupId === group.id ? 0 : -1} aria-selected={activeGroupId === group.id} className={cn("app-interactive relative shrink-0 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground", activeGroupId === group.id && "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary")} onClick={() => setActiveGroupId(group.id)}>{group.name} <span className="ml-1 text-[11px] text-muted-foreground">{group.items.length}</span></button>)}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <div className="space-y-8">
            {visibleGroupBlocks.map(({ group, sections }) => <section key={group.id} className="min-w-0 space-y-5">
              {activeGroupId === "all" && <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutGrid className="size-4" /></span><span className="font-semibold">{group.name}</span><span className="text-xs text-muted-foreground">{group.items.length}</span><span className="h-px min-w-6 flex-1 bg-border/70" /></div>}
              {sections.map((section) => <div key={`${group.id}-${section.key}`} className="min-w-0">
                {section.name && <div className="mb-3 flex items-center gap-2 text-sm"><span className="flex size-7 items-center justify-center rounded-lg bg-muted/55 text-muted-foreground"><Layers3 className="size-3.5" /></span><span className="font-medium">{section.name}</span><span className="text-xs text-muted-foreground">{section.items.length}</span><span className="h-px min-w-6 flex-1 bg-border/70" /></div>}
                <SortableContext items={section.items.map((item) => item.id)}>
                  <div className="grid auto-rows-[4rem] grid-cols-[repeat(auto-fill,4rem)] grid-flow-row-dense justify-start gap-3">
                    {section.items.map((item) => {
                      const location = itemLocation.get(item.id)
                      if (!location) return null
                      return <SortableCard key={item.id} item={item} onEdit={() => setItemEditor({ groupId: location.groupId, value: { ...item }, isNew: false })} />
                    })}
                  </div>
                </SortableContext>
              </div>)}
            </section>)}
            {!visibleItems.length && <div className="grid auto-rows-[4rem] grid-cols-[repeat(auto-fill,4rem)] justify-start gap-3"><button type="button" className="app-interactive col-span-4 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/30" onClick={openNewItem}>{groups.length ? `向${activeGroup ? `“${activeGroup.name}”` : "导航"}添加第一个站点` : "先创建一个分组"}</button></div>}
          </div>
        </DndContext>
      </div>

      <Dialog open={groupManagerOpen} onOpenChange={setGroupManagerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>分组管理</DialogTitle><DialogDescription>管理作为一级 Tab 显示的导航分组；删除分组也会删除其中的站点。</DialogDescription></DialogHeader>
          <div className="space-y-2 p-5">
            {groups.map((group, index) => <div key={group.id} className="flex items-center gap-2 rounded-lg border bg-muted/15 px-3 py-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><LayoutGrid className="size-4 text-muted-foreground" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{group.name}</span><span className="text-[11px] text-muted-foreground">{group.items.length} 个站点 · 第 {index + 1} 组</span></span><Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveGroup(index, -1)} aria-label={`上移 ${group.name}`}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)} aria-label={`下移 ${group.name}`}><ArrowDown /></Button><Button variant="ghost" size="icon-sm" onClick={() => editGroup(group)} aria-label={`编辑 ${group.name}`}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete({ kind: "group", groupId: group.id, name: group.name })} aria-label={`删除 ${group.name}`}><Trash2 /></Button></div>)}
            {!groups.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">还没有导航分组</div>}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">完成</Button></DialogClose><Button onClick={() => editGroup()}><Plus />新增分组</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(groupEditor)} onOpenChange={(open) => !open && setGroupEditor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{groupEditor?.id ? "编辑分组" : "新增分组"}</DialogTitle><DialogDescription>修改分组名称和显示顺序，站点可在编辑页面切换所属分组。</DialogDescription></DialogHeader>
          {groupEditor && <div className="space-y-5 p-5">
            <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-primary/[0.08] to-muted/20 p-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm"><FolderCog className="size-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{groupEditor.name.trim() || "未命名分组"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{groupEditor.id ? `${groups.find((group) => group.id === groupEditor.id)?.items.length ?? 0} 个站点` : "保存后即可添加站点"}</span></span></div>
            <label className="block space-y-1.5 text-xs font-medium"><span>分组名称</span><input autoFocus className="app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" value={groupEditor.name} onChange={(event) => setGroupEditor({ ...groupEditor, name: event.target.value })} placeholder="例如 Quick、设计资源" /></label>
            <label className="block space-y-1.5 text-xs font-medium"><span>显示顺序</span><select className="app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" value={groupEditor.position} onChange={(event) => setGroupEditor({ ...groupEditor, position: Number(event.target.value) })}>{Array.from({ length: groupEditor.id ? groups.length : groups.length + 1 }, (_, index) => <option key={index} value={index}>第 {index + 1} 个</option>)}</select><span className="block font-normal leading-4 text-muted-foreground">也可以在分组管理中使用上下箭头快速调整。</span></label>
          </div>}
          <DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button disabled={!groupEditor?.name.trim()} onClick={saveGroup}>{groupEditor?.id ? "保存修改" : "创建分组"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(itemEditor)} onOpenChange={(open) => !open && setItemEditor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{itemEditor?.isNew ? "新增站点" : "修改站点"}</DialogTitle>
            <DialogDescription>整理入口信息并预览卡片；网址会使用系统默认浏览器打开。</DialogDescription>
          </DialogHeader>
          {itemEditor && <div className="grid md:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="flex min-h-52 flex-col border-b bg-gradient-to-br from-primary/[0.08] via-muted/20 to-background p-5 md:border-b-0 md:border-r">
              <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5" />卡片预览</div>
              <div className="flex flex-1 items-center justify-center">
                <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card p-2.5 shadow-md", itemEditor.value.size === "1x1" ? "size-16 items-center justify-center" : itemEditor.value.size === "2x2" ? "size-[8.75rem] justify-between" : "h-[8.75rem] w-full justify-between")}>
                  <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary", itemEditor.value.size === "1x1" ? "size-7" : "size-9")}><SiteIcon item={itemEditor.value} /></span>
                  {itemEditor.value.size !== "1x1" && <span className="min-w-0"><span className="block truncate text-sm font-medium">{itemEditor.value.title || "站点名称"}</span>{itemEditor.value.size === "4x2" && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{itemEditor.value.description || siteHost(itemEditor.value.url) || "站点说明"}</span>}</span>}
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">自动读取页面声明的 favicon，找不到时回退到站点根目录。</p>
            </aside>

            <div className="space-y-5 p-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Link2 className="size-3.5" />基本信息</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">名称</span><input autoFocus className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder="例如 GitHub" value={itemEditor.value.title} onChange={(event) => updateItem({ title: event.target.value })} /></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">所属分组</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={itemEditor.groupId} onChange={(event) => setItemEditor({ ...itemEditor, groupId: event.target.value })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                  <label className="text-sm sm:col-span-2"><span className="mb-1.5 block text-xs font-medium">网址</span><div className="relative"><Globe2 className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><input className="app-interactive w-full rounded-lg border bg-background py-2 pl-9 pr-3 font-mono text-sm" placeholder="https://example.com" value={itemEditor.value.url} onChange={(event) => updateItem({ url: event.target.value })} onBlur={() => { if (!itemEditor.value.icon) void discoverEditorIcon(true) }} /></div></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">列表小组 <span className="font-normal text-muted-foreground">（可选）</span></span><input list="navigation-list-options" className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder="选择已有小组或输入新名称" value={itemEditor.value.list} onChange={(event) => updateItem({ list: event.target.value })} /><datalist id="navigation-list-options">{availableLists.map((name) => <option key={name.toLocaleLowerCase()} value={name} />)}</datalist><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{availableLists.length ? "可选择当前 Tab 的已有小组，也可以直接输入新名称。" : "直接输入名称即可在当前 Tab 中创建新的 list。"}</span></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">说明 <span className="font-normal text-muted-foreground">（可选）</span></span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder="描述这个入口的用途" value={itemEditor.value.description} onChange={(event) => updateItem({ description: event.target.value })} /></label>
                </div>
              </section>

              <section className="space-y-3 border-t pt-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><LayoutGrid className="size-3.5" />卡片外观</div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium">尺寸</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["1x1", "2x2", "4x2"] as NavigationCardSize[]).map((size) => <button key={size} type="button" className={cn("app-interactive rounded-lg border px-2 py-2 text-left transition-colors", itemEditor.value.size === size ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted/40")} onClick={() => updateItem({ size })}><span className="block text-xs font-medium">{size}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{size === "1x1" ? "仅图标" : size === "2x2" ? "图标与名称" : "名称与说明"}</span></button>)}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium">站点图标</span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={!itemEditor.value.icon ? "secondary" : "outline"} size="sm" disabled={iconBusy} onClick={() => void discoverEditorIcon()}><Globe2 />{iconBusy ? "正在获取…" : "自动获取"}</Button>
                    <Button type="button" variant={itemEditor.value.icon.startsWith("data:") ? "secondary" : "outline"} size="sm" disabled={iconBusy} onClick={() => iconInputRef.current?.click()}><ImagePlus />{iconBusy ? "正在处理…" : "本地图片"}</Button>
                    <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void chooseLocalIcon(event.target.files?.[0])} />
                  </div>
                  <input className="app-interactive mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder={itemEditor.value.icon.startsWith("data:") ? "已使用本地图片；输入地址可替换" : "或粘贴自定义图片 URL"} value={itemEditor.value.icon.startsWith("data:") ? "" : itemEditor.value.icon} onChange={(event) => updateItem({ icon: event.target.value })} />
                </div>
              </section>
            </div>
          </div>}
          <DialogFooter>
            {!itemEditor?.isNew && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => itemEditor && setPendingDelete({ kind: "item", groupId: itemLocation.get(itemEditor.value.id)?.groupId ?? itemEditor.groupId, itemId: itemEditor.value.id, name: itemEditor.value.title })}><Trash2 />删除</Button>}
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <Button disabled={iconBusy} onClick={() => void saveItem()}>保存站点</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>删除{pendingDelete?.kind === "group" ? "分组" : "站点"}</DialogTitle><DialogDescription>确定删除“{pendingDelete?.name}”吗？{pendingDelete?.kind === "group" ? "分组内的站点也会一并删除。" : ""}</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" onClick={() => { removePending(); setItemEditor(null) }}>删除</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}

import * as NavigationService from "@/../bindings/github.com/haessen1998/Quick/internal/navigation/navigationservice"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import {
  NAVIGATION_GROUPS_CHANGED_EVENT,
  hydrateNavigationGroups,
  loadNavigationGroups,
  navigationId,
  normalizeNavigationURL,
  parseNavigationGroupsPayload,
  persistNavigationGroups,
  publishNavigationGroups,
  saveNavigationGroups,
  type NavigationCardSize,
  type NavigationGroup,
  type NavigationItem,
} from "@/lib/navigation-sites"
import { cn } from "@/lib/utils"
import { useDraftState } from "@/lib/workspace-store"
import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Browser, Events } from "@wailsio/runtime"
import { GripVertical, Pencil } from "lucide-react"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

export const sizeClasses: Record<NavigationCardSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x2": "col-span-2 row-span-2",
  "4x2": "col-span-4 row-span-2",
}

export type ItemEditor = { groupId: string; value: NavigationItem; isNew: boolean }

export type PendingDelete = { kind: "group" | "item"; groupId: string; itemId?: string; name: string }

export function saveItemToGroup(groups: NavigationGroup[], targetGroupId: string, value: NavigationItem, isNew: boolean) {
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

export function emptyItem(): NavigationItem {
  return { id: navigationId("site"), title: "", url: "https://", icon: "", description: "", list: "", size: "2x2" }
}

export function siteHost(url: string) {
  try {
    return new URL(normalizeNavigationURL(url)).hostname
  } catch {
    return url
  }
}

export function SiteIcon({ item, className }: { item: NavigationItem; className?: string }) {
  const source = item.icon.trim()
  const [resolvedSource, setResolvedSource] = useDraftState("navigation", "resolvedSource", source.startsWith("quick-icon:") ? "" : source)
  const [failed, setFailed] = useDraftState("navigation", "failed", false)
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    if (!source.startsWith("quick-icon:")) {
      setResolvedSource(source)
      return () => {
        cancelled = true
      }
    }
    setResolvedSource("")
    NavigationService.GetCachedSiteIcon(source)
      .then((value) => {
        if (!cancelled) setResolvedSource(value)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [source])
  if (!resolvedSource || failed)
    return (
      <span className={cn("flex size-full items-center justify-center", className)}>
        {item.title.trim().slice(0, 1).toUpperCase() || "?"}
      </span>
    )
  return <img src={resolvedSource} alt="" className={cn("size-full object-cover", className)} onError={() => setFailed(true)} />
}

export async function discoverSiteIcon(url: string) {
  return NavigationService.DiscoverSiteIcon(normalizeNavigationURL(url))
}

export function SortableCard({ item, onEdit }: { item: NavigationItem; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const open = async () => {
    try {
      await Browser.OpenURL(normalizeNavigationURL(item.url))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm transition-[box-shadow,border-color,opacity] hover:border-primary/40 hover:shadow-md",
        sizeClasses[item.size],
        isDragging && "z-20 opacity-60 shadow-xl",
      )}
    >
      <button
        type="button"
        className={cn(
          "app-interactive flex size-full min-w-0 flex-col text-left",
          item.size === "1x1" ? "items-center justify-center p-2" : "items-start justify-between p-2.5",
        )}
        onClick={open}
        title={item.url}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary",
            item.size === "1x1" ? "size-7 text-xs" : "size-9 text-sm",
          )}
        >
          <SiteIcon item={item} />
        </span>
        {item.size !== "1x1" && (
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{item.title}</span>
            {item.size === "4x2" && (
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                {item.description || siteHost(item.url)}
              </span>
            )}
          </span>
        )}
      </button>
      <div className="absolute right-1.5 top-1.5 flex rounded-md border bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          className="app-interactive flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`编辑 ${item.title}`}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          className="app-interactive flex size-7 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`拖动 ${item.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>
    </article>
  )
}

function useNavigationPageModel() {
  const [groups, setGroups] = useDraftState<NavigationGroup[]>("navigation", "groups", loadNavigationGroups)
  const [activeGroupId, setActiveGroupId] = useDraftState("navigation", "activeGroupId", "all")
  const [groupManagerOpen, setGroupManagerOpen] = useDraftState("navigation", "groupManagerOpen", false)
  const [groupEditor, setGroupEditor] = useState<{ id?: string; name: string; position: number } | null>(null)
  const [itemEditor, setItemEditor] = useDraftState<ItemEditor | null>("navigation", "itemEditor", null)
  const [pendingDelete, setPendingDelete] = useDraftState<PendingDelete | null>("navigation", "pendingDelete", null)
  const [persistentConfigReady, setPersistentConfigReady] = useDraftState("navigation", "persistentConfigReady", false)
  const [iconBusy, setIconBusy] = useDraftState("navigation", "iconBusy", false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    let cancelled = false
    hydrateNavigationGroups(groups).then((savedGroups) => {
      if (cancelled) return
      setGroups(savedGroups)
      setPersistentConfigReady(true)
    })
    return () => {
      cancelled = true
    }
    // Initial WebView value is intentionally captured once for migration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveNavigationGroups(groups)
    if (persistentConfigReady)
      void persistNavigationGroups(groups).catch((error) => console.warn("Unable to persist navigation groups", error))
  }, [groups, persistentConfigReady])

  useEffect(() => {
    const update = (event: Event) => setGroups((event as CustomEvent<NavigationGroup[]>).detail)
    window.addEventListener(NAVIGATION_GROUPS_CHANGED_EVENT, update)
    return () => window.removeEventListener(NAVIGATION_GROUPS_CHANGED_EVENT, update)
  }, [])

  useEffect(
    () =>
      Events.On("navigation-groups-changed", (event: any) => {
        const updated = parseNavigationGroupsPayload(event?.data)
        if (updated) publishNavigationGroups(updated)
      }),
    [],
  )

  const itemLocation = useMemo(() => {
    const locations = new Map<string, { groupId: string; index: number }>()
    for (const group of groups) group.items.forEach((item, index) => locations.set(item.id, { groupId: group.id, index }))
    return locations
  }, [groups])

  const visibleItems = useMemo(
    () =>
      activeGroupId === "all" ? groups.flatMap((group) => group.items) : (groups.find((group) => group.id === activeGroupId)?.items ?? []),
    [activeGroupId, groups],
  )
  const activeGroup = groups.find((group) => group.id === activeGroupId)
  const visibleGroupBlocks = useMemo(() => {
    const visibleGroups = activeGroupId === "all" ? groups : groups.filter((group) => group.id === activeGroupId)
    return visibleGroups
      .filter((group) => group.items.length > 0)
      .map((group) => {
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
      if (from.groupId === to.groupId)
        return current.map((group) =>
          group.id === from.groupId ? { ...group, items: arrayMove(group.items, from.index, to.index) } : group,
        )
      const moving = current.find((group) => group.id === from.groupId)?.items[from.index]
      if (!moving) return current
      return current.map((group) => {
        if (group.id === from.groupId) return { ...group, items: group.items.filter((item) => item.id !== moving.id) }
        if (group.id === to.groupId) {
          const items = [...group.items]
          items.splice(to.index, 0, moving)
          return { ...group, items }
        }
        return group
      })
    })
  }

  const saveGroup = () => {
    if (!groupEditor?.name.trim()) return toast.error("请输入分组名称")
    setGroups((current) => {
      if (!groupEditor.id) {
        const next = [...current]
        next.splice(Math.min(Math.max(groupEditor.position, 0), next.length), 0, {
          id: navigationId("group"),
          name: groupEditor.name.trim(),
          items: [],
        })
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
    setGroupEditor(
      group
        ? {
            id: group.id,
            name: group.name,
            position: Math.max(
              0,
              groups.findIndex((item) => item.id === group.id),
            ),
          }
        : { name: "", position: groups.length },
    )
  }

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    setGroups((current) => arrayMove(current, index, target))
  }

  const openNewItem = () => {
    const group = activeGroup ?? groups[0]
    if (!group) {
      setGroupManagerOpen(true)
      return
    }
    setItemEditor({ groupId: group.id, value: emptyItem(), isNew: true })
  }

  const saveItem = async () => {
    if (!itemEditor) return
    try {
      const url = normalizeNavigationURL(itemEditor.value.url)
      const value = {
        ...itemEditor.value,
        title: itemEditor.value.title.trim(),
        url,
        icon: itemEditor.value.icon.trim(),
        description: itemEditor.value.description.trim(),
        list: itemEditor.value.list.trim(),
      }
      if (!value.title) throw new Error("请输入站点名称")
      setGroups((current) => saveItemToGroup(current, itemEditor.groupId, value, itemEditor.isNew))
      setItemEditor(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const updateItem = (changes: Partial<NavigationItem>) => {
    setItemEditor((current) => (current ? { ...current, value: { ...current.value, ...changes } } : current))
  }

  const chooseLocalIcon = async () => {
    setIconBusy(true)
    try {
      const icon = await NavigationService.ImportLocalIcon()
      if (!icon) return
      updateItem({ icon })
      toast.success("已验证并缓存本地图片")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setIconBusy(false)
    }
  }

  const discoverEditorIcon = async () => {
    if (!itemEditor) return
    setIconBusy(true)
    try {
      const icon = await discoverSiteIcon(itemEditor.value.url)
      if (icon) updateItem({ icon })
      toast.success("已验证并缓存站点图标")
    } catch (error) {
      toast.error("没有找到有效的站点图标", { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setIconBusy(false)
    }
  }

  const removePending = () => {
    if (!pendingDelete) return
    setGroups((current) =>
      pendingDelete.kind === "group"
        ? current.filter((group) => group.id !== pendingDelete.groupId)
        : current.map((group) =>
            group.id === pendingDelete.groupId
              ? { ...group, items: group.items.filter((item) => item.id !== pendingDelete.itemId) }
              : group,
          ),
    )
    setPendingDelete(null)
  }

  const locateNamedSite = (name: string) => {
    const normalized = name.trim().toLocaleLowerCase()
    const candidates = groups.flatMap((group) => group.items.map((item) => ({ group, item })))
    if (!normalized) return { match: undefined, matches: [] as typeof candidates, message: "请提供要操作的站点名称" }
    const exact = candidates.filter(({ item }) => item.title.trim().toLocaleLowerCase() === normalized)
    const matches = exact.length ? exact : candidates.filter(({ item }) => item.title.toLocaleLowerCase().includes(normalized))
    if (matches.length !== 1)
      return { match: undefined, matches, message: matches.length ? "匹配到多个站点，请提供更准确的名称" : "没有找到匹配站点" }
    return { match: matches[0], matches, message: "" }
  }

  const resolveGroup = (name: unknown, fallback?: NavigationGroup) => {
    const normalized = String(name ?? "")
      .trim()
      .toLocaleLowerCase()
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
    if (!group)
      return {
        success: false,
        executed: false,
        message: String(values.group ?? "").trim() ? "没有找到指定的导航分组" : "请先创建一个导航分组",
      }
    setItemEditor({ groupId: group.id, value: assistantItem(values), isNew: true })
    return { success: true, executed: false, prepared: true, group: group.name, message: "已打开新增站点表单，请用户检查后保存" }
  }

  const openNamedSite = async (name: string) => {
    const result = locateNamedSite(name)
    if (!result.match)
      return {
        success: false,
        executed: false,
        matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`),
        message: result.message,
      }
    await Browser.OpenURL(normalizeNavigationURL(result.match.item.url))
    return { success: true, executed: true, group: result.match.group.name, title: result.match.item.title, url: result.match.item.url }
  }

  const updateNamedSite = (values: Record<string, unknown>, moveOnly = false) => {
    const result = locateNamedSite(String(values.name ?? ""))
    if (!result.match)
      return {
        success: false,
        executed: false,
        matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`),
        message: result.message,
      }
    const { group: sourceGroup, item: sourceItem } = result.match
    const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key)
    const targetGroup = has("group") ? resolveGroup(values.group, sourceGroup) : sourceGroup
    if (!targetGroup) return { success: false, executed: false, message: `没有找到导航分组“${String(values.group ?? "")}”` }
    if (moveOnly && !has("group") && !has("list")) return { success: false, executed: false, message: "移动站点时请提供目标 group 或 list" }
    if (!moveOnly && !["title", "url", "icon", "description", "size", "group", "list"].some(has))
      return { success: false, executed: false, message: "请至少提供一项要修改的内容" }

    const next = { ...sourceItem }
    if (has("title")) next.title = String(values.title ?? "").trim()
    if (!next.title) return { success: false, executed: false, message: "站点标题不能为空" }
    if (has("url")) {
      try {
        next.url = normalizeNavigationURL(String(values.url ?? ""))
      } catch (error) {
        return { success: false, executed: false, message: error instanceof Error ? error.message : String(error) }
      }
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
    return {
      success: true,
      executed: true,
      previous: { title: sourceItem.title, group: sourceGroup.name, list: sourceItem.list },
      site: { title: next.title, group: targetGroup.name, list: next.list },
    }
  }

  useAssistantCapability({
    page: "navigation",
    getContext: () => ({
      groups: groups.map((group) => ({
        name: group.name,
        lists: [...new Set(group.items.map((item) => item.list.trim()).filter(Boolean))],
        items: group.items.map((item) => ({
          title: item.title,
          url: item.url,
          description: item.description,
          list: item.list,
          size: item.size,
        })),
      })),
    }),
    actions: {
      list: () => ({
        success: true,
        groups: groups.map((group) => ({
          name: group.name,
          lists: [...new Set(group.items.map((item) => item.list.trim()).filter(Boolean))],
          sites: group.items.map((item) => ({
            title: item.title,
            url: item.url,
            description: item.description,
            list: item.list,
            size: item.size,
          })),
        })),
      }),
      open: (values) => openNamedSite(String(values.name ?? "")),
      prepare: (values) => prepareNewSite(values),
      add: (values) => {
        if (!values.operationAutoApproved) return prepareNewSite(values)
        const group = resolveGroup(values.group)
        if (!group)
          return { success: false, executed: false, message: String(values.group ?? "").trim() ? "没有找到指定的导航分组" : "没有可用分组" }
        const item = assistantItem(values)
        item.title = item.title.trim()
        item.description = item.description.trim()
        item.list = item.list.trim()
        item.icon = item.icon.trim()
        if (!item.title) return { success: false, executed: false, message: "站点名称不能为空" }
        try {
          item.url = normalizeNavigationURL(item.url)
        } catch (error) {
          return { success: false, executed: false, message: error instanceof Error ? error.message : String(error) }
        }
        setGroups((current) => current.map((value) => (value.id === group.id ? { ...value, items: [...value.items, item] } : value)))
        return { success: true, executed: true, group: group.name, list: item.list, site: item.title }
      },
      "batch-update": async (input) => {
        const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key)
        const names = Array.isArray(input.names) ? input.names.map(String).filter((value) => value.trim()) : []
        if (typeof input.name === "string" && input.name.trim()) names.push(input.name)
        const listKey = has("targetList") ? "targetList" : "list"
        const result = await NavigationService.BatchUpdateSites({
          ids: Array.isArray(input.ids) ? input.ids.map(String) : undefined,
          titles: names.length ? names : undefined,
          sourceGroup: String(input.sourceGroup ?? ""),
          sourceList: String(input.sourceList ?? ""),
          matchSourceList: has("sourceList") || Boolean(input.matchSourceList),
          targetGroup: String(input.targetGroup ?? input.group ?? ""),
          targetList: String(input[listKey] ?? ""),
          setTargetList: has(listKey),
          title: String(input.title ?? ""),
          setTitle: has("title"),
          url: String(input.url ?? ""),
          setUrl: has("url"),
          icon: String(input.icon ?? ""),
          setIcon: has("icon"),
          description: String(input.description ?? ""),
          setDescription: has("description"),
          size: String(input.size ?? ""),
          setSize: has("size"),
        })
        const groups = parseNavigationGroupsPayload(result.groups)
        if (groups) publishNavigationGroups(groups)
        return { success: true, executed: true, source: "go-service", updated: result.updated, sites: result.sites }
      },
      update: (values) => updateNamedSite(values),
      move: (values) => updateNamedSite(values, true),
      delete: (values) => {
        const result = locateNamedSite(String(values.name ?? ""))
        if (!result.match)
          return {
            success: false,
            executed: false,
            matches: result.matches.map(({ group, item }) => `${group.name} / ${item.title}`),
            message: result.message,
          }
        const { group, item } = result.match
        if (!values.operationAutoApproved) {
          setPendingDelete({ kind: "item", groupId: group.id, itemId: item.id, name: item.title })
          return { success: true, executed: false, prepared: true, requiresConfirmation: true, message: "已打开删除确认框，等待用户确认" }
        }
        setGroups((current) =>
          current.map((value) =>
            value.id === group.id ? { ...value, items: value.items.filter((candidate) => candidate.id !== item.id) } : value,
          ),
        )
        return { success: true, executed: true, group: group.name, site: item.title }
      },
    },
  })

  return {
    groups,
    activeGroupId,
    setActiveGroupId,
    groupManagerOpen,
    setGroupManagerOpen,
    groupEditor,
    setGroupEditor,
    itemEditor,
    setItemEditor,
    pendingDelete,
    setPendingDelete,
    iconBusy,
    sensors,
    itemLocation,
    visibleItems,
    activeGroup,
    visibleGroupBlocks,
    availableLists,
    dragEnd,
    saveGroup,
    editGroup,
    moveGroup,
    openNewItem,
    saveItem,
    updateItem,
    chooseLocalIcon,
    discoverEditorIcon,
    removePending,
  }
}

const ModelContext = createContext<ReturnType<typeof useNavigationPageModel> | null>(null)
export function NavigationPageModelProvider(props: { children: ReactNode }) {
  const model = useNavigationPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useNavigationPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("NavigationPageModelProvider missing")
  return value
}

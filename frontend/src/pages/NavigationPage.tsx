import { useEffect, useMemo, useRef, useState } from "react"
import { Browser } from "@wailsio/runtime"
import * as NavigationService from "@/../bindings/changeme/services/navigationservice"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Globe2, GripVertical, ImagePlus, LayoutGrid, Link2, Plus, Pencil, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { automaticSiteIcon, hydrateNavigationGroups, loadNavigationGroups, navigationId, normalizeNavigationURL, persistNavigationGroups, saveNavigationGroups, type NavigationCardSize, type NavigationGroup, type NavigationItem } from "@/lib/navigation-sites"
import { cn } from "@/lib/utils"

const sizeClasses: Record<NavigationCardSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x2": "col-span-2 row-span-2",
  "4x2": "col-span-4 row-span-2",
}

type ItemEditor = { groupId: string; value: NavigationItem; isNew: boolean }
type PendingDelete = { kind: "group" | "item"; groupId: string; itemId?: string; name: string }

function emptyItem(): NavigationItem {
  return { id: navigationId("site"), title: "", url: "https://", icon: "", description: "", size: "2x2" }
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
      <button type="button" className="app-interactive flex size-full min-w-0 flex-col items-start justify-between p-3 text-left" onClick={open} title={item.url}>
        <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary", item.size === "1x1" ? "size-8 text-sm" : "size-10 text-base")}>
          <SiteIcon item={item} />
        </span>
        {item.size !== "1x1" && <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span>{item.size === "4x2" && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.description || siteHost(item.url)}</span>}</span>}
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
  const [groupEditor, setGroupEditor] = useState<{ id?: string; name: string } | null>(null)
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

  const itemLocation = useMemo(() => {
    const locations = new Map<string, { groupId: string; index: number }>()
    for (const group of groups) group.items.forEach((item, index) => locations.set(item.id, { groupId: group.id, index }))
    return locations
  }, [groups])

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
    setGroups((current) => groupEditor.id ? current.map((group) => group.id === groupEditor.id ? { ...group, name: groupEditor.name.trim() } : group) : [...current, { id: navigationId("group"), name: groupEditor.name.trim(), items: [] }])
    setGroupEditor(null)
  }

  const saveItem = async () => {
    if (!itemEditor) return
    try {
      const url = normalizeNavigationURL(itemEditor.value.url)
      const configuredIcon = itemEditor.value.icon.trim()
      const value = { ...itemEditor.value, title: itemEditor.value.title.trim(), url, icon: configuredIcon || await discoverSiteIcon(url), description: itemEditor.value.description.trim() }
      if (!value.title) throw new Error("请输入站点名称")
      setGroups((current) => current.map((group) => {
        if (group.id === itemEditor.groupId) return { ...group, items: itemEditor.isNew ? [...group.items, value] : group.items.map((item) => item.id === value.id ? value : item) }
        if (!itemEditor.isNew) return { ...group, items: group.items.filter((item) => item.id !== value.id) }
        return group
      }))
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

  const openNamedSite = async (name: string) => {
    const normalized = name.trim().toLocaleLowerCase()
    const matches = groups.flatMap((group) => group.items).filter((item) => item.title.toLocaleLowerCase().includes(normalized))
    if (matches.length !== 1) return { success: false, executed: false, matches: matches.map((item) => item.title), message: matches.length ? "匹配到多个站点，请提供更准确的名称" : "没有找到匹配站点" }
    await Browser.OpenURL(normalizeNavigationURL(matches[0].url))
    return { success: true, executed: true, title: matches[0].title, url: matches[0].url }
  }

  useAssistantCapability({
    page: "navigation",
    getContext: () => ({ groups: groups.map((group) => ({ name: group.name, items: group.items.map((item) => ({ title: item.title, url: item.url, size: item.size })) })) }),
    actions: {
      list: () => ({ success: true, groups: groups.map((group) => ({ name: group.name, sites: group.items.map((item) => ({ title: item.title, url: item.url })) })) }),
      open: (values) => openNamedSite(String(values.name ?? "")),
      prepare: (values) => {
        const groupName = String(values.group ?? "").trim()
        const group = groups.find((item) => item.name.toLocaleLowerCase() === groupName.toLocaleLowerCase()) ?? groups[0]
        if (!group) return { success: false, executed: false, message: "请先创建一个导航分组" }
        const value = { ...emptyItem(), title: String(values.title ?? ""), url: String(values.url ?? "https://"), icon: String(values.icon ?? ""), description: String(values.description ?? ""), size: (["1x1", "2x2", "4x2"].includes(String(values.size)) ? String(values.size) : "2x2") as NavigationCardSize }
        setItemEditor({ groupId: group.id, value, isNew: true })
        return { success: true, executed: false, prepared: true, message: "已打开新增站点表单，请用户检查后保存" }
      },
      add: (values) => {
        if (!values.operationAutoApproved) return { success: false, executed: false, requiresConfirmation: true, message: "新增站点会写入长期配置，需要开启操作自动审核或由用户在表单中保存" }
        const groupName = String(values.group ?? "").trim()
        const group = groups.find((item) => item.name.toLocaleLowerCase() === groupName.toLocaleLowerCase()) ?? groups[0]
        if (!group) return { success: false, executed: false, message: "没有可用分组" }
        const item = { ...emptyItem(), title: String(values.title ?? "").trim(), url: normalizeNavigationURL(String(values.url ?? "")), icon: String(values.icon ?? "").trim(), description: String(values.description ?? "").trim(), size: (["1x1", "2x2", "4x2"].includes(String(values.size)) ? String(values.size) : "2x2") as NavigationCardSize }
        if (!item.title) throw new Error("站点名称不能为空")
        setGroups((current) => current.map((value) => value.id === group.id ? { ...value, items: [...value.items, item] } : value))
        return { success: true, executed: true, group: group.name, site: item.title }
      },
    },
  })

  return (
    <section className="page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end gap-4"><div className="mr-auto"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />快捷入口</div><h1 className="text-3xl font-semibold tracking-tight">站点导航</h1><p className="mt-2 text-sm text-muted-foreground">按分组整理常用站点，拖动卡片调整顺序，并使用系统浏览器打开。</p></div><Button variant="outline" onClick={() => setGroupEditor({ name: "" })}><Plus />新增分组</Button></div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <div className="space-y-6">
            {groups.map((group) => <article key={group.id} className="rounded-xl border bg-muted/10 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center gap-2"><LayoutGrid className="size-4 text-muted-foreground" /><h2 className="font-medium">{group.name}</h2><span className="text-xs text-muted-foreground">{group.items.length} 个站点</span><div className="ml-auto flex gap-1"><Button variant="ghost" size="icon-xs" onClick={() => setGroupEditor({ id: group.id, name: group.name })} aria-label={`重命名 ${group.name}`}><Pencil /></Button><Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete({ kind: "group", groupId: group.id, name: group.name })} aria-label={`删除 ${group.name}`}><Trash2 /></Button><Button variant="outline" size="sm" onClick={() => setItemEditor({ groupId: group.id, value: emptyItem(), isNew: true })}><Plus />站点</Button></div></div>
              <SortableContext items={group.items.map((item) => item.id)}><div className="grid auto-rows-[5rem] grid-cols-4 grid-flow-row-dense gap-3 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">{group.items.map((item) => <SortableCard key={item.id} item={item} onEdit={() => setItemEditor({ groupId: group.id, value: { ...item }, isNew: false })} />)}{!group.items.length && <button type="button" className="app-interactive col-span-4 row-span-1 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/30" onClick={() => setItemEditor({ groupId: group.id, value: emptyItem(), isNew: true })}>添加第一个站点</button>}</div></SortableContext>
            </article>)}
          </div>
        </DndContext>
      </div>

      <Dialog open={Boolean(groupEditor)} onOpenChange={(open) => !open && setGroupEditor(null)}><DialogContent><DialogHeader><DialogTitle>{groupEditor?.id ? "修改分组" : "新增分组"}</DialogTitle><DialogDescription>分组用于整理不同用途的开发站点。</DialogDescription></DialogHeader><label className="text-sm"><span className="mb-1.5 block text-muted-foreground">分组名称</span><input autoFocus className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={groupEditor?.name ?? ""} onChange={(event) => setGroupEditor((value) => value ? { ...value, name: event.target.value } : value)} /></label><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button onClick={saveGroup}>保存</Button></DialogFooter></DialogContent></Dialog>

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
                <div className={cn("flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-3 shadow-md", itemEditor.value.size === "1x1" ? "size-20" : itemEditor.value.size === "2x2" ? "h-32 w-36" : "h-32 w-full")}>
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary"><SiteIcon item={itemEditor.value} /></span>
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
                  <label className="text-sm sm:col-span-2"><span className="mb-1.5 block text-xs font-medium">说明 <span className="font-normal text-muted-foreground">（可选）</span></span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder="描述这个入口的用途" value={itemEditor.value.description} onChange={(event) => updateItem({ description: event.target.value })} /></label>
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
            {!itemEditor?.isNew && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => itemEditor && setPendingDelete({ kind: "item", groupId: itemEditor.groupId, itemId: itemEditor.value.id, name: itemEditor.value.title })}><Trash2 />删除</Button>}
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <Button disabled={iconBusy} onClick={() => void saveItem()}>保存站点</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>删除{pendingDelete?.kind === "group" ? "分组" : "站点"}</DialogTitle><DialogDescription>确定删除“{pendingDelete?.name}”吗？{pendingDelete?.kind === "group" ? "分组内的站点也会一并删除。" : ""}</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" onClick={() => { removePending(); setItemEditor(null) }}>删除</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}

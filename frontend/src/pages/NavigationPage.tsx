import { Button } from "@/components/ui/button"
import { Dialog,DialogClose,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"
import { uiText } from "@/lib/i18n"
import { type NavigationCardSize } from "@/lib/navigation-sites"
import { cn } from "@/lib/utils"
import { SiteIcon,SortableCard,siteHost,useNavigationPageViewModel } from "@/models/NavigationPageModel"
import { DndContext,closestCenter } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import { ArrowDown,ArrowUp,FolderCog,Globe2,ImagePlus,Layers3,LayoutGrid,Link2,Pencil,Plus,Sparkles,Trash2 } from "lucide-react"

export default function NavigationPage() {
 const { groups, activeGroupId, setActiveGroupId, groupManagerOpen, setGroupManagerOpen, groupEditor, setGroupEditor, itemEditor, setItemEditor, pendingDelete, setPendingDelete, iconBusy, sensors, itemLocation, visibleItems, activeGroup, visibleGroupBlocks, availableLists, dragEnd, saveGroup, editGroup, moveGroup, openNewItem, saveItem, updateItem, chooseLocalIcon, discoverEditorIcon, removePending } = useNavigationPageViewModel()
return (
    <section className="page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="mr-auto"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("快捷入口")}</div><h1 className="text-3xl font-semibold tracking-tight">{uiText("站点导航")}</h1><p className="mt-2 text-sm text-muted-foreground">{uiText("使用一级 Tab 与可选 list 小组整理站点，拖动卡片调整顺序。")}</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setGroupManagerOpen(true)}><FolderCog />{uiText("分组管理")}</Button><Button onClick={openNewItem} disabled={!groups.length}><Plus />{uiText("新增站点")}</Button></div>
        </div>

        <div className="mb-5 flex min-w-0 items-end gap-1 overflow-x-auto border-b" role="tablist" aria-label={uiText("导航分组")}>
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
            {!visibleItems.length && <div className="grid auto-rows-[4rem] grid-cols-[repeat(auto-fill,4rem)] justify-start gap-3"><button type="button" className="app-interactive col-span-4 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/30" onClick={openNewItem}>{groups.length ? `向${activeGroup ? `“${activeGroup.name}”` : uiText("导航")}添加第一个站点` : uiText("先创建一个分组")}</button></div>}
          </div>
        </DndContext>
      </div>

      <Dialog open={groupManagerOpen} onOpenChange={setGroupManagerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{uiText("分组管理")}</DialogTitle><DialogDescription>{uiText("管理作为一级 Tab 显示的导航分组；删除分组也会删除其中的站点。")}</DialogDescription></DialogHeader>
          <div className="space-y-2 p-5">
            {groups.map((group, index) => <div key={group.id} className="flex items-center gap-2 rounded-lg border bg-muted/15 px-3 py-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><LayoutGrid className="size-4 text-muted-foreground" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{group.name}</span><span className="text-[11px] text-muted-foreground">{group.items.length} {uiText("个站点 · 第")}{index + 1} {uiText("组")}</span></span><Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveGroup(index, -1)} aria-label={`上移 ${group.name}`}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)} aria-label={`下移 ${group.name}`}><ArrowDown /></Button><Button variant="ghost" size="icon-sm" onClick={() => editGroup(group)} aria-label={`编辑 ${group.name}`}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete({ kind: "group", groupId: group.id, name: group.name })} aria-label={`删除 ${group.name}`}><Trash2 /></Button></div>)}
            {!groups.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{uiText("还没有导航分组")}</div>}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">{uiText("完成")}</Button></DialogClose><Button onClick={() => editGroup()}><Plus />{uiText("新增分组")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(groupEditor)} onOpenChange={(open) => !open && setGroupEditor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{groupEditor?.id ? uiText("编辑分组") : uiText("新增分组")}</DialogTitle><DialogDescription>{uiText("修改分组名称和显示顺序，站点可在编辑页面切换所属分组。")}</DialogDescription></DialogHeader>
          {groupEditor && <div className="space-y-5 p-5">
            <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-primary/[0.08] to-muted/20 p-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm"><FolderCog className="size-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{groupEditor.name.trim() || uiText("未命名分组")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{groupEditor.id ? `${groups.find((group) => group.id === groupEditor.id)?.items.length ?? 0} 个站点` : uiText("保存后即可添加站点")}</span></span></div>
            <label className="block space-y-1.5 text-xs font-medium"><span>{uiText("分组名称")}</span><input autoFocus className="app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" value={groupEditor.name} onChange={(event) => setGroupEditor({ ...groupEditor, name: event.target.value })} placeholder={uiText("例如 Quick、设计资源")} /></label>
            <label className="block space-y-1.5 text-xs font-medium"><span>{uiText("显示顺序")}</span><select className="app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" value={groupEditor.position} onChange={(event) => setGroupEditor({ ...groupEditor, position: Number(event.target.value) })}>{Array.from({ length: groupEditor.id ? groups.length : groups.length + 1 }, (_, index) => <option key={index} value={index}>{uiText("第")}{index + 1} {uiText("个")}</option>)}</select><span className="block font-normal leading-4 text-muted-foreground">{uiText("也可以在分组管理中使用上下箭头快速调整。")}</span></label>
          </div>}
          <DialogFooter><DialogClose asChild><Button variant="outline">{uiText("取消")}</Button></DialogClose><Button disabled={!groupEditor?.name.trim()} onClick={saveGroup}>{groupEditor?.id ? uiText("保存修改") : uiText("创建分组")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(itemEditor)} onOpenChange={(open) => !open && setItemEditor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{itemEditor?.isNew ? uiText("新增站点") : uiText("修改站点")}</DialogTitle>
            <DialogDescription>{uiText("整理入口信息并预览卡片；网址会使用系统默认浏览器打开。")}</DialogDescription>
          </DialogHeader>
          {itemEditor && <div className="grid md:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="flex min-h-52 flex-col border-b bg-gradient-to-br from-primary/[0.08] via-muted/20 to-background p-5 md:border-b-0 md:border-r">
              <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5" />{uiText("卡片预览")}</div>
              <div className="flex flex-1 items-center justify-center">
                <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card p-2.5 shadow-md", itemEditor.value.size === "1x1" ? "size-16 items-center justify-center" : itemEditor.value.size === "2x2" ? "size-[8.75rem] justify-between" : "h-[8.75rem] w-full justify-between")}>
                  <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 font-semibold text-primary", itemEditor.value.size === "1x1" ? "size-7" : "size-9")}><SiteIcon item={itemEditor.value} /></span>
                  {itemEditor.value.size !== "1x1" && <span className="min-w-0"><span className="block truncate text-sm font-medium">{itemEditor.value.title || uiText("站点名称")}</span>{itemEditor.value.size === "4x2" && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{itemEditor.value.description || siteHost(itemEditor.value.url) || uiText("站点说明")}</span>}</span>}
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">{uiText("自动获取会验证图像并缓存到 Quick 配置目录，再次点击可刷新。")}</p>
            </aside>

            <div className="space-y-5 p-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Link2 className="size-3.5" />{uiText("基本信息")}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">{uiText("名称")}</span><input autoFocus className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder={uiText("例如 GitHub")} value={itemEditor.value.title} onChange={(event) => updateItem({ title: event.target.value })} /></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">{uiText("所属分组")}</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={itemEditor.groupId} onChange={(event) => setItemEditor({ ...itemEditor, groupId: event.target.value })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                  <label className="text-sm sm:col-span-2"><span className="mb-1.5 block text-xs font-medium">{uiText("网址")}</span><div className="relative"><Globe2 className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><input className="app-interactive w-full rounded-lg border bg-background py-2 pl-9 pr-3 font-mono text-sm" placeholder="https://example.com" value={itemEditor.value.url} onChange={(event) => updateItem({ url: event.target.value, ...(itemEditor.value.icon.startsWith("quick-icon:") ? { icon: "" } : {}) })} /></div></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">{uiText("列表小组")}<span className="font-normal text-muted-foreground">{uiText("（可选）")}</span></span><input list="navigation-list-options" className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder={uiText("选择已有小组或输入新名称")} value={itemEditor.value.list} onChange={(event) => updateItem({ list: event.target.value })} /><datalist id="navigation-list-options">{availableLists.map((name) => <option key={name.toLocaleLowerCase()} value={name} />)}</datalist><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{availableLists.length ? uiText("可选择当前 Tab 的已有小组，也可以直接输入新名称。") : uiText("直接输入名称即可在当前 Tab 中创建新的 list。")}</span></label>
                  <label className="text-sm"><span className="mb-1.5 block text-xs font-medium">{uiText("说明")}<span className="font-normal text-muted-foreground">{uiText("（可选）")}</span></span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" placeholder={uiText("描述这个入口的用途")} value={itemEditor.value.description} onChange={(event) => updateItem({ description: event.target.value })} /></label>
                </div>
              </section>

              <section className="space-y-3 border-t pt-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><LayoutGrid className="size-3.5" />{uiText("卡片外观")}</div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium">{uiText("尺寸")}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["1x1", "2x2", "4x2"] as NavigationCardSize[]).map((size) => <button key={size} type="button" className={cn("app-interactive rounded-lg border px-2 py-2 text-left transition-colors", itemEditor.value.size === size ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted/40")} onClick={() => updateItem({ size })}><span className="block text-xs font-medium">{size}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{size === "1x1" ? uiText("仅图标") : size === "2x2" ? uiText("图标与名称") : uiText("名称与说明")}</span></button>)}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium">{uiText("站点图标")}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={itemEditor.value.icon.startsWith("quick-icon:") ? "secondary" : "outline"} size="sm" disabled={iconBusy} onClick={() => void discoverEditorIcon()}><Globe2 />{iconBusy ? uiText("正在获取…") : uiText("自动获取")}</Button>
                    <Button type="button" variant={itemEditor.value.icon.startsWith("quick-icon:local-") ? "secondary" : "outline"} size="sm" disabled={iconBusy} onClick={() => void chooseLocalIcon()}><ImagePlus />{iconBusy ? uiText("正在处理…") : uiText("本地图片")}</Button>
                  </div>
                  <input className="app-interactive mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder={itemEditor.value.icon.startsWith("data:") ? uiText("已使用本地图片；输入地址可替换") : itemEditor.value.icon.startsWith("quick-icon:") ? uiText("已缓存到配置目录；输入地址可替换") : uiText("或粘贴自定义图片 URL")} value={itemEditor.value.icon.startsWith("data:") || itemEditor.value.icon.startsWith("quick-icon:") ? "" : itemEditor.value.icon} onChange={(event) => updateItem({ icon: event.target.value })} />
                </div>
              </section>
            </div>
          </div>}
          <DialogFooter>
            {!itemEditor?.isNew && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => itemEditor && setPendingDelete({ kind: "item", groupId: itemLocation.get(itemEditor.value.id)?.groupId ?? itemEditor.groupId, itemId: itemEditor.value.id, name: itemEditor.value.title })}><Trash2 />{uiText("删除")}</Button>}
            <DialogClose asChild><Button variant="outline">{uiText("取消")}</Button></DialogClose>
            <Button disabled={iconBusy} onClick={() => void saveItem()}>{uiText("保存站点")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>{uiText("删除")}{pendingDelete?.kind === "group" ? uiText("分组") : uiText("站点")}</DialogTitle><DialogDescription>{uiText("确定删除“")}{pendingDelete?.name}{uiText("”吗？")}{pendingDelete?.kind === "group" ? uiText("分组内的站点也会一并删除。") : ""}</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">{uiText("取消")}</Button></DialogClose><Button variant="destructive" onClick={() => { removePending(); setItemEditor(null) }}>{uiText("删除")}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}

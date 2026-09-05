import { Button } from "@/components/ui/button"
import { Dialog,DialogClose,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"
import { writeClipboard } from "@/lib/clipboard"
import { uiText } from "@/lib/i18n"
import { statusLabel,useFileToolsPageViewModel } from "@/models/FileToolsPageModel"
import { AlertTriangle,CheckCircle2,Copy,FilePenLine,FileSearch,FolderOpen,RotateCcw,Sparkles,UploadCloud } from "lucide-react"
import { toast } from "sonner"

export default function FileToolsPage() {
 const { language, sourcePaths, files, rules, setRules, preview, busy, confirmOpen, setConfirmOpen, canUndo, digestAlgorithm, setDigestAlgorithm, inspections, loadSources, chooseFolder, previewClick, execute, undo, inspectFiles, rootLabel } = useFileToolsPageViewModel()
return (
    <section className="page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("文件处理")}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{uiText("文件工具")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiText("通过可核验的预览批量重命名文件，并支持撤销最近一次操作。")}</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-5">
            <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3"><span className="font-medium">{uiText("1. 选择文件")}</span><Button variant="outline" size="sm" onClick={chooseFolder} disabled={busy}><FolderOpen />{uiText("选择文件夹")}</Button></div>
              <div className="p-4">
                <div id="file-rename-drop-zone" data-file-drop-target className="app-interactive flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 text-center">
                  <UploadCloud className="mb-3 size-7 text-muted-foreground" />
                  <div className="text-sm font-medium">{uiText("拖入多个文件或文件夹")}</div>
                  <div className="mt-1 max-w-full truncate text-xs text-muted-foreground" title={rootLabel}>{rootLabel}</div>
                </div>
                <label className="app-interactive mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.recursive} onChange={(event) => { const recursive = event.target.checked; setRules((value) => ({ ...value, recursive })); if (sourcePaths.length) void loadSources(sourcePaths, recursive) }} className="accent-primary" />{uiText("包含子文件夹")}</label>
              </div>
            </article>

            <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-4 py-3 font-medium">{uiText("2. 配置规则")}</div>
              <div className="space-y-4 p-4 text-sm">
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("匹配方式")}</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.matchMode} onChange={(event) => setRules({ ...rules, matchMode: event.target.value })}><option value="all">{uiText("全部文件")}</option><option value="wildcard">{uiText("通配符")}</option><option value="regex">{uiText("正则表达式")}</option></select></label>
                {rules.matchMode !== "all" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("匹配表达式")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2 font-mono" value={rules.matchPattern} onChange={(event) => setRules({ ...rules, matchPattern: event.target.value })} placeholder={rules.matchMode === "wildcard" ? "*.jpg" : "^IMG_\\d+"} /></label>}
                <label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.matchFullName} onChange={(event) => setRules({ ...rules, matchFullName: event.target.checked })} className="accent-primary" />{uiText("匹配时包含扩展名")}</label>
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("重命名操作")}</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.operation} onChange={(event) => setRules({ ...rules, operation: event.target.value })}><option value="reset">{uiText("重置名称并编号")}</option><option value="replace">{uiText("替换内容")}</option><option value="prefix">{uiText("添加前缀")}</option><option value="suffix">{uiText("添加后缀")}</option></select></label>

                {rules.operation === "reset" && <><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("基础名称")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.replacement} onChange={(event) => setRules({ ...rules, replacement: event.target.value })} /></label><div className="grid grid-cols-3 gap-2"><label><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("起点")}</span><input type="number" className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.start} onChange={(event) => setRules({ ...rules, start: Number(event.target.value) })} /></label><label><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("步长")}</span><input type="number" className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.step} onChange={(event) => setRules({ ...rules, step: Number(event.target.value) })} /></label><label><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("位数")}</span><input type="number" min={1} max={12} className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.width} onChange={(event) => setRules({ ...rules, width: Number(event.target.value) })} /></label></div></>}
                {rules.operation === "replace" && <><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("查找")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2 font-mono" value={rules.find} onChange={(event) => setRules({ ...rules, find: event.target.value })} /></label><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("替换为")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.replacement} onChange={(event) => setRules({ ...rules, replacement: event.target.value })} /></label><label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.useRegex} onChange={(event) => setRules({ ...rules, useRegex: event.target.checked })} className="accent-primary" />{uiText("使用正则替换和捕获组")}</label></>}
                {rules.operation === "prefix" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("前缀")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.prefix} onChange={(event) => setRules({ ...rules, prefix: event.target.value })} /></label>}
                {rules.operation === "suffix" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("后缀")}</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.suffix} onChange={(event) => setRules({ ...rules, suffix: event.target.value })} /></label>}
                <label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.includeExtension} onChange={(event) => setRules({ ...rules, includeExtension: event.target.checked })} className="accent-primary" />{uiText("操作包含扩展名")}</label>
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">{uiText("编号排序")}</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.sortBy} onChange={(event) => setRules({ ...rules, sortBy: event.target.value })}><option value="name">{uiText("文件名")}</option><option value="modified">{uiText("修改时间")}</option><option value="size">{uiText("文件大小")}</option></select></label>
              </div>
            </article>
          </div>

          <article className="flex min-h-[42rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <div className="mr-auto"><div className="font-medium">{uiText("3. 预览与执行")}</div><div className="mt-0.5 text-xs text-muted-foreground">{language === "en-US" ? `${files.length} files${preview ? `, ${preview.matched} matched, ${preview.ready} ready` : ""}` : `共 ${files.length} 个文件${preview ? `，匹配 ${preview.matched}，待执行 ${preview.ready}` : ""}`}</div></div>
              <Button variant="outline" size="sm" onClick={undo} disabled={busy || !canUndo}><RotateCcw />{uiText("撤销上次")}</Button>
              <Button variant="outline" size="sm" onClick={previewClick} disabled={busy || !sourcePaths.length}><FilePenLine />{uiText("生成预览")}</Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={busy || !preview?.ready || Boolean(preview?.conflicts)}><CheckCircle2 />{uiText("执行重命名")}</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-card text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">{uiText("原文件名")}</th><th className="px-3 py-3 font-medium">{uiText("新文件名")}</th><th className="w-28 px-3 py-3 font-medium">{uiText("状态")}</th></tr></thead>
                <tbody>{preview?.items?.length ? preview.items.map((item) => <tr key={item.sourcePath} className="border-b last:border-0"><td className="max-w-0 truncate px-4 py-3 font-mono text-xs" title={item.sourcePath}>{item.oldName}</td><td className="max-w-0 truncate px-3 py-3 font-mono text-xs" title={item.error || item.targetPath}>{item.newName}</td><td className={`px-3 py-3 text-xs ${item.status === "conflict" ? "text-destructive" : item.status === "ready" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{item.status === "conflict" && <AlertTriangle className="mr-1 inline size-3.5" />}{statusLabel(item.status)}</td></tr>) : <tr><td colSpan={3} className="px-6 py-24 text-center text-muted-foreground">{uiText("选择文件并生成预览后，这里会逐项显示新旧文件名与冲突。")}</td></tr>}</tbody>
              </table>
            </div>
          </article>
        </div>
        <article className="mt-5 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><div className="mr-auto"><div className="flex items-center gap-2 font-medium"><FileSearch className="size-4" />{uiText("文件摘要与元信息")}</div><div className="mt-0.5 text-xs text-muted-foreground">{uiText("只读检查，支持流式摘要；文本编码分析限制在 2 MiB 内。")}</div></div><select className="app-interactive rounded-lg border bg-background px-3 py-2 text-sm" value={digestAlgorithm} onChange={(event) => setDigestAlgorithm(event.target.value)}><option>SHA-256</option><option>SHA-512</option><option>MD5</option></select><Button size="sm" variant="outline" disabled={busy || !sourcePaths.length} onClick={() => void inspectFiles().catch((error) => toast.error(uiText("文件检查失败"), { description: error instanceof Error ? error.message : String(error) }))}><FileSearch />{uiText("开始检查")}</Button></div>
          <div className="max-h-96 overflow-auto"><table className="w-full min-w-[62rem] text-left text-xs"><thead className="sticky top-0 bg-card shadow-[0_1px_0_var(--border)]"><tr><th className="px-4 py-3">{uiText("文件")}</th><th className="px-3 py-3">{uiText("大小")}</th><th className="px-3 py-3">{uiText("类型 / 文本")}</th><th className="px-3 py-3">{uiText("尺寸")}</th><th className="px-3 py-3">{digestAlgorithm}</th><th className="w-12"></th></tr></thead><tbody>{inspections.length ? inspections.map((item) => <tr key={item.path} className="border-t"><td className="max-w-56 truncate px-4 py-3" title={item.path}>{item.name}</td><td className="px-3 py-3">{new Intl.NumberFormat("zh-CN", { style: "unit", unit: "byte", unitDisplay: "narrow" }).format(item.size)}</td><td className="px-3 py-3">{item.mime || uiText("未知")}{item.utf8 ? ` · UTF-8${item.lineEnding ? `/${item.lineEnding}` : ""}` : ""}</td><td className="px-3 py-3">{item.width && item.height ? `${item.width} × ${item.height}` : "—"}</td><td className="max-w-80 truncate px-3 py-3 font-mono" title={item.digest}>{item.digest}</td><td><Button variant="ghost" size="icon-xs" onClick={async () => { await writeClipboard(item.digest); toast.success(uiText("摘要已复制")) }}><Copy /></Button></td></tr>) : <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">{uiText("选择文件后开始检查。")}</td></tr>}</tbody></table></div>
        </article>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader><DialogTitle>{uiText("确认批量重命名")}</DialogTitle><DialogDescription>{uiText("将修改")}{preview?.ready ?? 0} {uiText("个文件。Quick 会在内存中保留本次路径映射，以便在应用关闭前撤销。")}</DialogDescription></DialogHeader><div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm text-amber-800 dark:text-amber-200">{uiText("执行前会重新计算并检查冲突；如果文件状态已经变化，本次操作会停止。")}</div><DialogFooter><DialogClose asChild><Button variant="outline">{uiText("取消")}</Button></DialogClose><Button onClick={execute}>{uiText("确认执行")}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}

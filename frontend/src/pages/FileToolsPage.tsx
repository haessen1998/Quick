import { useCallback, useEffect, useMemo, useState } from "react"
import { Events } from "@wailsio/runtime"
import { AlertTriangle, CheckCircle2, Copy, FilePenLine, FileSearch, FolderOpen, RotateCcw, Sparkles, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage } from "@/lib/i18n"
import { ChooseFolder, ExecuteRename, InspectFiles, ListFiles, PreviewRename, UndoLastRename } from "../../bindings/github.com/haessen1998/Quick/internal/files/filerenameservice"
import type { FileInspection, RenameFileInfo, RenamePlanItem, RenamePreview, RenameRequest } from "../../bindings/github.com/haessen1998/Quick/internal/files/models"

type RenameRules = Omit<RenameRequest, "paths">

const initialRules: RenameRules = {
  recursive: false,
  matchMode: "all",
  matchPattern: "*",
  matchFullName: true,
  operation: "reset",
  find: "",
  replacement: "文件",
  useRegex: false,
  prefix: "",
  suffix: "",
  start: 1,
  step: 1,
  width: 3,
  includeExtension: false,
  sortBy: "name",
}

function requestFor(paths: string[], rules: RenameRules): RenameRequest {
  return { ...rules, paths }
}

function statusLabel(status: string) {
  if (status === "ready") return "待执行"
  if (status === "conflict") return "冲突"
  if (status === "unchanged") return "无变化"
  return "已跳过"
}

function remapSourcePaths(paths: string[], items: RenamePlanItem[] | null) {
  const mapping = new Map((items ?? []).filter((item) => item.status === "ready").map((item) => [item.sourcePath, item.targetPath]))
  return paths.map((path) => mapping.get(path) ?? path)
}

export default function FileToolsPage() {
  const { language, t } = useLanguage()
  const [sourcePaths, setSourcePaths] = useState<string[]>([])
  const [files, setFiles] = useState<RenameFileInfo[]>([])
  const [rules, setRules] = useState<RenameRules>(initialRules)
  const [preview, setPreview] = useState<RenamePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [digestAlgorithm, setDigestAlgorithm] = useState("SHA-256")
  const [inspections, setInspections] = useState<FileInspection[]>([])

  const loadSources = useCallback(async (paths: string[], recursive = rules.recursive) => {
    if (!paths.length) return
    setBusy(true)
    try {
      const listed = await ListFiles(paths, recursive)
      setSourcePaths(paths)
      setFiles(listed ?? [])
      setPreview(null)
      setInspections([])
      toast.success(`已读取 ${listed?.length ?? 0} 个文件`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [rules.recursive])

  useEffect(() => Events.On("files-dropped", (event: any) => {
    const paths = Array.isArray(event?.data?.files) ? event.data.files.map(String) : []
    if (paths.length) void loadSources(paths)
  }), [loadSources])

  const chooseFolder = async () => {
    try {
      const path = await ChooseFolder()
      if (path) await loadSources([path])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const runPreview = useCallback(async (nextRules = rules) => {
    if (!sourcePaths.length) throw new Error("请先选择文件夹或拖入文件")
    setBusy(true)
    try {
      const result = await PreviewRename(requestFor(sourcePaths, nextRules))
      setPreview(result)
      return result
    } finally {
      setBusy(false)
    }
  }, [rules, sourcePaths])

  const previewClick = async () => {
    try {
      const result = await runPreview()
      if (result.conflicts) toast.error(`发现 ${result.conflicts} 个冲突`)
      else toast.success(`预览完成，${result.ready} 个文件待重命名`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const execute = async () => {
    setConfirmOpen(false)
    setBusy(true)
    try {
      const result = await ExecuteRename(requestFor(sourcePaths, rules))
      setCanUndo(result.canUndo)
      toast.success(result.message)
      await loadSources(remapSourcePaths(sourcePaths, result.items))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    setBusy(true)
    try {
      const result = await UndoLastRename()
      result.success ? toast.success(result.message) : toast.info(result.message)
      setCanUndo(result.canUndo)
      if (sourcePaths.length) await loadSources(remapSourcePaths(sourcePaths, result.items))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const inspectFiles = useCallback(async (algorithm = digestAlgorithm) => {
    if (!sourcePaths.length) throw new Error("请先选择文件夹或拖入文件")
    setBusy(true)
    try {
      const result = await InspectFiles(sourcePaths, rules.recursive, algorithm)
      setDigestAlgorithm(algorithm); setInspections(result ?? [])
      toast.success(`已检查 ${result?.length ?? 0} 个文件`)
      return result ?? []
    } finally { setBusy(false) }
  }, [digestAlgorithm, rules.recursive, sourcePaths])

  useAssistantCapability({
    page: "file-tools",
    getContext: () => ({
      sourceCount: sourcePaths.length,
      fileCount: files.length,
      rules,
      preview: preview ? { total: preview.total, matched: preview.matched, ready: preview.ready, conflicts: preview.conflicts } : null,
      canUndo,
      inspection: { algorithm: digestAlgorithm, count: inspections.length },
    }),
    actions: {
      prepare: async (values) => {
        const nextRules = { ...rules, ...values } as RenameRules
        delete (nextRules as RenameRules & { paths?: unknown }).paths
        setRules(nextRules)
        if (!sourcePaths.length) return { success: true, executed: false, message: "规则已填写，请由用户选择文件夹或拖入文件后预览" }
        const result = await runPreview(nextRules)
        return { success: true, executed: true, preview: { matched: result.matched, ready: result.ready, conflicts: result.conflicts } }
      },
      execute: async (values) => {
        if (!values.operationAutoApproved) return { success: false, executed: false, requiresConfirmation: true, message: "批量重命名会修改文件，需要开启操作自动审核或由用户在页面确认" }
        const result = await ExecuteRename(requestFor(sourcePaths, rules))
        setCanUndo(result.canUndo)
        await loadSources(remapSourcePaths(sourcePaths, result.items))
        return { success: result.success, executed: true, renamed: result.renamed, canUndo: result.canUndo }
      },
      undo: async (values) => {
        if (!values.operationAutoApproved) return { success: false, executed: false, requiresConfirmation: true, message: "撤销会再次修改文件，需要开启操作自动审核或由用户在页面确认" }
        const result = await UndoLastRename()
        setCanUndo(result.canUndo)
        if (sourcePaths.length) await loadSources(remapSourcePaths(sourcePaths, result.items))
        return { success: result.success, executed: true, renamed: result.renamed }
      },
      inspect: async (values) => {
        if (!sourcePaths.length) return { success: true, executed: false, message: "请由用户选择文件或文件夹；助手不能填写本机路径" }
        const algorithm = ["MD5", "SHA-256", "SHA-512"].includes(String(values.algorithm)) ? String(values.algorithm) : "SHA-256"
        const result = await inspectFiles(algorithm)
        return { success: true, executed: true, algorithm, files: result.slice(0, 100).map((item) => ({ name: item.name, size: item.size, mime: item.mime, digest: item.digest, width: item.width, height: item.height, utf8: item.utf8, lineEnding: item.lineEnding })), truncated: result.length > 100 }
      },
    },
  })

  const rootLabel = useMemo(() => sourcePaths.length === 1 ? sourcePaths[0] : sourcePaths.length ? (language === "en-US" ? `${sourcePaths.length} paths selected` : `已选择 ${sourcePaths.length} 个路径`) : t("尚未选择文件"), [language, sourcePaths, t])

  return (
    <section className="page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />文件处理</div>
          <h1 className="text-3xl font-semibold tracking-tight">文件工具</h1>
          <p className="mt-2 text-sm text-muted-foreground">通过可核验的预览批量重命名文件，并支持撤销最近一次操作。</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-5">
            <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3"><span className="font-medium">1. 选择文件</span><Button variant="outline" size="sm" onClick={chooseFolder} disabled={busy}><FolderOpen />选择文件夹</Button></div>
              <div className="p-4">
                <div id="file-rename-drop-zone" data-file-drop-target className="app-interactive flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 text-center">
                  <UploadCloud className="mb-3 size-7 text-muted-foreground" />
                  <div className="text-sm font-medium">拖入多个文件或文件夹</div>
                  <div className="mt-1 max-w-full truncate text-xs text-muted-foreground" title={rootLabel}>{rootLabel}</div>
                </div>
                <label className="app-interactive mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.recursive} onChange={(event) => { const recursive = event.target.checked; setRules((value) => ({ ...value, recursive })); if (sourcePaths.length) void loadSources(sourcePaths, recursive) }} className="accent-primary" />包含子文件夹</label>
              </div>
            </article>

            <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="border-b px-4 py-3 font-medium">2. 配置规则</div>
              <div className="space-y-4 p-4 text-sm">
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">匹配方式</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.matchMode} onChange={(event) => setRules({ ...rules, matchMode: event.target.value })}><option value="all">全部文件</option><option value="wildcard">通配符</option><option value="regex">正则表达式</option></select></label>
                {rules.matchMode !== "all" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">匹配表达式</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2 font-mono" value={rules.matchPattern} onChange={(event) => setRules({ ...rules, matchPattern: event.target.value })} placeholder={rules.matchMode === "wildcard" ? "*.jpg" : "^IMG_\\d+"} /></label>}
                <label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.matchFullName} onChange={(event) => setRules({ ...rules, matchFullName: event.target.checked })} className="accent-primary" />匹配时包含扩展名</label>
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">重命名操作</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.operation} onChange={(event) => setRules({ ...rules, operation: event.target.value })}><option value="reset">重置名称并编号</option><option value="replace">替换内容</option><option value="prefix">添加前缀</option><option value="suffix">添加后缀</option></select></label>

                {rules.operation === "reset" && <><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">基础名称</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.replacement} onChange={(event) => setRules({ ...rules, replacement: event.target.value })} /></label><div className="grid grid-cols-3 gap-2"><label><span className="mb-1.5 block text-xs text-muted-foreground">起点</span><input type="number" className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.start} onChange={(event) => setRules({ ...rules, start: Number(event.target.value) })} /></label><label><span className="mb-1.5 block text-xs text-muted-foreground">步长</span><input type="number" className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.step} onChange={(event) => setRules({ ...rules, step: Number(event.target.value) })} /></label><label><span className="mb-1.5 block text-xs text-muted-foreground">位数</span><input type="number" min={1} max={12} className="app-interactive w-full rounded-lg border bg-background px-2 py-2" value={rules.width} onChange={(event) => setRules({ ...rules, width: Number(event.target.value) })} /></label></div></>}
                {rules.operation === "replace" && <><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">查找</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2 font-mono" value={rules.find} onChange={(event) => setRules({ ...rules, find: event.target.value })} /></label><label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">替换为</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.replacement} onChange={(event) => setRules({ ...rules, replacement: event.target.value })} /></label><label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.useRegex} onChange={(event) => setRules({ ...rules, useRegex: event.target.checked })} className="accent-primary" />使用正则替换和捕获组</label></>}
                {rules.operation === "prefix" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">前缀</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.prefix} onChange={(event) => setRules({ ...rules, prefix: event.target.value })} /></label>}
                {rules.operation === "suffix" && <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">后缀</span><input className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.suffix} onChange={(event) => setRules({ ...rules, suffix: event.target.value })} /></label>}
                <label className="app-interactive flex items-center gap-2"><input type="checkbox" checked={rules.includeExtension} onChange={(event) => setRules({ ...rules, includeExtension: event.target.checked })} className="accent-primary" />操作包含扩展名</label>
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">编号排序</span><select className="app-interactive w-full rounded-lg border bg-background px-3 py-2" value={rules.sortBy} onChange={(event) => setRules({ ...rules, sortBy: event.target.value })}><option value="name">文件名</option><option value="modified">修改时间</option><option value="size">文件大小</option></select></label>
              </div>
            </article>
          </div>

          <article className="flex min-h-[42rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <div className="mr-auto"><div className="font-medium">3. 预览与执行</div><div className="mt-0.5 text-xs text-muted-foreground">{language === "en-US" ? `${files.length} files${preview ? `, ${preview.matched} matched, ${preview.ready} ready` : ""}` : `共 ${files.length} 个文件${preview ? `，匹配 ${preview.matched}，待执行 ${preview.ready}` : ""}`}</div></div>
              <Button variant="outline" size="sm" onClick={undo} disabled={busy || !canUndo}><RotateCcw />撤销上次</Button>
              <Button variant="outline" size="sm" onClick={previewClick} disabled={busy || !sourcePaths.length}><FilePenLine />生成预览</Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={busy || !preview?.ready || Boolean(preview?.conflicts)}><CheckCircle2 />执行重命名</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-card text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">原文件名</th><th className="px-3 py-3 font-medium">新文件名</th><th className="w-28 px-3 py-3 font-medium">状态</th></tr></thead>
                <tbody>{preview?.items?.length ? preview.items.map((item) => <tr key={item.sourcePath} className="border-b last:border-0"><td className="max-w-0 truncate px-4 py-3 font-mono text-xs" title={item.sourcePath}>{item.oldName}</td><td className="max-w-0 truncate px-3 py-3 font-mono text-xs" title={item.error || item.targetPath}>{item.newName}</td><td className={`px-3 py-3 text-xs ${item.status === "conflict" ? "text-destructive" : item.status === "ready" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{item.status === "conflict" && <AlertTriangle className="mr-1 inline size-3.5" />}{statusLabel(item.status)}</td></tr>) : <tr><td colSpan={3} className="px-6 py-24 text-center text-muted-foreground">选择文件并生成预览后，这里会逐项显示新旧文件名与冲突。</td></tr>}</tbody>
              </table>
            </div>
          </article>
        </div>
        <article className="mt-5 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><div className="mr-auto"><div className="flex items-center gap-2 font-medium"><FileSearch className="size-4" />文件摘要与元信息</div><div className="mt-0.5 text-xs text-muted-foreground">只读检查，支持流式摘要；文本编码分析限制在 2 MiB 内。</div></div><select className="app-interactive rounded-lg border bg-background px-3 py-2 text-sm" value={digestAlgorithm} onChange={(event) => setDigestAlgorithm(event.target.value)}><option>SHA-256</option><option>SHA-512</option><option>MD5</option></select><Button size="sm" variant="outline" disabled={busy || !sourcePaths.length} onClick={() => void inspectFiles().catch((error) => toast.error("文件检查失败", { description: error instanceof Error ? error.message : String(error) }))}><FileSearch />开始检查</Button></div>
          <div className="max-h-96 overflow-auto"><table className="w-full min-w-[62rem] text-left text-xs"><thead className="sticky top-0 bg-card shadow-[0_1px_0_var(--border)]"><tr><th className="px-4 py-3">文件</th><th className="px-3 py-3">大小</th><th className="px-3 py-3">类型 / 文本</th><th className="px-3 py-3">尺寸</th><th className="px-3 py-3">{digestAlgorithm}</th><th className="w-12"></th></tr></thead><tbody>{inspections.length ? inspections.map((item) => <tr key={item.path} className="border-t"><td className="max-w-56 truncate px-4 py-3" title={item.path}>{item.name}</td><td className="px-3 py-3">{new Intl.NumberFormat("zh-CN", { style: "unit", unit: "byte", unitDisplay: "narrow" }).format(item.size)}</td><td className="px-3 py-3">{item.mime || "未知"}{item.utf8 ? ` · UTF-8${item.lineEnding ? `/${item.lineEnding}` : ""}` : ""}</td><td className="px-3 py-3">{item.width && item.height ? `${item.width} × ${item.height}` : "—"}</td><td className="max-w-80 truncate px-3 py-3 font-mono" title={item.digest}>{item.digest}</td><td><Button variant="ghost" size="icon-xs" onClick={async () => { await writeClipboard(item.digest); toast.success("摘要已复制") }}><Copy /></Button></td></tr>) : <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">选择文件后开始检查。</td></tr>}</tbody></table></div>
        </article>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader><DialogTitle>确认批量重命名</DialogTitle><DialogDescription>将修改 {preview?.ready ?? 0} 个文件。Quick 会在内存中保留本次路径映射，以便在应用关闭前撤销。</DialogDescription></DialogHeader><div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm text-amber-800 dark:text-amber-200">执行前会重新计算并检查冲突；如果文件状态已经变化，本次操作会停止。</div><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button onClick={execute}>确认执行</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}

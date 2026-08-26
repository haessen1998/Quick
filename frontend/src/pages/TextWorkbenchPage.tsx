import { useMemo, useState } from "react"
import { Columns2, Eye, FileText, Sparkles } from "lucide-react"
import { diffChars, diffLines, diffWordsWithSpace } from "diff"

import { Button } from "@/components/ui/button"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { useAssistantCapability } from "@/lib/assistant-capabilities"

type Granularity = "line" | "word" | "char"
type InlinePart = { value: string; changed: boolean }
type DiffRow = { left: string; right: string; kind: "same" | "changed" | "added" | "removed"; leftParts?: InlinePart[]; rightParts?: InlinePart[] }

function inlineDiff(left: string, right: string, granularity: Granularity) {
  if (granularity === "line") return undefined
  const changes = granularity === "char" ? diffChars(left, right) : diffWordsWithSpace(left, right)
  return {
    left: changes.filter((change) => !change.added).map((change) => ({ value: change.value, changed: Boolean(change.removed) })),
    right: changes.filter((change) => !change.removed).map((change) => ({ value: change.value, changed: Boolean(change.added) })),
  }
}

function buildDiffRows(left: string, right: string, granularity: Granularity, ignoreWhitespace: boolean): DiffRow[] {
  const changes = diffLines(left, right, { ignoreWhitespace })
  const rows: DiffRow[] = []
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    const lines = change.value.replace(/\n$/, "").split("\n")
    if (!change.added && !change.removed) {
      rows.push(...lines.map((line) => ({ left: line, right: line, kind: "same" as const })))
      continue
    }
    if (change.removed && changes[index + 1]?.added) {
      const added = changes[index + 1].value.replace(/\n$/, "").split("\n")
      const count = Math.max(lines.length, added.length)
      for (let row = 0; row < count; row += 1) {
        const leftLine = lines[row] ?? ""
        const rightLine = added[row] ?? ""
        const inline = inlineDiff(leftLine, rightLine, granularity)
        rows.push({ left: leftLine, right: rightLine, kind: "changed", leftParts: inline?.left, rightParts: inline?.right })
      }
      index += 1
      continue
    }
    rows.push(...lines.map((line) => ({ left: change.removed ? line : "", right: change.added ? line : "", kind: change.removed ? "removed" as const : "added" as const })))
  }
  return rows
}

export default function TextWorkbenchPage() {
  const [mode, setMode] = useState<"markdown" | "diff">("markdown")
  const [markdown, setMarkdown] = useState("# Quick\n\n一个基于 **Wails 3 + React** 的开发者工具箱。\n\n```mermaid\nflowchart LR\n  A[输入] --> B[Quick]\n  B --> C[格式化与转换]\n  B --> D[网络与文件工具]\n```\n\n```go\nfmt.Println(\"Quick\")\n```")
  const [left, setLeft] = useState("Quick\nWails 3\nReact\n旧内容\n")
  const [right, setRight] = useState("Quick\nWails 3\nReact + shadcn/ui\n新内容\n")
  const [granularity, setGranularity] = useState<Granularity>("word")
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const rows = useMemo(() => buildDiffRows(left, right, granularity, ignoreWhitespace), [left, right, granularity, ignoreWhitespace])

  useAssistantCapability({
    page: "text-workbench",
    getContext: () => mode === "markdown"
      ? { mode, markdown: markdown.slice(0, 8000) }
      : { mode, left: left.slice(0, 6000), right: right.slice(0, 6000), granularity, ignoreWhitespace, changedRows: rows.filter((row) => row.kind !== "same").length },
    actions: {
      fill: (values) => {
        const nextMode = String(values.mode ?? "")
        if (nextMode === "markdown") {
          const value = String(values.markdown ?? "")
          setMode("markdown"); setMarkdown(value)
          return { success: true, mode: nextMode, characters: value.length, previewReady: true, executed: true }
        }
        if (nextMode !== "diff") throw new Error(`不支持的文本工作台模式：${nextMode}`)
        const nextLeft = String(values.left ?? "")
        const nextRight = String(values.right ?? "")
        const nextGranularity = (["line", "word", "char"].includes(String(values.granularity)) ? String(values.granularity) : "word") as Granularity
        const nextIgnoreWhitespace = Boolean(values.ignoreWhitespace)
        const nextRows = buildDiffRows(nextLeft, nextRight, nextGranularity, nextIgnoreWhitespace)
        setMode("diff"); setLeft(nextLeft); setRight(nextRight); setGranularity(nextGranularity); setIgnoreWhitespace(nextIgnoreWhitespace)
        return { success: true, mode: nextMode, granularity: nextGranularity, changedRows: nextRows.filter((row) => row.kind !== "same").length, totalRows: nextRows.length, executed: true }
      },
    },
  })

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">文本工作台</h1><p className="mt-2 text-sm text-muted-foreground">实时 Markdown 与 Mermaid 图表预览，以及带行内高亮的智能文本差异比较。</p></div>
        <div className="mb-4 flex gap-2"><Button variant={mode === "markdown" ? "default" : "outline"} onClick={() => setMode("markdown")}><FileText />Markdown 预览</Button><Button variant={mode === "diff" ? "default" : "outline"} onClick={() => setMode("diff")}><Columns2 />文本对比</Button></div>

        {mode === "markdown" ? (
          <div className="grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-2">
            <label className="border-b lg:border-r lg:border-b-0"><div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium"><FileText className="size-4" />Markdown</div><textarea className="app-interactive h-[36rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none" value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} /></label>
            <div><div className="flex h-11 items-center justify-between gap-2 border-b px-4 text-sm font-medium"><span className="flex items-center gap-2"><Eye className="size-4" />预览</span><span className="text-xs font-normal text-muted-foreground">支持 Mermaid</span></div><div className="h-[36rem] overflow-auto p-6"><MarkdownRenderer value={markdown} /></div></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3"><span className="text-xs font-medium text-muted-foreground">对比精度</span><select className="app-interactive rounded-lg border bg-background px-3 py-1.5 text-sm" value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)}><option value="word">智能单词级</option><option value="char">字符级</option><option value="line">仅行级</option></select><label className="app-interactive ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} className="accent-primary" />忽略空白差异</label></div>
            <div className="grid border-b md:grid-cols-2"><label className="border-b md:border-r md:border-b-0"><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">原始文本</div><textarea className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={left} onChange={(event) => setLeft(event.target.value)} spellCheck={false} /></label><label><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">对比文本</div><textarea className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={right} onChange={(event) => setRight(event.target.value)} spellCheck={false} /></label></div>
            <div className="max-h-[30rem] overflow-auto font-mono text-xs">
              <div className="sticky top-0 grid grid-cols-2 border-b bg-card font-sans text-xs font-medium"><div className="border-r px-3 py-2">原始</div><div className="px-3 py-2">修改后</div></div>
              {rows.map((row, index) => <div key={`${index}-${row.left}-${row.right}`} className="grid grid-cols-2 border-b last:border-0"><div className={`min-h-7 whitespace-pre-wrap break-all border-r px-3 py-1 ${row.kind === "removed" || row.kind === "changed" ? "bg-red-500/10 text-red-800 dark:text-red-200" : ""}`}>{row.leftParts ? row.leftParts.map((part, partIndex) => <span key={partIndex} className={part.changed ? "rounded-sm bg-red-500/30" : ""}>{part.value}</span>) : row.left || " "}</div><div className={`min-h-7 whitespace-pre-wrap break-all px-3 py-1 ${row.kind === "added" || row.kind === "changed" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : ""}`}>{row.rightParts ? row.rightParts.map((part, partIndex) => <span key={partIndex} className={part.changed ? "rounded-sm bg-emerald-500/30" : ""}>{part.value}</span>) : row.right || " "}</div></div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

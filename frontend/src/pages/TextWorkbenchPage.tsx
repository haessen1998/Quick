import { useMemo, useState } from "react"
import { Columns2, Eye, FileText, Sparkles } from "lucide-react"
import DOMPurify from "dompurify"
import { diffLines } from "diff"
import { marked } from "marked"

import { Button } from "@/components/ui/button"

type DiffRow = { left: string; right: string; kind: "same" | "changed" | "added" | "removed" }

function buildDiffRows(left: string, right: string): DiffRow[] {
  const changes = diffLines(left, right)
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
      for (let row = 0; row < count; row += 1) rows.push({ left: lines[row] ?? "", right: added[row] ?? "", kind: "changed" })
      index += 1
      continue
    }
    rows.push(...lines.map((line) => ({ left: change.removed ? line : "", right: change.added ? line : "", kind: change.removed ? "removed" as const : "added" as const })))
  }
  return rows
}

export default function TextWorkbenchPage() {
  const [mode, setMode] = useState<"markdown" | "diff">("markdown")
  const [markdown, setMarkdown] = useState("# Quick\n\n一个基于 **Wails 3 + React** 的开发者工具箱。\n\n- 字符串格式化\n- 数据转换\n- 网络与加密工具\n\n```go\nfmt.Println(\"Quick\")\n```")
  const [left, setLeft] = useState("Quick\nWails 3\nReact\n旧内容\n")
  const [right, setRight] = useState("Quick\nWails 3\nReact + shadcn/ui\n新内容\n")
  const preview = useMemo(() => DOMPurify.sanitize(marked.parse(markdown, { gfm: true, breaks: true }) as string), [markdown])
  const rows = useMemo(() => buildDiffRows(left, right), [left, right])

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">文本工作台</h1><p className="mt-2 text-sm text-muted-foreground">实时 Markdown 安全预览，以及逐行的左右文本差异比较。</p></div>
        <div className="mb-4 flex gap-2"><Button variant={mode === "markdown" ? "default" : "outline"} onClick={() => setMode("markdown")}><FileText />Markdown 预览</Button><Button variant={mode === "diff" ? "default" : "outline"} onClick={() => setMode("diff")}><Columns2 />文本对比</Button></div>

        {mode === "markdown" ? (
          <div className="grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-2">
            <label className="border-b lg:border-r lg:border-b-0"><div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium"><FileText className="size-4" />Markdown</div><textarea className="app-interactive h-[36rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none" value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} /></label>
            <div><div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium"><Eye className="size-4" />预览</div><article className="markdown-preview h-[36rem] overflow-auto p-6" dangerouslySetInnerHTML={{ __html: preview }} /></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="grid border-b md:grid-cols-2"><label className="border-b md:border-r md:border-b-0"><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">原始文本</div><textarea className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={left} onChange={(event) => setLeft(event.target.value)} spellCheck={false} /></label><label><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">对比文本</div><textarea className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={right} onChange={(event) => setRight(event.target.value)} spellCheck={false} /></label></div>
            <div className="max-h-[30rem] overflow-auto font-mono text-xs">
              <div className="sticky top-0 grid grid-cols-2 border-b bg-card font-sans text-xs font-medium"><div className="border-r px-3 py-2">原始</div><div className="px-3 py-2">修改后</div></div>
              {rows.map((row, index) => <div key={`${index}-${row.left}-${row.right}`} className="grid grid-cols-2 border-b last:border-0"><div className={`min-h-7 whitespace-pre-wrap break-all border-r px-3 py-1 ${row.kind === "removed" || row.kind === "changed" ? "bg-red-500/12 text-red-700 dark:text-red-300" : ""}`}>{row.left || " "}</div><div className={`min-h-7 whitespace-pre-wrap break-all px-3 py-1 ${row.kind === "added" || row.kind === "changed" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : ""}`}>{row.right || " "}</div></div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

import { CodeEditor } from "@/components/CodeEditor"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { Granularity,useTextWorkbenchPageViewModel } from "@/models/TextWorkbenchPageModel"
import { Columns2,Eye,FileText,Sparkles } from "lucide-react"

export default function TextWorkbenchPage() {
 const { mode, setMode, markdown, setMarkdown, left, setLeft, right, setRight, granularity, setGranularity, ignoreWhitespace, setIgnoreWhitespace, rows } = useTextWorkbenchPageViewModel()
return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("开发工具")}</div><h1 className="text-3xl font-semibold tracking-tight">{uiText("文本工作台")}</h1><p className="mt-2 text-sm text-muted-foreground">{uiText("实时 Markdown 与 Mermaid 图表预览，以及带行内高亮的智能文本差异比较。")}</p></div>
        <div className="mb-4 flex gap-2"><Button variant={mode === "markdown" ? "default" : "outline"} onClick={() => setMode("markdown")}><FileText />{uiText("Markdown 预览")}</Button><Button variant={mode === "diff" ? "default" : "outline"} onClick={() => setMode("diff")}><Columns2 />{uiText("文本对比")}</Button></div>

        {mode === "markdown" ? (
          <div className="grid min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-2">
            <label className="min-w-0 border-b lg:border-r lg:border-b-0"><div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium"><FileText className="size-4" />Markdown</div><CodeEditor className="app-interactive h-[36rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none" aria-label="Markdown" value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} /></label>
            <div className="min-w-0"><div className="flex h-11 items-center justify-between gap-2 border-b px-4 text-sm font-medium"><span className="flex items-center gap-2"><Eye className="size-4" />{uiText("预览")}</span><span className="text-xs font-normal text-muted-foreground">{uiText("支持 Mermaid")}</span></div><div className="max-h-[48rem] min-w-0 overflow-auto p-4 sm:p-6"><MarkdownRenderer value={markdown} className="min-w-0 max-w-full" /></div></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3"><span className="text-xs font-medium text-muted-foreground">{uiText("对比精度")}</span><select className="app-interactive rounded-lg border bg-background px-3 py-1.5 text-sm" value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)}><option value="word">{uiText("智能单词级")}</option><option value="char">{uiText("字符级")}</option><option value="line">{uiText("仅行级")}</option></select><label className="app-interactive ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} className="accent-primary" />{uiText("忽略空白差异")}</label></div>
            <div className="grid border-b md:grid-cols-2"><label className="border-b md:border-r md:border-b-0"><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">{uiText("原始文本")}</div><CodeEditor className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={left} onChange={(event) => setLeft(event.target.value)} spellCheck={false} /></label><label><div className="h-10 border-b px-4 py-3 text-xs text-muted-foreground">{uiText("对比文本")}</div><CodeEditor className="app-interactive h-52 w-full resize-none overflow-auto p-4 font-mono text-sm leading-6 outline-none" value={right} onChange={(event) => setRight(event.target.value)} spellCheck={false} /></label></div>
            <div className="max-h-[30rem] overflow-auto font-mono text-xs">
              <div className="sticky top-0 grid grid-cols-2 border-b bg-card font-sans text-xs font-medium"><div className="border-r px-3 py-2">{uiText("原始")}</div><div className="px-3 py-2">{uiText("修改后")}</div></div>
              {rows.map((row, index) => <div key={`${index}-${row.left}-${row.right}`} className="grid grid-cols-2 border-b last:border-0"><div className={`min-h-7 whitespace-pre-wrap break-all border-r px-3 py-1 ${row.kind === "removed" || row.kind === "changed" ? "bg-red-500/10 text-red-800 dark:text-red-200" : ""}`}>{row.leftParts ? row.leftParts.map((part, partIndex) => <span key={partIndex} className={part.changed ? "rounded-sm bg-red-500/30" : ""}>{part.value}</span>) : row.left || " "}</div><div className={`min-h-7 whitespace-pre-wrap break-all px-3 py-1 ${row.kind === "added" || row.kind === "changed" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : ""}`}>{row.rightParts ? row.rightParts.map((part, partIndex) => <span key={partIndex} className={part.changed ? "rounded-sm bg-emerald-500/30" : ""}>{part.value}</span>) : row.right || " "}</div></div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

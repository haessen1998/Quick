import { CodeEditor } from "@/components/CodeEditor"
import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToolWorkspaceViewModel } from "@/models/ToolWorkspaceModel"
import { ArrowRightLeft,Check,Clipboard,Eraser,Play,Sparkles,TriangleAlert } from "lucide-react"

export function ToolWorkspace() {
 const { title, description, tools, activeToolOptions, outputPlaceholder, language, t, activeTool, input, setInput, output, setOutput, error, setError, processing, copied, groups, selectTool, processInput, copyOutput } = useToolWorkspaceViewModel()
return (
    <section className="page-shell @container/workspace">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            {uiText("开发工具")}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{t(title)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t(description)}</p>
        </div>

        <div className="grid gap-4 @3xl/workspace:grid-cols-[12rem_minmax(0,1fr)]">
          <aside className="hidden @3xl/workspace:block max-h-[calc(100dvh-11rem)] overflow-auto rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
            {groups.map((group) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-2 py-2 text-xs font-medium text-muted-foreground">{t(group)}</div>
                <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
                  {tools.filter((tool) => tool.group === group).map((tool) => {
                    const Icon = tool.icon
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={cn(
                          "app-interactive flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                          activeTool.id === tool.id && "bg-muted font-medium text-foreground",
                        )}
                        onClick={() => selectTool(tool)}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{t(tool.label)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </aside>

          <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
<select className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 @3xl/workspace:hidden" aria-label={uiText("选择工具")} value={activeTool.id} onChange={event => { const tool = tools.find(t => t.id === event.target.value); if (tool) selectTool(tool) }}>{tools.map(tool => <option key={tool.id} value={tool.id}>{t(tool.label)}</option>)}</select>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{t(activeTool.label)}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(activeTool.description)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { setInput(activeTool.sample); setOutput(""); setError("") }}>{t("载入示例")}</Button>
                <Button variant="outline" size="sm" onClick={() => { setInput(""); setOutput(""); setError("") }}>
                  <Eraser /> {t("清空")}
                </Button>
                <Button variant="outline" size="sm" disabled={!output} onClick={() => { setInput(output); setOutput(input); setError("") }}>
                  <ArrowRightLeft /> {t("交换")}
                </Button>
                <Button size="sm" disabled={processing || !input} onClick={processInput}>
                  <Play /> {t(processing ? "处理中…" : "执行")}
                </Button>
              </div>
            </div>

            {activeToolOptions?.[activeTool.id] && <div className="border-b bg-muted/10 px-4 py-3">{activeToolOptions[activeTool.id]}</div>}

            {error && (
              <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 break-words">
                  <div className="font-medium">{t("处理失败")}</div>
                  <div className="mt-1 font-mono text-xs opacity-90">{error}</div>
                </div>
              </div>
            )}

            <div className="grid @4xl/workspace:grid-cols-2">
              <div className="min-w-0 border-b @4xl/workspace:border-r @4xl/workspace:border-b-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>{t("输入")}</span><span>{input.length} {language === "en-US" ? "characters" : uiText("字符")}</span>
                </div>
                <CodeEditor
                  aria-label={t("输入")}
                  className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  error={error} value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={t("在这里输入内容…")}
                  spellCheck={false}
                />
              </div>
              <div className="min-w-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>{t("输出")}</span>
                  <Button variant="ghost" size="xs" disabled={!output} onClick={copyOutput}>
                    {copied ? <Check /> : <Clipboard />}{t(copied ? "已复制" : "复制")}
                  </Button>
                </div>
                <CodeEditor
                  className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-muted/20 p-4 font-mono text-sm leading-6 outline-none"
                  value={output}
                  readOnly
                  placeholder={t(outputPlaceholder)}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

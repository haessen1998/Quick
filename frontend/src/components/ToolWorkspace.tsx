import { useMemo, useState } from "react"
import { ArrowRightLeft, Check, Clipboard, Eraser, Play, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TextTool = {
  id: string
  label: string
  description: string
  group: string
  icon: LucideIcon
  sample: string
  run: (input: string) => string | Promise<string>
}

type ToolWorkspaceProps = {
  title: string
  description: string
  tools: TextTool[]
  outputPlaceholder?: string
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function ToolWorkspace({ title, description, tools, outputPlaceholder = "处理结果会显示在这里…" }: ToolWorkspaceProps) {
  const [activeToolId, setActiveToolId] = useState(tools[0]?.id ?? "")
  const activeTool = useMemo(() => tools.find((tool) => tool.id === activeToolId) ?? tools[0], [activeToolId, tools])
  const [input, setInput] = useState(tools[0]?.sample ?? "")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const groups = useMemo(() => Array.from(new Set(tools.map((tool) => tool.group))), [tools])

  if (!activeTool) return null

  const selectTool = (tool: TextTool) => {
    setActiveToolId(tool.id)
    setInput(tool.sample)
    setOutput("")
    setError("")
  }

  const processInput = async () => {
    setProcessing(true)
    setError("")
    try {
      const result = await activeTool.run(input)
      setOutput(result)
      toast.success(`${activeTool.label}完成`)
    } catch (caughtError) {
      const message = getErrorMessage(caughtError)
      setOutput("")
      setError(message)
      toast.error(`${activeTool.label}失败`, { description: message })
    } finally {
      setProcessing(false)
    }
  }

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      toast.success("结果已复制")
      window.setTimeout(() => setCopied(false), 1500)
    } catch (caughtError) {
      toast.error("复制失败", { description: getErrorMessage(caughtError) })
    }
  }

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            开发工具
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="max-h-[calc(100dvh-11rem)] overflow-auto rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
            {groups.map((group) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-2 py-2 text-xs font-medium text-muted-foreground">{group}</div>
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
                        <span className="truncate">{tool.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </aside>

          <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{activeTool.label}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{activeTool.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { setInput(""); setOutput(""); setError("") }}>
                  <Eraser /> 清空
                </Button>
                <Button variant="outline" size="sm" disabled={!output} onClick={() => { setInput(output); setOutput(input); setError("") }}>
                  <ArrowRightLeft /> 交换
                </Button>
                <Button size="sm" disabled={processing || !input} onClick={processInput}>
                  <Play /> {processing ? "处理中…" : "执行"}
                </Button>
              </div>
            </div>

            {error && (
              <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 break-words">
                  <div className="font-medium">处理失败</div>
                  <div className="mt-1 font-mono text-xs opacity-90">{error}</div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2">
              <label className="min-w-0 border-b md:border-r md:border-b-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>输入</span><span>{input.length} 字符</span>
                </div>
                <textarea
                  className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="在这里输入内容…"
                  spellCheck={false}
                />
              </label>
              <div className="min-w-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>输出</span>
                  <Button variant="ghost" size="xs" disabled={!output} onClick={copyOutput}>
                    {copied ? <Check /> : <Clipboard />}{copied ? "已复制" : "复制"}
                  </Button>
                </div>
                <textarea
                  className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-muted/20 p-4 font-mono text-sm leading-6 outline-none"
                  value={output}
                  readOnly
                  placeholder={outputPlaceholder}
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

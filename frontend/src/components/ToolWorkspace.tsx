import { useCallback, useMemo, useState, type ReactNode } from "react"
import { ArrowRightLeft, Check, Clipboard, Eraser, Play, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage } from "@/lib/i18n"
import type { PageId } from "@/lib/pages"
import { useSmartInput } from "@/lib/smart-input"
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
  assistantPage: PageId
  activeToolOptions?: Partial<Record<string, ReactNode>>
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function ToolWorkspace({ title, description, tools, assistantPage, activeToolOptions, outputPlaceholder = "处理结果会显示在这里…" }: ToolWorkspaceProps) {
  const { language, t } = useLanguage()
  const [activeToolId, setActiveToolId] = useState(tools[0]?.id ?? "")
  const activeTool = useMemo(() => tools.find((tool) => tool.id === activeToolId) ?? tools[0], [activeToolId, tools])
  const [input, setInput] = useState(tools[0]?.sample ?? "")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const groups = useMemo(() => Array.from(new Set(tools.map((tool) => tool.group))), [tools])

  useSmartInput(assistantPage, useCallback((values) => {
    const operation = String(values.operation ?? "")
    const nextTool = tools.find((tool) => tool.id === operation) ?? tools[0]
    if (!nextTool) return
    setActiveToolId(nextTool.id)
    setInput(String(values.input ?? ""))
    setOutput("")
    setError("")
  }, [tools]))

  const executeTool = async (tool: TextTool, value: string, fromAssistant = false) => {
    setActiveToolId(tool.id)
    setInput(value)
    setProcessing(true)
    setError("")
    try {
      const result = await tool.run(value)
      setOutput(result)
      toast.success(`${tool.label}完成`)
      return { success: true, operation: tool.id, label: tool.label, result: result.slice(0, 16000), truncated: result.length > 16000, executed: true }
    } catch (caughtError) {
      const message = getErrorMessage(caughtError)
      setOutput("")
      setError(message)
      toast.error(`${tool.label}失败`, { description: message })
      if (fromAssistant) return { success: false, operation: tool.id, error: message, executed: true }
      throw caughtError
    } finally {
      setProcessing(false)
    }
  }

  useAssistantCapability({
    page: assistantPage,
    getContext: () => ({
      operation: activeTool?.id ?? "",
      operationLabel: activeTool?.label ?? "",
      input: input.slice(0, 8000),
      output: output.slice(0, 8000),
      error,
    }),
    actions: {
      fill: (values) => {
        const operation = String(values.operation ?? "")
        const nextTool = tools.find((tool) => tool.id === operation)
        if (!nextTool) throw new Error(`不支持的格式化操作：${operation}`)
        const nextInput = String(values.input ?? "")
        setActiveToolId(nextTool.id)
        setInput(nextInput)
        setOutput("")
        setError("")
        toast.success(`小Q已填写：${nextTool.label}`)
        return { success: true, operation: nextTool.id, label: nextTool.label, inputLength: nextInput.length, executed: false }
      },
      run: (values) => {
        const operation = String(values.operation ?? "")
        const nextTool = tools.find((tool) => tool.id === operation)
        if (!nextTool) throw new Error(`不支持的格式化操作：${operation}`)
        return executeTool(nextTool, String(values.input ?? ""), true)
      },
    },
  })

  if (!activeTool) return null

  const selectTool = (tool: TextTool) => {
    setActiveToolId(tool.id)
    setInput(tool.sample)
    setOutput("")
    setError("")
  }

  const processInput = async () => {
    try { await executeTool(activeTool, input) } catch { /* Error state and toast are handled by executeTool. */ }
  }

  const copyOutput = async () => {
    try {
      await writeClipboard(output)
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
          <h1 className="text-3xl font-semibold tracking-tight">{t(title)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t(description)}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="max-h-[calc(100dvh-11rem)] overflow-auto rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
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
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{t(activeTool.label)}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(activeTool.description)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
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

            <div className="grid md:grid-cols-2">
              <label className="min-w-0 border-b md:border-r md:border-b-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>{t("输入")}</span><span>{input.length} {language === "en-US" ? "characters" : "字符"}</span>
                </div>
                <textarea
                  className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={t("在这里输入内容…")}
                  spellCheck={false}
                />
              </label>
              <div className="min-w-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>{t("输出")}</span>
                  <Button variant="ghost" size="xs" disabled={!output} onClick={copyOutput}>
                    {copied ? <Check /> : <Clipboard />}{t(copied ? "已复制" : "复制")}
                  </Button>
                </div>
                <textarea
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

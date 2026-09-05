import { uiText } from "@/lib/i18n"
import { getToolName,isToolUIPart,type UIMessage } from "ai"
import { BookOpen,BrainCircuit,Check,CheckCircle2,ChevronDown,CircleAlert,Clipboard,Code2,LoaderCircle,ShieldQuestion,Sparkles } from "lucide-react"
import { useEffect,useMemo,useRef,useState } from "react"

import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Accordion,AccordionContent,AccordionItem,AccordionTrigger } from "@/components/ui/accordion"
import { writeClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

const TOOL_LABELS: Record<string, string> = {
  navigate_to_page: "切换页面",
  get_current_page_context: "读取页面状态",
  format_text: "格式化字符串",
  convert_data: "转换数据",
  time_and_identifiers: "处理时间与标识符",
  validate_content: "校验内容",
  crypto_operation: "加密与验证",
  network_operation: "运行网络工具",
  open_text_workbench: "填写文本工作台",
  prepare_mcp_inspector: "准备 MCP 测试",
  inspect_saved_mcp_server: "读取 MCP Tools",
  call_saved_mcp_tool: "调用 MCP Tool",
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="app-interactive flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={async () => {
        await writeClipboard(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      aria-label={uiText("复制内容")}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Clipboard className="size-3.5" />}
    </button>
  )
}

function DataPanel({ label, value, tone = "default" }: { label: string; value: unknown; tone?: "default" | "error" }) {
  const text = formatValue(value)
  if (!text) return null

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background/80", tone === "error" && "border-destructive/30 bg-destructive/5")}>
      <div className="flex h-8 items-center gap-2 border-b px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <Code2 className="size-3" />
        <span className="flex-1">{label}</span>
        <CopyValueButton value={text} />
      </div>
      <pre className={cn("max-h-72 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-5 text-foreground/85", tone === "error" && "text-destructive")}>{text}</pre>
    </div>
  )
}

function toolStatus(part: Extract<UIMessage["parts"][number], { toolCallId: string }>, messageStreaming: boolean) {
  if (part.state === "output-error") return { label: "失败", tone: "error" as const, icon: CircleAlert }
  if (part.state === "output-denied" || (part.state === "approval-responded" && !part.approval.approved)) return { label: "已取消", tone: "error" as const, icon: CircleAlert }
  if (part.state === "output-available") return { label: part.preliminary && messageStreaming ? "返回中" : "已完成", tone: "success" as const, icon: CheckCircle2 }
  if (part.state === "approval-requested") return { label: "等待确认", tone: "warning" as const, icon: ShieldQuestion }
  if (!messageStreaming) return { label: "未完成", tone: "warning" as const, icon: CircleAlert }
  if (part.state === "approval-responded") return { label: part.approval.approved ? "已批准" : "已拒绝", tone: part.approval.approved ? "active" as const : "error" as const, icon: part.approval.approved ? LoaderCircle : CircleAlert }
  return { label: part.state === "input-streaming" ? "接收参数" : "执行中", tone: "active" as const, icon: LoaderCircle }
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function AssistantMessageFlow({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const processParts = useMemo(
    () => message.parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => part.type === "step-start" || part.type === "reasoning" || isToolUIPart(part)),
    [message.parts],
  )
  const sourceParts = useMemo(
    () => message.parts.filter((part) => part.type === "source-url" || part.type === "source-document"),
    [message.parts],
  )
  const groups = useMemo(() => {
    const result: Array<{ step: number; items: typeof processParts }> = []
    let current: { step: number; items: typeof processParts } | null = null
    for (const entry of processParts) {
      if (entry.part.type === "step-start") {
        if (current?.items.length) result.push(current)
        current = { step: result.length + 1, items: [] }
        continue
      }
      if (!current) current = { step: result.length + 1, items: [] }
      current.items.push(entry)
    }
    if (current?.items.length) result.push(current)
    return result
  }, [processParts])

  const attentionIDs = useMemo(() => {
    const ids: string[] = []
    for (const { part, index } of processParts) {
      if (part.type === "reasoning" && streaming && part.state === "streaming") ids.push("reasoning-" + (part.id ?? index))
      if (isToolUIPart(part)) {
        const terminal = ["output-available", "output-denied"].includes(part.state)
        if ((streaming && !terminal) || part.state === "output-error") ids.push("tool-" + part.toolCallId)
      }
    }
    return ids
  }, [processParts, streaming])
  const attentionSignature = attentionIDs.join("|")
  const previousAttention = useRef(new Set<string>())
  const wasStreaming = useRef(streaming)
  const [expanded, setExpanded] = useState<string[]>([])
  const [processOpen, setProcessOpen] = useState(streaming)

  useEffect(() => {
    const nextAttention = new Set(attentionIDs)
    setExpanded((current) => {
      const next = current.filter((id) => !(previousAttention.current.has(id) && !nextAttention.has(id)))
      for (const id of nextAttention) if (!next.includes(id)) next.push(id)
      return next
    })
    previousAttention.current = nextAttention
  }, [attentionSignature])

  useEffect(() => {
    if (streaming) setProcessOpen(true)
    else if (wasStreaming.current) setProcessOpen(false)
    wasStreaming.current = streaming
  }, [streaming])

  const toolCount = processParts.filter(({ part }) => isToolUIPart(part)).length
  const completedTools = processParts.filter(({ part }) => isToolUIPart(part) && part.state === "output-available").length
  const failedTools = processParts.filter(({ part }) => isToolUIPart(part) && (part.state === "output-error" || part.state === "output-denied" || (part.state === "approval-responded" && !part.approval.approved))).length
  const reasoningCount = processParts.filter(({ part }) => part.type === "reasoning").length
  const hasContent = groups.length > 0 || sourceParts.length > 0
  const detailsID = `assistant-flow-${message.id}`
  if (!hasContent) return null

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-border/70 bg-muted/15 text-xs shadow-sm">
      <button type="button" className="app-interactive flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/30" aria-expanded={processOpen} aria-controls={detailsID} onClick={() => setProcessOpen((value) => !value)}>
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background", streaming && "border-primary/30 text-primary")}>
          {streaming ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{streaming ? uiText("正在处理") : uiText("执行过程")}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {toolCount ? completedTools + "/" + toolCount + uiText(" 个工具已完成") : reasoningCount ? uiText("模型思考过程") : sourceParts.length + uiText(" 个引用来源")}
            {sourceParts.length && (toolCount || reasoningCount) ? " · " + sourceParts.length + uiText(" 个来源") : ""}
          </span>
        </span>
        {!streaming && (failedTools
          ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">{failedTools} {uiText("个异常")}</span>
          : <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">{uiText("完成")}</span>)}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", processOpen && "rotate-180")} />
      </button>

      {processOpen && <Accordion id={detailsID} type="multiple" value={expanded} onValueChange={setExpanded} className="animate-in fade-in slide-in-from-top-1 border-t border-border/60 px-1.5 py-1 duration-150">
        {groups.map((group) => (
          <div key={group.step}>
            {groups.length > 1 && <div className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary/55" />{uiText("步骤")}{group.step}</div>}
            {group.items.map(({ part, index }) => {
              if (part.type === "reasoning") {
                const id = "reasoning-" + (part.id ?? index)
                const thinking = streaming && part.state === "streaming"
                return (
                  <AccordionItem key={id} value={id}>
                    <AccordionTrigger>
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", thinking ? "bg-violet-500/10 text-violet-600 dark:text-violet-300" : "bg-muted text-muted-foreground")}>
                        {thinking ? <LoaderCircle className="size-3.5 animate-spin" /> : <BrainCircuit className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">{thinking ? uiText("正在思考") : uiText("思考过程")}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{part.text ? part.text.replace(/\s+/g, " ").slice(0, 80) : uiText("当前 Provider 未返回可显示的思考文本")}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{thinking ? uiText("生成中") : uiText("已完成")}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 rounded-lg border bg-background/75 p-3">
                        {part.text
                          ? <MarkdownRenderer value={part.text} streaming={thinking} className="text-xs leading-5" />
                          : <p className="text-xs leading-5 text-muted-foreground">{uiText("当前模型或 Provider 没有返回可展示的思考文本。部分模型只返回最终答案，或仅在开启 reasoning 配置后返回摘要。")}</p>}
                        {!part.text && part.providerMetadata && <DataPanel label="Provider Metadata" value={part.providerMetadata} />}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              }

              if (!isToolUIPart(part)) return null
              const id = "tool-" + part.toolCallId
              const toolName = getToolName(part)
              const status = toolStatus(part, streaming)
              const StatusIcon = status.icon
              const label = part.title || TOOL_LABELS[toolName] || toolName
              const input = "input" in part ? part.input : undefined
              const output = part.state === "output-available" ? part.output : undefined
              const error = part.state === "output-error"
                ? part.errorText
                : part.state === "output-denied"
                  ? part.approval.reason || uiText("用户拒绝了本次调用")
                  : part.state === "approval-responded" && !part.approval.approved
                    ? part.approval.reason || uiText("用户拒绝了本次调用")
                    : undefined

              return (
                <AccordionItem key={id} value={id}>
                  <AccordionTrigger>
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      status.tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                      status.tone === "error" && "bg-destructive/10 text-destructive",
                      status.tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-300",
                      status.tone === "active" && "bg-blue-500/10 text-blue-600 dark:text-blue-300",
                    )}>
                      <StatusIcon className={cn("size-3.5", status.tone === "active" && "animate-spin")} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{label}</span>
                      <code className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{toolName}</code>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", status.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{status.label}</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <DataPanel label={part.state === "input-streaming" && streaming ? uiText("正在接收参数") : uiText("调用参数")} value={input ?? (part.state === "input-streaming" && streaming ? uiText("参数仍在生成…") : undefined)} />
                    <DataPanel label={part.state === "output-available" && part.preliminary ? uiText("临时结果") : uiText("调用结果")} value={part.state === "output-available" && output === undefined ? uiText("（无返回值）") : output} />
                    <DataPanel label={uiText("错误信息")} value={error} tone="error" />
                    {part.state === "approval-requested" && <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 p-2.5 text-[11px] leading-5 text-amber-800 dark:text-amber-200"><ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />{uiText("等待你确认后才会执行该工具。")}</div>}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </div>
        ))}

        {sourceParts.length > 0 && (
          <AccordionItem value="sources">
            <AccordionTrigger>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300"><BookOpen className="size-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{uiText("参考来源")}</span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{uiText("本次回答使用了")}{sourceParts.length} {uiText("个来源")}</span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{sourceParts.length}</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2">
                {sourceParts.map((source, index) => source.type === "source-url" ? (
                  <a key={source.sourceId || index} href={source.url} target="_blank" rel="noreferrer" data-wml-openurl={source.url} className="app-interactive flex min-w-0 items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 transition-colors hover:bg-muted">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{source.title || sourceHost(source.url)}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{source.url}</span></span>
                  </a>
                ) : (
                  <div key={source.sourceId || index} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background/80 px-3 py-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{source.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{source.filename || source.mediaType}</span></span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>}
    </section>
  )
}

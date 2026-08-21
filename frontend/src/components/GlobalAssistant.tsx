import { type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { Bot, ChevronDown, LoaderCircle, MessageSquareText, RefreshCw, Send, Settings, ShieldCheck, Sparkles, Square, Trash2, Wrench } from "lucide-react"
import { DirectChatTransport, ToolLoopAgent, jsonSchema, stepCountIs, tool, type UIMessage } from "ai"

import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createLanguageModel, isAIProfileReady, type ChatSettings } from "@/lib/ai-provider"
import { buildQuickAssistantInstructions, buildQuickAssistantStarters } from "@/lib/assistant-manifest"
import { useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { useAssistantConversation } from "@/lib/assistant-conversation"
import { PAGE_IDS, PAGE_LABELS, type PageId } from "@/lib/pages"
import type { ProxySettings } from "@/lib/proxy"
import type { AIProfile, MCPServerProfile } from "@/lib/saved-connections"
import { cn } from "@/lib/utils"

const FORMATTER_OPERATIONS = ["json-format", "json-minify", "yaml-format", "xml-format", "xml-minify", "html-format", "html-minify", "css-format", "css-minify", "javascript-format", "javascript-minify"] as const
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const
const CONVERSION_MODULES = ["naming", "standard", "encoding", "bytes", "code", "radix"] as const
const TIME_OPERATIONS = ["timestamp-to-date", "date-to-timestamp", "timezone", "difference", "generate", "cron"] as const
const VALIDATION_MODES = ["jsonpath", "xpath", "regex"] as const
const CRYPTO_OPERATIONS = ["hash", "hmac", "aes-encrypt", "aes-decrypt", "rsa-generate-encryption", "rsa-generate-signing", "rsa-encrypt", "rsa-decrypt", "rsa-sign", "rsa-verify", "jwt-parse", "jwt-sign", "jwt-verify"] as const
const NETWORK_OPERATIONS = ["ping", "dns", "port", "cidr", "http-prepare", "curl-to-http", "http-to-curl", "process-search"] as const

type MCPCallRequest = {
  server: MCPServerProfile
  toolName: string
  args: Record<string, unknown>
}

type PendingMCPCall = MCPCallRequest & {
  resolve: (approved: boolean) => void
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function AssistantSession({ profile, activePage, onNavigate, mcpServers, proxy, autoApproveMCP, confirmMCPCall, open }: { profile: AIProfile; activePage: PageId; onNavigate: (page: PageId) => void; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveMCP: boolean; confirmMCPCall: (request: MCPCallRequest) => Promise<boolean>; open: boolean }) {
  const registry = useAssistantCapabilityRegistry()
  const { attach, publish } = useAssistantConversation()
  const activePageRef = useRef(activePage)
  const navigateRef = useRef(onNavigate)
  activePageRef.current = activePage
  navigateRef.current = onNavigate
  const settings: ChatSettings = profile

  const transport = useMemo(() => {
    const navigate = (page: PageId) => {
      navigateRef.current(page)
      return { success: true, page, label: PAGE_LABELS[page] }
    }
    const usePage = (page: PageId, action: string, input: Record<string, unknown>) => {
      navigate(page)
      return registry.execute(page, action, input)
    }
    const findMCPServer = (name: string) => {
      const normalized = name.trim().toLocaleLowerCase()
      const matches = mcpServers.filter((item) => item.name.toLocaleLowerCase() === normalized || item.id.toLocaleLowerCase() === normalized)
      if (!matches.length) throw new Error(`没有名为“${name}”的已保存 MCP Server`)
      if (matches.length > 1) throw new Error(`存在多个名为“${name}”的 MCP Server，请先在设置页使用不同名称区分`)
      return matches[0]
    }
    const tools = {
      navigate_to_page: tool({
        description: "切换 Quick 当前页面。只切换页面，不修改页面内容。",
        inputSchema: jsonSchema<{ page: PageId }>({ type: "object", properties: { page: { type: "string", enum: PAGE_IDS, description: "目标页面 ID" } }, required: ["page"], additionalProperties: false }),
        execute: async ({ page }) => navigate(page),
      }),
      get_current_page_context: tool({
        description: "读取 Quick 当前页面及该页面愿意提供给助手的非敏感表单上下文。",
        inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {}, additionalProperties: false }),
        execute: async () => {
          const page = activePageRef.current
          return { page, label: PAGE_LABELS[page], context: registry.getPageContext(page) }
        },
      }),
      format_text: tool({
        description: "在字符串格式化页面执行 JSON/YAML/XML/HTML/CSS/JavaScript 格式化或压缩，并把输入与结果同步到页面。",
        inputSchema: jsonSchema<{ operation: typeof FORMATTER_OPERATIONS[number]; input: string }>({
          type: "object",
          properties: {
            operation: { type: "string", enum: [...FORMATTER_OPERATIONS], description: "格式化页面的操作 ID" },
            input: { type: "string", description: "写入格式化页面的完整输入" },
          },
          required: ["operation", "input"],
          additionalProperties: false,
        }),
        execute: async (input) => usePage("formatter", "run", input),
      }),
      convert_data: tool({
        description: "执行 Quick 数据转换：命名风格、标准数据格式、字符串编码、文本与字节、JSON 代码模型或整数进制转换。",
        inputSchema: jsonSchema<{ module: typeof CONVERSION_MODULES[number]; source: string; target: string; input: string }>({
          type: "object",
          properties: {
            module: { type: "string", enum: [...CONVERSION_MODULES], description: "naming/standard/encoding/bytes/code/radix" },
            source: { type: "string", description: "来源格式 ID；例如 json、yaml、text、hex、10" },
            target: { type: "string", description: "目标格式 ID；例如 yaml、camel、base64、go、16" },
            input: { type: "string", description: "待转换的完整内容" },
          },
          required: ["module", "source", "target", "input"],
          additionalProperties: false,
        }),
        execute: async (input) => usePage("converter", "convert", input),
      }),
      time_and_identifiers: tool({
        description: "执行时间戳/日期、时区、日期差值、Cron 解析，或生成 UUID/GUID/ULID/雪花 ID/随机内容。密码只显示在 Quick 页面。",
        inputSchema: jsonSchema<{ operation: typeof TIME_OPERATIONS[number]; value?: string; unit?: string; sourceZone?: string; targetZone?: string; start?: string; end?: string; generator?: string; length?: number; cron?: string; zone?: string }>({
          type: "object",
          properties: {
            operation: { type: "string", enum: [...TIME_OPERATIONS] }, value: { type: "string", description: "时间戳或 ISO 日期时间" }, unit: { type: "string", enum: ["seconds", "milliseconds"] },
            sourceZone: { type: "string" }, targetZone: { type: "string" }, start: { type: "string" }, end: { type: "string" },
            generator: { type: "string", enum: ["uuid", "guid", "ulid", "snowflake", "string", "number", "password"] }, length: { type: "number", minimum: 1, maximum: 4096 }, cron: { type: "string" }, zone: { type: "string" },
          },
          required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("time-ids", "run", input),
      }),
      validate_content: tool({
        description: "使用 JSONPath、XPath 或带 Flags 的 JavaScript 正则表达式执行校验，并同步匹配结果。",
        inputSchema: jsonSchema<{ mode: typeof VALIDATION_MODES[number]; expression: string; input: string; flags?: string }>({
          type: "object", properties: { mode: { type: "string", enum: [...VALIDATION_MODES] }, expression: { type: "string" }, input: { type: "string" }, flags: { type: "string", description: "正则 Flags，仅 gimsuy" } },
          required: ["mode", "expression", "input"], additionalProperties: false,
        }),
        execute: async (input) => usePage("validation", "run", input),
      }),
      crypto_operation: tool({
        description: "使用 Quick 加密页。普通 Hash 和 JWT 解析可直接执行；HMAC、AES、RSA、JWT 签名/验证只填写非敏感字段，密钥或密码必须由用户在页面输入并确认。RSA 密钥可在页面生成但不会返回给助手。",
        inputSchema: jsonSchema<{ operation: typeof CRYPTO_OPERATIONS[number]; input?: string; algorithm?: string; signature?: string; publicKey?: string }>({
          type: "object", properties: { operation: { type: "string", enum: [...CRYPTO_OPERATIONS] }, input: { type: "string" }, algorithm: { type: "string", enum: ["MD5", "SHA-1", "SHA-256", "SHA-512"] }, signature: { type: "string" }, publicKey: { type: "string", description: "仅公钥；不要提供私钥" } },
          required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("crypto", "run", input),
      }),
      network_operation: tool({
        description: "使用网络工具。Ping、DNS、TCP 端口、CIDR 和带条件的进程搜索仅在用户明确要求时执行；HTTP 只准备不发送；cURL/HTTP 可离线互转；绝不关闭进程。",
        inputSchema: jsonSchema<{ operation: typeof NETWORK_OPERATIONS[number]; host?: string; port?: number; recordType?: string; cidr?: string; method?: typeof HTTP_METHODS[number]; url?: string; headers?: string; body?: string; curl?: string; searchType?: string; query?: string }>({
          type: "object", properties: {
            operation: { type: "string", enum: [...NETWORK_OPERATIONS] }, host: { type: "string" }, port: { type: "number", minimum: 1, maximum: 65535 }, recordType: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "NS", "TXT"] }, cidr: { type: "string" },
            method: { type: "string", enum: [...HTTP_METHODS] }, url: { type: "string" }, headers: { type: "string", description: "每行 Header: value；不要放入秘密" }, body: { type: "string" }, curl: { type: "string" }, searchType: { type: "string", enum: ["port", "pid", "name"] }, query: { type: "string" },
          }, required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("network", "run", input),
      }),
      open_text_workbench: tool({
        description: "打开文本工作台并填写 Markdown 预览，或准备行/单词/字符级文本对比。",
        inputSchema: jsonSchema<{ mode: "markdown" | "diff"; markdown?: string; left?: string; right?: string; granularity?: "line" | "word" | "char"; ignoreWhitespace?: boolean }>({
          type: "object", properties: { mode: { type: "string", enum: ["markdown", "diff"] }, markdown: { type: "string" }, left: { type: "string" }, right: { type: "string" }, granularity: { type: "string", enum: ["line", "word", "char"] }, ignoreWhitespace: { type: "boolean" } },
          required: ["mode"], additionalProperties: false,
        }),
        execute: async (input) => usePage("text-workbench", "fill", input),
      }),
      prepare_mcp_inspector: tool({
        description: "在 MCP 测试页选择一个设置中已保存的 Server，或只填写不含凭据的远程/STDIO 连接参数。不会连接 Server，也不会调用 Tool。",
        inputSchema: jsonSchema<{ profileName?: string; transport?: "streamable-http" | "sse" | "stdio"; url?: string; command?: string; argsJSON?: string; cwd?: string }>({
          type: "object", properties: { profileName: { type: "string", description: "设置页保存的 MCP 名称" }, transport: { type: "string", enum: ["streamable-http", "sse", "stdio"] }, url: { type: "string" }, command: { type: "string" }, argsJSON: { type: "string", description: "STDIO 参数 JSON 数组" }, cwd: { type: "string" } }, additionalProperties: false,
        }),
        execute: async (input) => usePage("mcp-inspector", "prepare", input),
      }),
      ...(mcpServers.length ? {
        inspect_saved_mcp_server: tool<{ serverName: string; toolName?: string }, Record<string, unknown>, Record<string, unknown>>({
          description: "按名称临时连接设置页中已保存的 MCP Server 并立即断开。不传 toolName 时列出 Tools；传入准确 toolName 时返回该 Tool 的完整输入 Schema。仅在用户明确要求使用该 MCP 时调用。",
          inputSchema: jsonSchema<{ serverName: string; toolName?: string }>({
            type: "object", properties: { serverName: { type: "string", description: "设置页中保存的 MCP Server 名称" }, toolName: { type: "string", description: "可选；需要查看参数时传入准确 Tool 名称" } }, required: ["serverName"], additionalProperties: false,
          }),
          execute: async ({ serverName, toolName }): Promise<Record<string, unknown>> => {
            const server = findMCPServer(serverName)
            const { listSavedMCPTools } = await import("@/lib/mcp-assistant-client")
            const details = await listSavedMCPTools(server, proxy)
            if (toolName) {
              const selectedTool = details.tools.find((item) => item.name === toolName)
              if (!selectedTool) throw new Error(`${server.name} 没有名为“${toolName}”的 Tool`)
              const schema = JSON.stringify(selectedTool.inputSchema)
              return {
                success: true,
                configuredName: server.name,
                server: { name: details.name, version: details.version },
                tool: { name: selectedTool.name, title: selectedTool.title, description: selectedTool.description?.slice(0, 4000), inputSchema: schema.length <= 24000 ? selectedTool.inputSchema : { truncated: true, preview: schema.slice(0, 24000) } },
              }
            }
            return {
              success: true,
              configuredName: server.name,
              server: { name: details.name, version: details.version, instructions: details.instructions.slice(0, 4000) },
              tools: details.tools.slice(0, 100).map((item) => ({ name: item.name, title: item.title, description: item.description?.slice(0, 1000) })),
              truncated: details.tools.length > 100,
            }
          },
        }),
        call_saved_mcp_tool: tool({
          description: `调用设置页中已保存 MCP Server 的一个 Tool。${autoApproveMCP ? "设置页已开启自动审核，本次调用不会弹确认框；仍然只能响应用户明确要求。" : "调用前 Quick 必定向用户展示 Server、Tool 和参数确认框；用户取消时不得重试。"}建议先 inspect 获取真实 Tool 名称和 Schema。`,
          inputSchema: jsonSchema<{ serverName: string; toolName: string; arguments: Record<string, unknown> }>({
            type: "object",
            properties: {
              serverName: { type: "string", description: "设置页中保存的 MCP Server 名称" },
              toolName: { type: "string", description: "inspect 返回的准确 Tool 名称" },
              arguments: { type: "object", description: "符合 Tool inputSchema 的参数", additionalProperties: true },
            },
            required: ["serverName", "toolName", "arguments"], additionalProperties: false,
          }),
          execute: async ({ serverName, toolName, arguments: args }) => {
            const server = findMCPServer(serverName)
            const approved = autoApproveMCP || await confirmMCPCall({ server, toolName, args })
            if (!approved) return { success: false, cancelled: true, executed: false, message: "用户取消了 MCP Tool 调用" }
            const { callSavedMCPTool, summarizeMCPResult } = await import("@/lib/mcp-assistant-client")
            const result = await callSavedMCPTool(server, proxy, toolName, args)
            return { success: !result.isError, executed: true, autoApproved: autoApproveMCP, server: server.name, tool: toolName, result: summarizeMCPResult(result) }
          },
        }),
      } : {}),
    }
    const agent = new ToolLoopAgent({
      model: createLanguageModel(settings),
      instructions: buildQuickAssistantInstructions(settings.systemPrompt, mcpServers, autoApproveMCP),
      tools,
      stopWhen: stepCountIs(8),
      maxOutputTokens: 2048,
    })
    return new DirectChatTransport({ agent })
  }, [profile.id, profile.provider, profile.model, profile.apiKey, profile.baseURL, profile.systemPrompt, registry, mcpServers, proxy.mode, proxy.url, autoApproveMCP, confirmMCPCall])

  const [input, setInput] = useState("")
  const [starterPrompts, setStarterPrompts] = useState<string[]>([])
  const starterVariant = useRef(0)
  const startersInitialized = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { messages, sendMessage, status, stop, setMessages, error, clearError } = useChat({ transport, throttle: 40 })
  const busy = status === "submitted" || status === "streaming"
  const controllerRef = useRef({
    send: async (_text: string) => {},
    stop: () => {},
    clear: () => {},
  })
  const refreshStarterPrompts = () => {
    starterVariant.current += 1
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current))
  }

  useEffect(() => {
    if (!open || startersInitialized.current) return
    startersInitialized.current = true
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current))
  }, [open, activePage, mcpServers, registry])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" })
  }, [messages, status])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    clearError()
    setInput("")
    await sendMessage({ text })
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void send() }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() }
  }

  controllerRef.current = {
    send: async (text: string) => {
      const prompt = text.trim()
      if (!prompt || busy) return
      clearError()
      await sendMessage({ text: prompt })
    },
    stop,
    clear: () => { stop(); setMessages([]); clearError() },
  }

  useEffect(() => attach({
    send: (text) => controllerRef.current.send(text),
    stop: () => controllerRef.current.stop(),
    clear: () => controllerRef.current.clear(),
  }), [attach])

  useEffect(() => {
    publish({
      messages,
      status,
      error: error?.message ?? "",
      profileName: profile.name,
      model: profile.model,
    })
  }, [messages, status, error, profile.name, profile.model, publish])

  return <>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/10">
      {messages.length ? messages.map((message, index) => {
        const text = messageText(message)
        const user = message.role === "user"
        const isLastAssistant = !user && index === messages.length - 1
        const isStreaming = status === "streaming" && isLastAssistant
        const isPending = busy && isLastAssistant
        return <div key={message.id} className={cn("border-b px-4 py-3", user ? "flex justify-end" : "bg-background/70")}>
          <div className={cn("min-w-0 text-sm leading-6", user && "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground")}>
            {text
              ? user
                ? <span className="whitespace-pre-wrap">{text}</span>
                : <MarkdownRenderer value={text} streaming={isStreaming} className="text-sm" />
              : !user && (isPending
                ? <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />正在调用页面能力…</div>
                : <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><Wrench className="size-3.5" />工具调用已完成</div>)}
          </div>
        </div>
      }) : <div className="flex h-full min-h-64 flex-col items-center justify-center p-5 text-center"><h3 className="text-sm font-medium">我是 Quick 页面助手</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">我了解整个工具箱，可以执行本地转换与校验、准备页面内容，并在你明确要求时运行网络诊断或已保存的 MCP Tools。</p><div className="mt-4 w-full"><div className="mb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">为当前页面推荐</div><div className="grid gap-2">{starterPrompts.map((prompt) => <button key={prompt} type="button" className="rounded-lg border bg-background px-3 py-2 text-left text-xs leading-5 transition-colors hover:bg-muted" onClick={() => setInput(prompt)}>{prompt}</button>)}</div></div></div>}
    </div>
    <div className="shrink-0 border-t bg-background p-3">
      {error && <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/8 p-2 text-xs text-destructive">{error.message || "AI 请求失败"}</div>}
      <form onSubmit={submit} className="rounded-xl border bg-background p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/25">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} disabled={busy} className="block max-h-28 min-h-14 w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-5 outline-none" placeholder="问问题，或让我调用 Quick 工具…" />
        <div className="flex items-center justify-between pt-1">
          <details className="group relative">
            <summary className="app-interactive flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30" aria-label="刷新与清空"><RefreshCw className="size-3.5" /></summary>
            <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted" onClick={(event) => { refreshStarterPrompts(); event.currentTarget.closest("details")?.removeAttribute("open") }}><RefreshCw className="size-3.5" />换一组智能提示</button>
              <button type="button" disabled={!messages.length} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-45" onClick={(event) => { stop(); setMessages([]); clearError(); event.currentTarget.closest("details")?.removeAttribute("open") }}><Trash2 className="size-3.5" />清空对话</button>
            </div>
          </details>
          {busy ? <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label="停止生成"><Square className="size-3.5 fill-current" /></Button> : <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="发送"><Send className="size-3.5" /></Button>}
        </div>
      </form>
    </div>
  </>
}

export function GlobalAssistant({ profiles, mcpServers, proxy, autoApproveMCP, activePage, onNavigate, open, onOpenChange, onOpenInAIChat }: { profiles: AIProfile[]; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveMCP: boolean; activePage: PageId; onNavigate: (page: PageId) => void; open: boolean; onOpenChange: (open: boolean) => void; onOpenInAIChat: () => void }) {
  const [selectedID, setSelectedID] = useState(() => profiles.find((profile) => isAIProfileReady(profile))?.id ?? profiles[0]?.id ?? "")
  const [position, setPosition] = useState({ right: 16, bottom: 16 })
  const [pendingMCPCall, setPendingMCPCall] = useState<PendingMCPCall | null>(null)
  const pendingMCPRef = useRef<PendingMCPCall | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const drag = useRef<{ pointerID: number; x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const selected = profiles.find((profile) => profile.id === selectedID)

  const confirmMCPCall = useCallback((request: MCPCallRequest) => new Promise<boolean>((resolve) => {
    pendingMCPRef.current?.resolve(false)
    const pending = { ...request, resolve }
    pendingMCPRef.current = pending
    setPendingMCPCall(pending)
  }), [])

  const finishMCPCall = useCallback((approved: boolean) => {
    const pending = pendingMCPRef.current
    pendingMCPRef.current = null
    setPendingMCPCall(null)
    pending?.resolve(approved)
  }, [])

  useEffect(() => () => {
    pendingMCPRef.current?.resolve(false)
    pendingMCPRef.current = null
  }, [])

  useEffect(() => {
    if (selected) return
    setSelectedID(profiles.find((profile) => isAIProfileReady(profile))?.id ?? profiles[0]?.id ?? "")
  }, [profiles, selected])

  const clampPosition = (right: number, bottom: number, element: HTMLElement | null) => {
    if (!element || !window.matchMedia("(min-width: 640px)").matches) return { right: 16, bottom: 16 }
    const bounds = element.getBoundingClientRect()
    const maxRight = Math.max(12, Math.min(280, window.innerWidth - bounds.width - 12))
    const maxBottom = Math.max(12, Math.min(240, window.innerHeight - bounds.height - 12))
    return {
      right: Math.max(12, Math.min(maxRight, right)),
      bottom: Math.max(12, Math.min(maxBottom, bottom)),
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPosition((value) => clampPosition(value.right, value.bottom, open ? panelRef.current : buttonRef.current)))
    const resize = () => setPosition((value) => clampPosition(value.right, value.bottom, open ? panelRef.current : buttonRef.current))
    window.addEventListener("resize", resize)
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", resize) }
  }, [open])

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const interactive = (event.target as HTMLElement).closest("button, select, input, textarea, a")
    if (event.button !== 0 || !window.matchMedia("(min-width: 640px)").matches || (interactive && interactive !== event.currentTarget)) return
    const element = open ? panelRef.current : buttonRef.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    drag.current = {
      pointerID: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      right: window.innerWidth - bounds.right,
      bottom: window.innerHeight - bounds.bottom,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerID !== event.pointerId) return
    const deltaX = event.clientX - current.x
    const deltaY = event.clientY - current.y
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) current.moved = true
    setPosition(clampPosition(current.right - deltaX, current.bottom - deltaY, open ? panelRef.current : buttonRef.current))
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerID !== event.pointerId) return
    suppressClick.current = drag.current.moved
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const positionStyle = { "--assistant-right": `${position.right}px`, "--assistant-bottom": `${position.bottom}px` } as CSSProperties

  return (
    <>
    <button ref={buttonRef} hidden={open} type="button" data-wails-no-drag style={positionStyle} className="app-interactive fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 sm:bottom-[var(--assistant-bottom)] sm:right-[var(--assistant-right)] sm:cursor-grab sm:touch-none sm:active:cursor-grabbing" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return }; onOpenChange(true) }} aria-label="打开 Quick 页面助手"><Sparkles className="pointer-events-none size-5" /></button>
    <aside ref={panelRef} hidden={!open} data-wails-no-drag style={positionStyle} className="fixed inset-x-3 bottom-3 z-40 h-[min(34rem,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl sm:left-auto sm:bottom-[var(--assistant-bottom)] sm:right-[var(--assistant-right)] sm:w-96 [&:not([hidden])]:flex">
      <header className="flex h-14 shrink-0 select-none items-center gap-2 border-b px-3 sm:cursor-move sm:touch-none" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-4" /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-medium">Quick 页面助手</div><div className="truncate text-[10px] text-muted-foreground">当前：{PAGE_LABELS[activePage]}</div></div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => { onOpenChange(false); onOpenInAIChat() }} aria-label="在 AI 对话页打开"><MessageSquareText className="size-4" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="收起页面助手"><ChevronDown className="size-4" /></Button>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <select className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs" value={selectedID} onChange={(event) => setSelectedID(event.target.value)}><option value="">选择 AI 配置</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select>
        {mcpServers.length > 0 && <span className={cn("flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-muted/25 px-2 text-[10px] text-muted-foreground", autoApproveMCP && "border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-200")} title={`${mcpServers.length} 个 MCP Server 已注册到助手${autoApproveMCP ? "；自动审核已开启" : ""}`}><Wrench className="size-3" />MCP {mcpServers.length}{autoApproveMCP && " Auto"}</span>}
        <Button type="button" variant="outline" size="icon-sm" onClick={() => { onOpenChange(false); onNavigate("settings") }} aria-label="打开 AI 设置"><Settings className="size-3.5" /></Button>
      </div>
      {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">还没有 AI 配置</p><p className="mt-1 text-xs text-muted-foreground">请先在设置页新增一个 Provider。</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>打开设置</Button></div> : !isAIProfileReady(selected) ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">配置尚未完成</p><p className="mt-1 text-xs leading-5 text-muted-foreground">请为 {selected.name} 补充 API Key；Compatible Provider 还需要 Base URL。</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>完善配置</Button></div> : <AssistantSession key={selected.id} profile={selected} activePage={activePage} onNavigate={onNavigate} mcpServers={mcpServers} proxy={proxy} autoApproveMCP={autoApproveMCP} confirmMCPCall={confirmMCPCall} open={open} />}
    </aside>
    <Dialog open={Boolean(pendingMCPCall)} onOpenChange={(nextOpen) => { if (!nextOpen) finishMCPCall(false) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="size-4" />确认调用 MCP Tool</DialogTitle>
          <DialogDescription>页面助手请求调用已保存的 MCP。请检查 Server、Tool 和完整参数后再授权。</DialogDescription>
        </DialogHeader>
        {pendingMCPCall && <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/25 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Server</div><div className="mt-1 text-sm font-medium">{pendingMCPCall.server.name}</div><div className="mt-1 text-xs text-muted-foreground">{pendingMCPCall.server.transport}</div></div>
            <div className="rounded-lg border bg-muted/25 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tool</div><code className="mt-1 block break-all text-sm">{pendingMCPCall.toolName}</code></div>
          </div>
          <div><div className="mb-2 text-xs font-medium text-muted-foreground">调用参数</div><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5">{JSON.stringify(pendingMCPCall.args, null, 2)}</pre></div>
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>确认后 Quick 会临时连接该 Server、调用一次 Tool，然后关闭连接。Tool 的实际副作用由对应 MCP Server 决定。</span></div>
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => finishMCPCall(false)}>取消</Button><Button type="button" onClick={() => finishMCPCall(true)}>确认调用</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

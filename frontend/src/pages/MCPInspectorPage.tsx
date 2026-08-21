import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Braces,
  Check,
  CircleAlert,
  CircleStop,
  Clock3,
  Copy,
  History,
  LoaderCircle,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react"
import { Client, SSEClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import type { CallToolResult, Tool, Transport } from "@modelcontextprotocol/client"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import type { ProxySettings } from "@/lib/proxy"
import type { MCPConnectionMode, MCPServerProfile, MCPTransportType } from "@/lib/saved-connections"
import { cn } from "@/lib/utils"
import { MCPProxyService, MCPStdioService } from "../../bindings/changeme/services"

type JSONSchema = {
  type?: string | string[]
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  [key: string]: unknown
}
type JSONArguments = Record<string, unknown>
type HistoryEntry = {
  id: number
  method: string
  at: Date
  duration: number
  success: boolean
  detail: string
  payload?: unknown
}
type ServerSummary = {
  name: string
  version: string
  instructions: string
  capabilities: string[]
}

const INPUT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
const TEXTAREA_CLASS = "w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-5 outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30"

function hasWailsBridge() {
  const host = window as Window & {
    chrome?: { webview?: { postMessage?: unknown } }
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } }
    wails?: { invoke?: unknown; invokeAsync?: unknown }
  }
  return typeof host.chrome?.webview?.postMessage === "function"
    || typeof host.webkit?.messageHandlers?.external?.postMessage === "function"
    || typeof host.wails?.invoke === "function"
    || typeof host.wails?.invokeAsync === "function"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseHeaderLines(value: string) {
  const headers = new Headers()
  for (const originalLine of value.split(/\r?\n/)) {
    const line = originalLine.trim()
    if (!line) continue
    const separator = line.indexOf(":")
    if (separator <= 0) throw new Error(`无效请求头：${line}`)
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return headers
}

function initialArguments(tool: Tool | null): JSONArguments {
  if (!tool) return {}
  const schema = tool.inputSchema as JSONSchema
  const values: JSONArguments = {}
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (property.default !== undefined) values[name] = property.default
  }
  return values
}

function schemaType(schema: JSONSchema) {
  const value = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type
  return value ?? (schema.properties ? "object" : schema.items ? "array" : "string")
}

function JsonValue({ value }: { value: unknown }) {
  return <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>
}

function ToolResultView({ result }: { result: CallToolResult }) {
  const content = Array.isArray(result.content) ? result.content : []
  return (
    <div className="space-y-3">
      {result.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="size-4 shrink-0" />Server 将本次工具调用标记为错误
        </div>
      )}
      {content.map((block, index) => {
        if (block.type === "text") {
          return <pre key={index} className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/25 p-3 font-mono text-xs leading-5">{block.text}</pre>
        }
        if (block.type === "image") {
          return <img key={index} src={`data:${block.mimeType};base64,${block.data}`} alt="MCP 工具返回的图片" className="max-h-80 rounded-lg border object-contain" />
        }
        return <JsonValue key={index} value={block} />
      })}
      {result.structuredContent !== undefined && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Structured content</div>
          <JsonValue value={result.structuredContent} />
        </div>
      )}
      {content.length === 0 && result.structuredContent === undefined && <JsonValue value={result} />}
    </div>
  )
}

function SchemaField({ name, schema, required, value, onChange }: {
  name: string
  schema: JSONSchema
  required: boolean
  value: unknown
  onChange: (value: unknown, remove?: boolean) => void
}) {
  const type = schemaType(schema)
  const label = schema.title || name
  const enumValues = schema.enum ?? []
  const setStructuredValue = (text: string) => {
    if (!text.trim()) {
      onChange(undefined, true)
      return
    }
    try {
      onChange(JSON.parse(text))
    } catch (error) {
      toast.error(`${label} 不是有效的 JSON：${errorMessage(error)}`)
    }
  }

  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {label}{required && <span className="text-destructive">*</span>}
        <code className="ml-auto text-[10px] font-normal text-muted-foreground">{type}</code>
      </span>
      {schema.description && <span className="block text-[11px] leading-4 text-muted-foreground">{schema.description}</span>}
      {enumValues.length > 0 ? (
        <select className={INPUT_CLASS} value={value === undefined ? "" : String(value)} onChange={(event) => event.target.value ? onChange(enumValues.find((item) => String(item) === event.target.value)) : onChange(undefined, true)}>
          <option value="">{required ? "请选择" : "不传递"}</option>
          {enumValues.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
        </select>
      ) : type === "boolean" ? (
        <select className={INPUT_CLASS} value={value === undefined ? "" : String(value)} onChange={(event) => event.target.value === "" ? onChange(undefined, true) : onChange(event.target.value === "true")}>
          <option value="">{required ? "请选择" : "不传递"}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : type === "number" || type === "integer" ? (
        <input className={INPUT_CLASS} type="number" step={type === "integer" ? 1 : "any"} value={value === undefined ? "" : String(value)} placeholder={required ? "必填" : "可选"} onChange={(event) => event.target.value === "" ? onChange(undefined, true) : onChange(Number(event.target.value))} />
      ) : type === "object" || type === "array" ? (
        <textarea className={`${TEXTAREA_CLASS} h-24`} defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)} placeholder={type === "array" ? "[]" : "{}"} onBlur={(event) => setStructuredValue(event.target.value)} />
      ) : (
        <input className={INPUT_CLASS} value={value === undefined ? "" : String(value)} placeholder={required ? "必填" : "可选"} onChange={(event) => event.target.value === "" && !required ? onChange(undefined, true) : onChange(event.target.value)} />
      )}
    </label>
  )
}

export default function MCPInspectorPage({ proxy, profiles }: { proxy: ProxySettings; profiles: MCPServerProfile[] }) {
  const [selectedProfileID, setSelectedProfileID] = useState(profiles[0]?.id ?? "")
  const [transportType, setTransportType] = useState<MCPTransportType>(profiles[0]?.transport ?? "streamable-http")
  const [serverURL, setServerURL] = useState("http://127.0.0.1:3000/mcp")
  const [headersText, setHeadersText] = useState("")
  const [connectionMode, setConnectionMode] = useState<MCPConnectionMode>("quick-proxy")
  const [command, setCommand] = useState("")
  const [argsJSON, setArgsJSON] = useState("[]")
  const [envText, setEnvText] = useState("")
  const [cwd, setCwd] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [server, setServer] = useState<ServerSummary | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [toolSearch, setToolSearch] = useState("")
  const [selectedName, setSelectedName] = useState("")
  const [argumentsValue, setArgumentsValue] = useState<JSONArguments>({})
  const [rawArguments, setRawArguments] = useState("{}")
  const [rawMode, setRawMode] = useState(false)
  const [calling, setCalling] = useState(false)
  const [result, setResult] = useState<CallToolResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const clientRef = useRef<Client | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const proxySessionRef = useRef("")
  const stdioSessionRef = useRef("")
  const historyID = useRef(0)

  const applyProfile = useCallback((profile: MCPServerProfile) => {
    setTransportType(profile.transport)
    setServerURL(profile.url)
    setHeadersText(profile.headers)
    setConnectionMode(profile.connectionMode)
    setCommand(profile.command)
    setArgsJSON(profile.argsJSON)
    setEnvText(profile.env)
    setCwd(profile.cwd)
  }, [])

  useAssistantCapability({
    page: "mcp-inspector",
    getContext: () => {
      const currentTool = tools.find((item) => item.name === selectedName)
      return {
        selectedProfile: profiles.find((profile) => profile.id === selectedProfileID)?.name ?? "临时配置",
        transport: transportType,
        endpoint: transportType === "stdio" ? command : serverURL,
        hasCredentials: transportType === "stdio" ? Boolean(envText.trim()) : Boolean(headersText.trim()),
        connected,
        connecting,
        server: server ? { name: server.name, version: server.version, capabilities: server.capabilities } : null,
        tools: tools.slice(0, 100).map((item) => ({ name: item.name, title: item.title, description: item.description })),
        selectedTool: currentTool ? { name: currentTool.name, title: currentTool.title, description: currentTool.description } : null,
        historyCount: history.length,
      }
    },
    actions: {
      prepare: (values) => {
        if (connected || connecting) throw new Error("MCP Server 已连接或正在连接；请先在页面手动断开")
        const profileName = String(values.profileName ?? "").trim()
        if (profileName) {
          const profile = profiles.find((item) => item.name.toLocaleLowerCase() === profileName.toLocaleLowerCase())
          if (!profile) throw new Error(`没有名为“${profileName}”的已保存 MCP 配置`)
          setSelectedProfileID(profile.id); applyProfile(profile)
          toast.success(`已选择 MCP：${profile.name}；尚未连接`)
          return { success: true, profile: profile.name, transport: profile.transport, executed: false, connectionRequired: true }
        }
        const transport = String(values.transport ?? "streamable-http") as MCPTransportType
        if (!["streamable-http", "sse", "stdio"].includes(transport)) throw new Error(`不支持的 MCP Transport：${transport}`)
        if (transport === "stdio") {
          const nextCommand = String(values.command ?? "").trim()
          if (!nextCommand) throw new Error("STDIO 配置需要 command")
          const nextArgs = String(values.argsJSON ?? "[]")
          const parsedArgs = JSON.parse(nextArgs)
          if (!Array.isArray(parsedArgs) || parsedArgs.some((item) => typeof item !== "string")) throw new Error("argsJSON 必须是字符串数组")
          setSelectedProfileID(""); setTransportType(transport); setHeadersText(""); setEnvText("")
          setCommand(nextCommand); setArgsJSON(JSON.stringify(parsedArgs, null, 2)); setCwd(String(values.cwd ?? ""))
        } else {
          const nextURL = String(values.url ?? "").trim()
          if (!/^https?:\/\//i.test(nextURL)) throw new Error("远程 MCP URL 必须以 http:// 或 https:// 开头")
          setSelectedProfileID(""); setTransportType(transport); setHeadersText(""); setEnvText("")
          setServerURL(nextURL); setConnectionMode("quick-proxy")
        }
        toast.success("MCP 连接参数已准备；尚未连接")
        return { success: true, transport, executed: false, connectionRequired: true, credentialsCleared: true }
      },
    },
  })

  useEffect(() => {
    if (!selectedProfileID) return
    const selected = profiles.find((profile) => profile.id === selectedProfileID)
    if (selected) applyProfile(selected)
    else setSelectedProfileID(profiles[0]?.id ?? "")
  }, [applyProfile, profiles, selectedProfileID])

  const selectedTool = useMemo(() => tools.find((tool) => tool.name === selectedName) ?? null, [selectedName, tools])
  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase()
    if (!query) return tools
    return tools.filter((tool) => `${tool.name} ${tool.title ?? ""} ${tool.description ?? ""}`.toLowerCase().includes(query))
  }, [toolSearch, tools])

  const addHistory = useCallback((method: string, startedAt: number, success: boolean, detail: string, payload?: unknown) => {
    setHistory((entries) => [{ id: ++historyID.current, method, at: new Date(), duration: Math.round(performance.now() - startedAt), success, detail, payload }, ...entries].slice(0, 40))
  }, [])

  const closeConnection = useCallback(async (updateState = true) => {
    const client = clientRef.current
    const transport = transportRef.current
    const proxySession = proxySessionRef.current
    const stdioSession = stdioSessionRef.current
    clientRef.current = null
    transportRef.current = null
    proxySessionRef.current = ""
    stdioSessionRef.current = ""
    try {
      if (client) await client.close()
      else if (transport) await transport.close()
    } catch {
      // Connection cleanup is best-effort; the local proxy session is still removed below.
    }
    if (proxySession && hasWailsBridge()) {
      try { await MCPProxyService.CloseSession(proxySession) } catch { /* Quick may already be closing. */ }
    }
    if (stdioSession && hasWailsBridge()) {
      try { await MCPStdioService.Close(stdioSession) } catch { /* Quick may already be closing. */ }
    }
    if (updateState) {
      setConnected(false)
      setServer(null)
      setTools([])
      setSelectedName("")
      setResult(null)
    }
  }, [])

  useEffect(() => () => { void closeConnection(false) }, [closeConnection])

  const loadTools = useCallback(async (client = clientRef.current) => {
    const stdioSession = stdioSessionRef.current
    if (!client && !stdioSession) return
    const startedAt = performance.now()
    try {
      let response: { tools: Tool[] }
      if (stdioSession) {
        const nativeResult = await MCPStdioService.ListTools(stdioSession)
        if (!nativeResult.success) throw new Error(nativeResult.error || "无法读取 STDIO Tools")
        response = { tools: JSON.parse(nativeResult.toolsJson) as Tool[] }
      } else {
        response = await client!.listTools()
      }
      setTools(response.tools)
      setSelectedName((current) => response.tools.some((tool) => tool.name === current) ? current : response.tools[0]?.name ?? "")
      addHistory("tools/list", startedAt, true, `返回 ${response.tools.length} 个工具`, response)
    } catch (error) {
      addHistory("tools/list", startedAt, false, errorMessage(error))
      toast.error(`读取工具失败：${errorMessage(error)}`)
    }
  }, [addHistory])

  const connect = async () => {
    if (transportType === "stdio" && !command.trim()) {
      toast.error("请输入 STDIO 启动命令")
      return
    }
    if (transportType !== "stdio" && !serverURL.trim()) {
      toast.error("请输入 MCP Server 地址")
      return
    }
    if ((transportType === "stdio" || connectionMode === "quick-proxy") && !hasWailsBridge()) {
      toast.error("Quick 本地代理仅在桌面应用中可用；浏览器预览请选择直连")
      return
    }
    setConnecting(true)
    await closeConnection()
    const startedAt = performance.now()
    let proxySession = ""
    let transport: Transport | null = null
    try {
      if (transportType === "stdio") {
        const nativeResult = await MCPStdioService.Connect(command, argsJSON, envText, cwd)
        if (!nativeResult.success) throw new Error(nativeResult.error || "无法启动 STDIO MCP Server")
        stdioSessionRef.current = nativeResult.sessionId
        setServer({
          name: nativeResult.name || "STDIO MCP Server",
          version: nativeResult.version || "未知版本",
          instructions: nativeResult.instructions || "",
          capabilities: nativeResult.capabilities ?? [],
        })
        setConnected(true)
        addHistory("initialize", startedAt, true, `${nativeResult.name || "STDIO MCP Server"} ${nativeResult.version || ""}`.trim(), { capabilities: nativeResult.capabilities })
        toast.success("STDIO MCP Server 已连接")
        await loadTools(null)
        return
      }
      let endpoint = serverURL.trim()
      let requestHeaders: Headers
      if (connectionMode === "quick-proxy") {
        const session = await MCPProxyService.CreateSession(endpoint, headersText, proxy.mode, proxy.url)
        if (!session.success) throw new Error(session.error || "无法创建 Quick 本地代理会话")
        endpoint = session.endpoint
        proxySession = session.id
        proxySessionRef.current = session.id
        requestHeaders = new Headers({ "X-Quick-MCP-Token": session.token })
      } else {
        requestHeaders = parseHeaderLines(headersText)
      }
      const client = new Client({ name: "quick-mcp-tester", version: "0.1.0" })
      transport = transportType === "sse"
        ? new SSEClientTransport(new URL(endpoint), {
            requestInit: { headers: requestHeaders },
            eventSourceInit: {
              fetch: async (url, init) => {
                const headers = new Headers(init.headers)
                requestHeaders.forEach((value, name) => headers.set(name, value))
                return fetch(url, { ...init, headers })
              },
            },
          })
        : new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: requestHeaders } })
      transport.onerror = (error) => toast.error(`MCP 连接错误：${error.message}`)
      await client.connect(transport)
      clientRef.current = client
      transportRef.current = transport
      const version = client.getServerVersion()
      const capabilities = client.getServerCapabilities() ?? {}
      setServer({
        name: version?.name ?? "MCP Server",
        version: version?.version ?? "未知版本",
        instructions: client.getInstructions() ?? "",
        capabilities: Object.keys(capabilities),
      })
      setConnected(true)
      addHistory("initialize", startedAt, true, `${version?.name ?? "MCP Server"} ${version?.version ?? ""}`.trim(), { capabilities })
      toast.success("MCP Server 已连接")
      await loadTools(client)
    } catch (error) {
      addHistory("initialize", startedAt, false, errorMessage(error))
      if (transport) try { await transport.close() } catch { /* Ignore cleanup errors. */ }
      if (proxySession && hasWailsBridge()) try { await MCPProxyService.CloseSession(proxySession) } catch { /* Ignore cleanup errors. */ }
      proxySessionRef.current = ""
      toast.error(`连接失败：${errorMessage(error)}`)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    const values = initialArguments(selectedTool)
    setArgumentsValue(values)
    setRawArguments(JSON.stringify(values, null, 2))
    setResult(null)
  }, [selectedTool])

  const updateArgument = (name: string, value: unknown, remove = false) => {
    setArgumentsValue((current) => {
      const next = { ...current }
      if (remove) delete next[name]
      else next[name] = value
      setRawArguments(JSON.stringify(next, null, 2))
      return next
    })
  }

  const callTool = async () => {
    const client = clientRef.current
    const stdioSession = stdioSessionRef.current
    if ((!client && !stdioSession) || !selectedTool) return
    setCalling(true)
    const startedAt = performance.now()
    try {
      const args = rawMode ? JSON.parse(rawArguments) as JSONArguments : argumentsValue
      if (!args || Array.isArray(args) || typeof args !== "object") throw new Error("工具参数必须是 JSON 对象")
      let response: CallToolResult
      if (stdioSession) {
        const nativeResult = await MCPStdioService.CallTool(stdioSession, selectedTool.name, JSON.stringify(args))
        if (!nativeResult.success) throw new Error(nativeResult.error || "STDIO 工具调用失败")
        response = JSON.parse(nativeResult.resultJson) as CallToolResult
      } else {
        response = await client!.callTool({ name: selectedTool.name, arguments: args })
      }
      setResult(response)
      addHistory("tools/call", startedAt, !response.isError, selectedTool.name, { arguments: args, result: response })
      if (response.isError) toast.error(`${selectedTool.name} 返回错误`)
      else toast.success(`${selectedTool.name} 调用完成`)
    } catch (error) {
      addHistory("tools/call", startedAt, false, `${selectedTool.name}: ${errorMessage(error)}`)
      toast.error(`调用失败：${errorMessage(error)}`)
    } finally {
      setCalling(false)
    }
  }

  const inputSchema = (selectedTool?.inputSchema ?? {}) as JSONSchema
  const requiredNames = new Set(inputSchema.required ?? [])

  return (
    <section className="page-shell mcp-inspector-page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />开发工具
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">MCP Server 测试</h1>
            <p className="mt-2 text-sm text-muted-foreground">通过 Streamable HTTP、旧版 SSE 或本地 STDIO 连接，检查 Tools 并实际调用。</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : connecting ? "animate-pulse bg-amber-500" : "bg-muted-foreground/40")} />
            {connected ? `${server?.name ?? "MCP Server"} 已连接` : connecting ? "正在建立连接" : "尚未连接"}
          </div>
        </div>

        <article className="mb-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3.5">
            <Server className="size-4" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">连接配置</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">可直接选择设置页中长期保存的 MCP 配置</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              当前编辑仅用于本次连接
            </div>
          </div>

          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <label className="block space-y-1.5 text-xs font-medium">
                <span>已保存的 MCP</span>
                <select className={INPUT_CLASS} value={selectedProfileID} disabled={connected || connecting} onChange={(event) => {
                  const id = event.target.value
                  setSelectedProfileID(id)
                  const profile = profiles.find((item) => item.id === id)
                  if (profile) applyProfile(profile)
                }}>
                  <option value="">临时自定义（不会保存）</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>Transport</span>
                  <select className={INPUT_CLASS} value={transportType} disabled={connected || connecting} onChange={(event) => { setTransportType(event.target.value as MCPTransportType); setSelectedProfileID("") }}>
                    <option value="streamable-http">Streamable HTTP</option>
                    <option value="sse">SSE（旧版兼容）</option>
                    <option value="stdio">STDIO（本地进程）</option>
                  </select>
                </label>
                {transportType === "stdio" ? (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>启动命令</span>
                    <input className={INPUT_CLASS} value={command} disabled={connected || connecting} onChange={(event) => { setCommand(event.target.value); setSelectedProfileID("") }} placeholder="npx、uvx 或可执行文件路径" />
                  </label>
                ) : (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>Server URL</span>
                    <input className={INPUT_CLASS} value={serverURL} disabled={connected || connecting} onChange={(event) => { setServerURL(event.target.value); setSelectedProfileID("") }} placeholder={transportType === "sse" ? "http://127.0.0.1:3000/sse" : "http://127.0.0.1:3000/mcp"} />
                  </label>
                )}
              </div>
              {transportType === "stdio" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-xs font-medium"><span>参数（JSON 字符串数组）</span><textarea className={`${TEXTAREA_CLASS} h-24`} value={argsJSON} disabled={connected || connecting} onChange={(event) => { setArgsJSON(event.target.value); setSelectedProfileID("") }} placeholder={'["-y", "@example/mcp-server"]'} /></label>
                  <label className="block space-y-1.5 text-xs font-medium"><span>环境变量（每行 KEY=value）</span><textarea className={`${TEXTAREA_CLASS} h-24`} value={envText} disabled={connected || connecting} onChange={(event) => { setEnvText(event.target.value); setSelectedProfileID("") }} placeholder={"API_KEY=…\nLOG_LEVEL=error"} /></label>
                  <label className="block space-y-1.5 text-xs font-medium sm:col-span-2"><span>工作目录（可选）</span><input className={INPUT_CLASS} value={cwd} disabled={connected || connecting} onChange={(event) => { setCwd(event.target.value); setSelectedProfileID("") }} placeholder="留空使用 Quick 的当前目录" /></label>
                </div>
              ) : (
                <label className="block space-y-1.5 text-xs font-medium">
                  <span className="flex items-center justify-between gap-2"><span>自定义请求头</span><span className="font-normal text-muted-foreground">每行填写一个 Header: value</span></span>
                  <textarea className={`${TEXTAREA_CLASS} h-24`} value={headersText} disabled={connected || connecting} onChange={(event) => { setHeadersText(event.target.value); setSelectedProfileID("") }} placeholder={"Authorization: Bearer …\nX-API-Key: …"} />
                </label>
              )}
            </div>

            {transportType !== "stdio" ? <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">连接方式</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {([
                  { id: "quick-proxy" as const, label: "Quick 本地代理", description: "规避 WebView CORS，并使用设置页代理" },
                  { id: "direct" as const, label: "直接连接", description: "适合已经允许 CORS 的 Server" },
                ]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "app-interactive rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                      connectionMode === option.id && "border-primary bg-muted ring-1 ring-primary",
                    )}
                    disabled={connected || connecting}
                    onClick={() => { setConnectionMode(option.id); setSelectedProfileID("") }}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <span className={cn("size-2 rounded-full border", connectionMode === option.id && "border-primary bg-primary")} />
                      {option.label}
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                  </button>
                ))}
              </div>
            </fieldset> : (
              <div className="rounded-lg border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mb-2 size-4 text-emerald-600 dark:text-emerald-400" />
                STDIO 由 Quick 后端使用官方 Go SDK 启动，不经过 shell；命令必须是本机可执行程序。
              </div>
            )}
          </div>

          {server && (
            <div className="mx-4 mb-4 flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 text-xs sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2 font-medium"><Server className="size-3.5 shrink-0" /><span className="truncate">{server.name}</span><span className="font-normal text-muted-foreground">{server.version}</span></div>
              <div className="flex flex-wrap gap-1 sm:ml-auto">{server.capabilities.map((capability) => <span key={capability} className="rounded border bg-background px-1.5 py-0.5 text-[10px]">{capability}</span>)}</div>
              {server.instructions && <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground sm:max-w-sm">{server.instructions}</p>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t bg-muted/10 p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{transportType === "stdio" ? "本地进程：环境变量和工作目录仅用于本次启动" : `网络代理：${proxy.mode === "system" ? "跟随系统/环境" : proxy.mode === "none" ? "不使用" : proxy.url || "自定义代理尚未填写"}`}</p>
            {connected ? (
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void closeConnection()}><CircleStop />断开连接</Button>
            ) : (
              <Button type="button" className="w-full sm:w-auto" disabled={connecting} onClick={() => void connect()}>{connecting ? <LoaderCircle className="animate-spin" /> : <PlugZap />}{connecting ? "正在连接" : "连接 Server"}</Button>
            )}
          </div>
        </article>

        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm lg:max-h-[calc(100svh-12rem)]">
            <div className="flex items-center gap-2 border-b px-4 py-3.5">
              <Wrench className="size-4" />
              <h2 className="text-sm font-medium">Tools</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tools.length}</span>
              <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" disabled={!connected} onClick={() => void loadTools()} aria-label="重新读取工具"><RefreshCw className="size-3.5" /></Button>
            </div>
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input className={`${INPUT_CLASS} pl-8`} value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder="搜索 Tools" />
              </div>
            </div>
            <div className="grid max-h-72 gap-1 overflow-y-auto p-2 sm:grid-cols-2 lg:max-h-[calc(100svh-20rem)] lg:grid-cols-1">
              {!connected ? (
                <div className="p-5 text-center text-xs leading-5 text-muted-foreground sm:col-span-2 lg:col-span-1">连接 Server 后显示可用 Tools</div>
              ) : filteredTools.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">没有匹配的 Tool</div>
              ) : filteredTools.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  className={cn(
                    "app-interactive rounded-lg border border-transparent p-3 text-left transition-colors hover:bg-muted",
                    selectedName === tool.name && "border-primary bg-muted ring-1 ring-primary",
                  )}
                  onClick={() => setSelectedName(tool.name)}
                >
                  <div className="flex items-center gap-2 text-xs font-medium"><Wrench className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{tool.title || tool.name}</span></div>
                  {tool.title && <code className="mt-1 block truncate text-[10px] text-muted-foreground">{tool.name}</code>}
                  {tool.description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>}
                </button>
              ))}
            </div>
          </aside>

          <article className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
            {!selectedTool ? (
              <div className="grid min-h-72 place-items-center p-8 text-center">
                <div><Braces className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">选择一个 Tool</p><p className="mt-1 text-xs text-muted-foreground">查看参数 Schema 并实际调用</p></div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{selectedTool.title || selectedTool.name}</h2>
                    <code className="text-[11px] text-muted-foreground">{selectedTool.name}</code>
                    {selectedTool.description && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{selectedTool.description}</p>}
                  </div>
                  <Button type="button" className="w-full sm:w-auto" disabled={calling || !connected} onClick={() => void callTool()}>{calling ? <LoaderCircle className="animate-spin" /> : <Play />}{calling ? "调用中" : "调用 Tool"}</Button>
                </div>

                <div className="grid xl:grid-cols-2">
                  <section className="min-w-0 border-b p-4 xl:border-r xl:border-b-0">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">参数</h3>
                      <div className="flex rounded-lg border p-0.5 text-[10px]"><button type="button" className={cn("app-interactive rounded-md px-2 py-1", !rawMode && "bg-muted font-medium")} onClick={() => setRawMode(false)}>表单</button><button type="button" className={cn("app-interactive rounded-md px-2 py-1", rawMode && "bg-muted font-medium")} onClick={() => setRawMode(true)}>JSON</button></div>
                    </div>
                    {rawMode ? (
                      <textarea className={`${TEXTAREA_CLASS} h-64`} value={rawArguments} onChange={(event) => setRawArguments(event.target.value)} spellCheck={false} />
                    ) : Object.keys(inputSchema.properties ?? {}).length > 0 ? (
                      <div className="grid gap-4">{Object.entries(inputSchema.properties ?? {}).map(([name, schema]) => <SchemaField key={name} name={name} schema={schema} required={requiredNames.has(name)} value={argumentsValue[name]} onChange={(value, remove) => updateArgument(name, value, remove)} />)}</div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">这个 Tool 没有声明输入参数</div>
                    )}
                  </section>

                  <section className="min-w-0 p-4">
                    <div className="mb-3 flex h-7 items-center justify-between gap-2"><h3 className="text-xs font-medium text-muted-foreground">调用结果</h3>{result && <Button type="button" variant="ghost" size="xs" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("结果 JSON 已复制") }}><Copy className="size-3" />复制</Button>}</div>
                    {result ? <ToolResultView result={result} /> : <div className="grid min-h-52 place-items-center rounded-lg bg-muted/25 p-5 text-center text-xs text-muted-foreground">调用完成后在这里显示结果</div>}
                  </section>
                </div>
              </>
            )}
          </article>
        </div>

        <article className="mt-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3.5">
            <History className="size-4" /><h2 className="text-sm font-medium">调用历史</h2><span className="text-[10px] text-muted-foreground">{history.length}</span>
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "收起" : "展开"}</Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={!history.length} onClick={() => setHistory([])} aria-label="清空调用历史"><Trash2 className="size-3.5" /></Button>
          </div>
          {showHistory && (
            <div className="max-h-64 overflow-y-auto p-2">
              {history.length === 0 ? <div className="p-8 text-center text-xs text-muted-foreground">暂无请求</div> : history.map((entry) => (
                <details key={entry.id} className="group mb-1 rounded-lg border bg-muted/15 text-[11px] last:mb-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                    {entry.success ? <Check className="size-3 text-emerald-500" /> : <CircleAlert className="size-3 text-destructive" />}
                    <code>{entry.method}</code><span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.detail}</span><Clock3 className="size-3 text-muted-foreground" /><span className="tabular-nums text-muted-foreground">{entry.duration} ms</span><span className="hidden text-muted-foreground sm:inline">{entry.at.toLocaleTimeString()}</span>
                  </summary>
                  {entry.payload !== undefined && <div className="border-t p-2"><JsonValue value={entry.payload} /></div>}
                </details>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

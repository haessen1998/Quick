import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { uiText } from "@/lib/i18n"
import { acquireMCPConnection } from "@/lib/mcp-connections"
import type { ProxySettings } from "@/lib/proxy"
import {
  QUICK_APP_MCP_URL,
  createMCPServerProfile,
  type MCPConnectionMode,
  type MCPServerProfile,
  type MCPTransportType,
} from "@/lib/saved-connections"
import { useDraftState } from "@/lib/workspace-store"
import type { CallToolResult, Tool } from "@modelcontextprotocol/client"
import { CircleAlert } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { toast } from "sonner"

export type JSONSchema = {
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

export type JSONArguments = Record<string, unknown>

export type HistoryEntry = {
  id: number
  method: string
  at: Date
  duration: number
  success: boolean
  detail: string
  payload?: unknown
}

export type ServerSummary = {
  name: string
  version: string
  instructions: string
  capabilities: string[]
}

export const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"

export const TEXTAREA_CLASS =
  "w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-5 outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30"

export function hasWailsBridge() {
  const host = window as Window & {
    chrome?: { webview?: { postMessage?: unknown } }
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } }
    wails?: { invoke?: unknown; invokeAsync?: unknown }
  }
  return (
    typeof host.chrome?.webview?.postMessage === "function" ||
    typeof host.webkit?.messageHandlers?.external?.postMessage === "function" ||
    typeof host.wails?.invoke === "function" ||
    typeof host.wails?.invokeAsync === "function"
  )
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function parseHeaderLines(value: string) {
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

export function initialArguments(tool: Tool | null): JSONArguments {
  if (!tool) return {}
  const schema = tool.inputSchema as JSONSchema
  const values: JSONArguments = {}
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (property.default !== undefined) values[name] = property.default
  }
  return values
}

export function schemaType(schema: JSONSchema) {
  const value = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type
  return value ?? (schema.properties ? "object" : schema.items ? "array" : "string")
}

export function JsonValue({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function ToolResultView({ result }: { result: CallToolResult }) {
  const content = Array.isArray(result.content) ? result.content : []
  return (
    <div className="space-y-3">
      {result.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          {uiText("Server 将本次工具调用标记为错误")}
        </div>
      )}
      {content.map((block, index) => {
        if (block.type === "text") {
          return (
            <pre
              key={index}
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/25 p-3 font-mono text-xs leading-5"
            >
              {block.text}
            </pre>
          )
        }
        if (block.type === "image") {
          return (
            <img
              key={index}
              src={`data:${block.mimeType};base64,${block.data}`}
              alt={uiText("MCP 工具返回的图片")}
              className="max-h-80 rounded-lg border object-contain"
            />
          )
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

export function SchemaField({
  name,
  schema,
  required,
  value,
  onChange,
}: {
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
        {label}
        {required && <span className="text-destructive">*</span>}
        <code className="ml-auto text-[10px] font-normal text-muted-foreground">{type}</code>
      </span>
      {schema.description && <span className="block text-[11px] leading-4 text-muted-foreground">{schema.description}</span>}
      {enumValues.length > 0 ? (
        <select
          className={INPUT_CLASS}
          value={value === undefined ? "" : String(value)}
          onChange={(event) =>
            event.target.value ? onChange(enumValues.find((item) => String(item) === event.target.value)) : onChange(undefined, true)
          }
        >
          <option value="">{required ? uiText("请选择") : uiText("不传递")}</option>
          {enumValues.map((item) => (
            <option key={String(item)} value={String(item)}>
              {String(item)}
            </option>
          ))}
        </select>
      ) : type === "boolean" ? (
        <select
          className={INPUT_CLASS}
          value={value === undefined ? "" : String(value)}
          onChange={(event) => (event.target.value === "" ? onChange(undefined, true) : onChange(event.target.value === "true"))}
        >
          <option value="">{required ? uiText("请选择") : uiText("不传递")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : type === "number" || type === "integer" ? (
        <input
          className={INPUT_CLASS}
          type="number"
          step={type === "integer" ? 1 : "any"}
          value={value === undefined ? "" : String(value)}
          placeholder={required ? uiText("必填") : uiText("可选")}
          onChange={(event) => (event.target.value === "" ? onChange(undefined, true) : onChange(Number(event.target.value)))}
        />
      ) : type === "object" || type === "array" ? (
        <textarea
          className={`${TEXTAREA_CLASS} h-24`}
          defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)}
          placeholder={type === "array" ? "[]" : "{}"}
          onBlur={(event) => setStructuredValue(event.target.value)}
        />
      ) : (
        <input
          className={INPUT_CLASS}
          value={value === undefined ? "" : String(value)}
          placeholder={required ? uiText("必填") : uiText("可选")}
          onChange={(event) => (event.target.value === "" && !required ? onChange(undefined, true) : onChange(event.target.value))}
        />
      )}
    </label>
  )
}

function useMCPInspectorPageModel({
  proxy,
  profiles,
  onSaveProfile,
}: {
  proxy: ProxySettings
  profiles: MCPServerProfile[]
  onSaveProfile: (profile: MCPServerProfile) => void
}) {
  const [selectedProfileID, setSelectedProfileID] = useDraftState("mcp-inspector", "selectedProfileID", profiles[0]?.id ?? "")
  const [transportType, setTransportType] = useDraftState<MCPTransportType>(
    "mcp-inspector",
    "transportType",
    profiles[0]?.transport ?? "streamable-http",
  )
  const [serverURL, setServerURL] = useDraftState("mcp-inspector", "serverURL", profiles[0]?.url ?? QUICK_APP_MCP_URL)
  const [headersText, setHeadersText] = useDraftState("mcp-inspector", "headersText", "")
  const [connectionMode, setConnectionMode] = useDraftState<MCPConnectionMode>("mcp-inspector", "connectionMode", "quick-proxy")
  const [command, setCommand] = useDraftState("mcp-inspector", "command", "")
  const [argsJSON, setArgsJSON] = useDraftState("mcp-inspector", "argsJSON", "[]")
  const [envText, setEnvText] = useDraftState("mcp-inspector", "envText", "")
  const [cwd, setCwd] = useDraftState("mcp-inspector", "cwd", "")
  const [connecting, setConnecting] = useDraftState("mcp-inspector", "connecting", false)
  const [connected, setConnected] = useDraftState("mcp-inspector", "connected", false)
  const [server, setServer] = useDraftState<ServerSummary | null>("mcp-inspector", "server", null)
  const [tools, setTools] = useDraftState<Tool[]>("mcp-inspector", "tools", [])
  const [toolSearch, setToolSearch] = useDraftState("mcp-inspector", "toolSearch", "")
  const [selectedName, setSelectedName] = useDraftState("mcp-inspector", "selectedName", "")
  const [argumentsValue, setArgumentsValue] = useDraftState<JSONArguments>("mcp-inspector", "argumentsValue", {})
  const [rawArguments, setRawArguments] = useDraftState("mcp-inspector", "rawArguments", "{}")
  const [rawMode, setRawMode] = useDraftState("mcp-inspector", "rawMode", false)
  const [calling, setCalling] = useDraftState("mcp-inspector", "calling", false)
  const [result, setResult] = useDraftState<CallToolResult | null>("mcp-inspector", "result", null)
  const [history, setHistory] = useDraftState<HistoryEntry[]>("mcp-inspector", "history", [])
  const [showHistory, setShowHistory] = useDraftState("mcp-inspector", "showHistory", true)
  const leaseRef = useRef<Awaited<ReturnType<typeof acquireMCPConnection>> | null>(null)

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

  const saveProfile = () => {
    const existing = profiles.find((profile) => profile.id === selectedProfileID)
    if (transportType === "stdio") {
      if (!command.trim()) {
        toast.error("请先填写 STDIO 启动命令")
        return
      }
      try {
        const parsed = JSON.parse(argsJSON || "[]")
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error("参数必须是字符串数组")
      } catch (error) {
        toast.error(`STDIO 参数无效：${errorMessage(error)}`)
        return
      }
    } else if (!/^https?:\/\//i.test(serverURL.trim())) {
      toast.error("Server URL 必须以 http:// 或 https:// 开头")
      return
    }
    const endpointName =
      transportType === "stdio"
        ? command.trim().split(/[\\/]/).pop() || "STDIO"
        : (() => {
            try {
              return new URL(serverURL.trim()).host
            } catch {
              return "MCP Server"
            }
          })()
    const profile = createMCPServerProfile({
      ...(existing ? { id: existing.id, name: existing.name } : { name: `MCP · ${endpointName}` }),
      enabled: existing?.enabled ?? true,
      transport: transportType,
      url: serverURL.trim(),
      headers: headersText.trim(),
      connectionMode,
      command: command.trim(),
      argsJSON: argsJSON.trim() || "[]",
      env: envText.trim(),
      cwd: cwd.trim(),
    })
    onSaveProfile(profile)
    setSelectedProfileID(profile.id)
    toast.success(existing ? `已更新设置中的“${profile.name}”` : `已保存到设置：${profile.name}`)
  }

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
          setSelectedProfileID(profile.id)
          applyProfile(profile)
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
          if (!Array.isArray(parsedArgs) || parsedArgs.some((item) => typeof item !== "string"))
            throw new Error("argsJSON 必须是字符串数组")
          setSelectedProfileID("")
          setTransportType(transport)
          setHeadersText("")
          setEnvText("")
          setCommand(nextCommand)
          setArgsJSON(JSON.stringify(parsedArgs, null, 2))
          setCwd(String(values.cwd ?? ""))
        } else {
          const nextURL = String(values.url ?? "").trim()
          if (!/^https?:\/\//i.test(nextURL)) throw new Error("远程 MCP URL 必须以 http:// 或 https:// 开头")
          setSelectedProfileID("")
          setTransportType(transport)
          setHeadersText("")
          setEnvText("")
          setServerURL(nextURL)
          setConnectionMode("quick-proxy")
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
    setHistory((entries) =>
      [
        { id: ++historyID.current, method, at: new Date(), duration: Math.round(performance.now() - startedAt), success, detail, payload },
        ...entries,
      ].slice(0, 40),
    )
  }, [])

  const closeConnection = useCallback(async (updateState = true) => {
    leaseRef.current?.release(true)
    leaseRef.current = null
    if (updateState) {
      setConnected(false)
      setServer(null)
      setTools([])
      setSelectedName("")
      setResult(null)
    }
  }, [])

  useEffect(
    () => () => {
      void closeConnection(false)
    },
    [closeConnection],
  )

  const loadTools = useCallback(async () => {
    if (!leaseRef.current) return
    try {
      const details = await leaseRef.current.connection.details()
      setTools(details.tools)
      setServer(details)
      setSelectedName((current) => (details.tools.some((tool) => tool.name === current) ? current : (details.tools[0]?.name ?? "")))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])

  const connect = async () => {
    setConnecting(true)
    await closeConnection()
    const startedAt = performance.now()
    try {
      const profile = createMCPServerProfile({
        id: selectedProfileID || "inspector",
        name: "MCP Inspector",
        transport: transportType,
        url: serverURL,
        headers: headersText,
        connectionMode,
        command,
        argsJSON,
        env: envText,
        cwd,
      })
      const lease = await acquireMCPConnection(profile, proxy)
      leaseRef.current = lease
      const details = await lease.connection.details()
      setServer(details)
      setTools(details.tools)
      setSelectedName(details.tools[0]?.name ?? "")
      setConnected(true)
      addHistory("initialize", startedAt, true, details.name)
      toast.success("MCP 已连接")
    } catch (error) {
      await closeConnection()
      toast.error(errorMessage(error))
      addHistory("initialize", startedAt, false, errorMessage(error))
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
    if (!leaseRef.current || !selectedTool) return
    const startedAt = performance.now()
    setCalling(true)
    try {
      const args = rawMode ? JSON.parse(rawArguments) : argumentsValue
      if (!args || Array.isArray(args) || typeof args !== "object") throw new Error("工具参数必须是 JSON 对象")
      const response = await leaseRef.current.connection.call(selectedTool.name, args)
      setResult(response)
      addHistory("tools/call", startedAt, !response.isError, selectedTool.name, { arguments: args, result: response })
    } catch (error) {
      toast.error(errorMessage(error))
      addHistory("tools/call", startedAt, false, errorMessage(error))
    } finally {
      setCalling(false)
    }
  }

  const inputSchema = (selectedTool?.inputSchema ?? {}) as JSONSchema
  const requiredNames = new Set(inputSchema.required ?? [])

  return {
    profiles,
    proxy,
    selectedProfileID,
    setSelectedProfileID,
    transportType,
    setTransportType,
    serverURL,
    setServerURL,
    headersText,
    setHeadersText,
    connectionMode,
    setConnectionMode,
    command,
    setCommand,
    argsJSON,
    setArgsJSON,
    envText,
    setEnvText,
    cwd,
    setCwd,
    connecting,
    connected,
    server,
    tools,
    toolSearch,
    setToolSearch,
    selectedName,
    setSelectedName,
    argumentsValue,
    rawArguments,
    setRawArguments,
    rawMode,
    setRawMode,
    calling,
    result,
    history,
    setHistory,
    showHistory,
    setShowHistory,
    applyProfile,
    saveProfile,
    selectedTool,
    filteredTools,
    closeConnection,
    loadTools,
    connect,
    updateArgument,
    callTool,
    inputSchema,
    requiredNames,
  }
}

const ModelContext = createContext<ReturnType<typeof useMCPInspectorPageModel> | null>(null)
export function MCPInspectorPageModelProvider(props: Parameters<typeof useMCPInspectorPageModel>[0] & { children: ReactNode }) {
  const model = useMCPInspectorPageModel(props)
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useMCPInspectorPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("MCPInspectorPageModelProvider missing")
  return value
}

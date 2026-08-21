import { Client, SSEClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import type { CallToolResult, Tool, Transport } from "@modelcontextprotocol/client"

import { MCPProxyService, MCPStdioService } from "../../bindings/changeme/services"
import type { ProxySettings } from "@/lib/proxy"
import type { MCPServerProfile } from "@/lib/saved-connections"

type MCPServerDetails = {
  name: string
  version: string
  instructions: string
  tools: Tool[]
}

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

async function withRemoteClient<T>(profile: MCPServerProfile, proxy: ProxySettings, action: (client: Client) => Promise<T>) {
  if (!profile.url.trim()) throw new Error(`${profile.name} 没有配置 Server URL`)
  if (profile.connectionMode === "quick-proxy" && !hasWailsBridge()) throw new Error("Quick 本地代理只能在桌面应用中使用")
  let proxySession = ""
  let transport: Transport | null = null
  let client: Client | null = null
  try {
    let endpoint = profile.url.trim()
    let requestHeaders: Headers
    if (profile.connectionMode === "quick-proxy") {
      const session = await MCPProxyService.CreateSession(endpoint, profile.headers, proxy.mode, proxy.url)
      if (!session.success) throw new Error(session.error || "无法创建 Quick MCP 代理会话")
      endpoint = session.endpoint
      proxySession = session.id
      requestHeaders = new Headers({ "X-Quick-MCP-Token": session.token })
    } else requestHeaders = parseHeaderLines(profile.headers)

    client = new Client({ name: "quick-page-assistant", version: "0.1.0" })
    transport = profile.transport === "sse"
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
    await client.connect(transport)
    return await action(client)
  } finally {
    if (client) try { await client.close() } catch { /* Best-effort cleanup. */ }
    else if (transport) try { await transport.close() } catch { /* Best-effort cleanup. */ }
    if (proxySession && hasWailsBridge()) try { await MCPProxyService.CloseSession(proxySession) } catch { /* Quick may be shutting down. */ }
  }
}

async function withStdioSession<T>(profile: MCPServerProfile, action: (sessionID: string, details: Omit<MCPServerDetails, "tools">) => Promise<T>) {
  if (!hasWailsBridge()) throw new Error("STDIO MCP 只能在 Quick 桌面应用中使用")
  if (!profile.command.trim()) throw new Error(`${profile.name} 没有配置 STDIO 命令`)
  const connection = await MCPStdioService.Connect(profile.command, profile.argsJSON, profile.env, profile.cwd)
  if (!connection.success) throw new Error(connection.error || `无法启动 ${profile.name}`)
  try {
    return await action(connection.sessionId, {
      name: connection.name || profile.name,
      version: connection.version || "未知版本",
      instructions: connection.instructions || "",
    })
  } finally {
    try { await MCPStdioService.Close(connection.sessionId) } catch { /* Process cleanup is best-effort. */ }
  }
}

export async function listSavedMCPTools(profile: MCPServerProfile, proxy: ProxySettings): Promise<MCPServerDetails> {
  if (profile.transport === "stdio") {
    return withStdioSession(profile, async (sessionID, details) => {
      const result = await MCPStdioService.ListTools(sessionID)
      if (!result.success) throw new Error(result.error || "无法读取 MCP Tools")
      return { ...details, tools: JSON.parse(result.toolsJson) as Tool[] }
    })
  }
  return withRemoteClient(profile, proxy, async (client) => {
    const result = await client.listTools()
    const version = client.getServerVersion()
    return {
      name: version?.name || profile.name,
      version: version?.version || "未知版本",
      instructions: client.getInstructions() || "",
      tools: result.tools,
    }
  })
}

export async function callSavedMCPTool(profile: MCPServerProfile, proxy: ProxySettings, toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (profile.transport === "stdio") {
    return withStdioSession(profile, async (sessionID) => {
      const result = await MCPStdioService.CallTool(sessionID, toolName, JSON.stringify(args))
      if (!result.success) throw new Error(result.error || "MCP Tool 调用失败")
      return JSON.parse(result.resultJson) as CallToolResult
    })
  }
  return withRemoteClient(profile, proxy, (client) => client.callTool({ name: toolName, arguments: args }))
}

export function summarizeMCPResult(result: CallToolResult) {
  let remaining = 24000
  const content = (Array.isArray(result.content) ? result.content : []).map((block) => {
    if (block.type === "text") {
      const text = block.text.slice(0, Math.max(0, remaining))
      remaining -= text.length
      return { type: "text", text, truncated: text.length < block.text.length }
    }
    if (block.type === "image") return { type: "image", mimeType: block.mimeType, omitted: true }
    if (block.type === "audio") return { type: "audio", mimeType: block.mimeType, omitted: true }
    if (block.type === "resource") return { type: "resource", uri: block.resource.uri, mimeType: block.resource.mimeType, contentOmitted: true }
    return { type: block.type, omitted: true }
  })
  let structuredContent: unknown = result.structuredContent
  if (structuredContent !== undefined) {
    const serialized = JSON.stringify(structuredContent)
    structuredContent = serialized.length <= 12000 ? structuredContent : { truncated: true, preview: serialized.slice(0, 12000) }
  }
  return { isError: Boolean(result.isError), content, structuredContent }
}

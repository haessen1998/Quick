import { MCPProxyService, MCPStdioService } from "@/../bindings/github.com/haessen1998/Quick/internal/mcp"
import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type Tool,
  type Transport,
} from "@modelcontextprotocol/client"
import { hasNativeBridge } from "./native-runtime"
import type { ProxySettings } from "./proxy"
import type { MCPServerProfile } from "./saved-connections"

export type MCPDetails = { name: string; version: string; instructions: string; capabilities: string[]; tools: Tool[] }
export type MCPConnection = {
  details: () => Promise<MCPDetails>
  call: (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<CallToolResult>
  close: () => Promise<void>
}
type Entry = { promise: Promise<MCPConnection>; leases: number; idle?: ReturnType<typeof setTimeout> }
const pool = new Map<string, Entry>()

async function connect(profile: MCPServerProfile, proxy: ProxySettings): Promise<MCPConnection> {
  if (profile.transport === "stdio") {
    if (!hasNativeBridge()) throw new Error("STDIO MCP 只能在桌面应用中使用")
    const result = await MCPStdioService.Connect(profile.command, profile.argsJSON, profile.env, profile.cwd)
    if (!result.success) throw new Error(result.error || "MCP 连接失败")
    const close = async () => {
      await MCPStdioService.Close(result.sessionId)
    }
    return {
      close,
      details: async () => {
        const tools = await MCPStdioService.ListTools(result.sessionId)
        if (!tools.success) throw new Error(tools.error)
        return {
          name: result.name,
          version: result.version,
          instructions: result.instructions,
          capabilities: result.capabilities ?? [],
          tools: JSON.parse(tools.toolsJson),
        }
      },
      call: async (name, args, signal) => {
        if (signal?.aborted) throw new DOMException("已取消", "AbortError")
        const cancel = () => {
          void close()
        }
        signal?.addEventListener("abort", cancel, { once: true })
        try {
          const response = await MCPStdioService.CallTool(result.sessionId, name, JSON.stringify(args))
          if (!response.success) throw new Error(response.error)
          return JSON.parse(response.resultJson)
        } finally {
          signal?.removeEventListener("abort", cancel)
        }
      },
    }
  }
  let endpoint = profile.url.trim()
  const headers = new Headers()
  let proxyId = ""
  let transport: Transport | null = null
  const client = new Client({ name: "quick", version: "0.3.3" })
  const close = async () => {
    try {
      await client.close()
    } finally {
      if (proxyId) await MCPProxyService.CloseSession(proxyId)
    }
  }
  try {
    if (profile.connectionMode === "quick-proxy") {
      if (!hasNativeBridge()) throw new Error("Quick MCP 代理只能在桌面应用中使用")
      const session = await MCPProxyService.CreateSession(endpoint, profile.headers, proxy.mode, proxy.url)
      if (!session.success) throw new Error(session.error)
      proxyId = session.id
      endpoint = session.endpoint
      headers.set("X-Quick-MCP-Token", session.token)
    } else
      for (const raw of profile.headers.split(/\r?\n/).filter((line) => line.trim())) {
        const separator = raw.indexOf(":")
        if (separator < 1) throw new Error("MCP 请求头格式无效")
        headers.append(raw.slice(0, separator).trim(), raw.slice(separator + 1).trim())
      }
    transport =
      profile.transport === "sse"
        ? new SSEClientTransport(new URL(endpoint), {
            requestInit: { headers },
            eventSourceInit: { fetch: (url, init) => fetch(url, { ...init, headers }) },
          })
        : new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers } })
    await client.connect(transport)
    return {
      close,
      details: async () => {
        const tools: Tool[] = []
        let cursor: string | undefined
        const cursors = new Set<string>()
        do {
          const page = await client.listTools(cursor ? { cursor } : undefined)
          tools.push(...page.tools)
          cursor = page.nextCursor
          if (tools.length > 2000 || cursors.size >= 100 || (cursor && cursors.has(cursor))) throw new Error("MCP 工具分页超过限制或重复")
          if (cursor) cursors.add(cursor)
        } while (cursor)
        const version = client.getServerVersion()
        return {
          name: version?.name ?? profile.name,
          version: version?.version ?? "",
          instructions: client.getInstructions() ?? "",
          capabilities: Object.keys(client.getServerCapabilities() ?? {}),
          tools,
        }
      },
      call: (name, args, signal) => client.callTool({ name, arguments: args }, { signal }),
    }
  } catch (error) {
    try {
      await transport?.close()
      await close()
    } catch {
      /* Preserve connection error. */
    }
    throw error
  }
}

/** Inspector and assistant lease the same connection for identical configuration. */
export async function acquireMCPConnection(profile: MCPServerProfile, proxy: ProxySettings) {
  const key = JSON.stringify([
    profile.transport,
    profile.url,
    profile.headers,
    profile.connectionMode,
    profile.command,
    profile.argsJSON,
    profile.env,
    profile.cwd,
    proxy,
  ])
  let entry = pool.get(key)
  if (!entry) {
    if (pool.size >= 8) throw new Error("MCP 连接已达 8 个，请断开不需要的连接后重试")
    entry = { promise: connect(profile, proxy), leases: 0 }
    pool.set(key, entry)
    entry.promise.catch(() => {
      if (pool.get(key) === entry) pool.delete(key)
    })
  }
  clearTimeout(entry.idle)
  entry.leases++
  let connection: MCPConnection
  try {
    connection = await entry.promise
  } catch (error) {
    entry.leases--
    throw error
  }
  let released = false
  const release = (immediate = false) => {
    if (released) return
    released = true
    entry!.leases--
    if (entry!.leases > 0) return
    const remove = () => {
      if (pool.get(key) === entry) pool.delete(key)
      void connection.close().catch(() => undefined)
    }
    if (immediate) remove()
    else entry!.idle = setTimeout(remove, 120_000)
  }
  const leasedConnection: MCPConnection = {
    ...connection,
    call: async (name, args, signal) => {
      try {
        return await connection.call(name, args, signal)
      } catch (error) {
        // Never retry an uncertain side effect or reuse a cancelled STDIO process.
        if (pool.get(key) === entry) pool.delete(key)
        clearTimeout(entry!.idle)
        throw error
      }
    },
  }
  return { connection: leasedConnection, release }
}
export async function closeAllMCPConnections() {
  const entries = [...pool.values()]
  pool.clear()
  await Promise.allSettled(
    entries.map(async (entry) => {
      clearTimeout(entry.idle)
      await (await entry.promise).close()
    }),
  )
}

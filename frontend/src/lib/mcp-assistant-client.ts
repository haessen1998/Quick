import type { CallToolResult } from "@modelcontextprotocol/client"
import { acquireMCPConnection } from "./mcp-connections"
import type { ProxySettings } from "./proxy"
import type { MCPServerProfile } from "./saved-connections"
import { redactToolData } from "./tool-policy"
export async function listSavedMCPTools(profile: MCPServerProfile, proxy: ProxySettings) {
 const lease = await acquireMCPConnection(profile, proxy)
 try { return await lease.connection.details() } finally { lease.release() }
}
export async function callSavedMCPTool(profile: MCPServerProfile, proxy: ProxySettings, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult> {
 if (signal?.aborted) throw new DOMException("已取消", "AbortError")
 const lease = await acquireMCPConnection(profile, proxy)
 try { return await lease.connection.call(name, args, signal) } finally { lease.release(Boolean(signal?.aborted)) }
}
export function summarizeMCPResult(result: CallToolResult) {
  result = redactToolData(result) as CallToolResult
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
  return redactToolData({ isError: Boolean(result.isError), content, structuredContent })
}

export type ToolEffect = "local" | "network" | "files" | "process" | "navigation" | "mcp"
export type ToolPermissions = Record<Exclude<ToolEffect, "local">, boolean>
export const DEFAULT_TOOL_PERMISSIONS: ToolPermissions = { network: false, files: false, process: false, navigation: false, mcp: false }
export const PERMISSION_LABELS: Record<keyof ToolPermissions, string> = {
  network: "发送 HTTP 请求",
  files: "修改文件",
  process: "关闭进程",
  navigation: "修改站点导航",
  mcp: "调用第三方 MCP",
}
export function toolEffect(page: string, action: string, input: Record<string, unknown>): ToolEffect {
  if (page === "network" && input.operation === "http-execute") return "network"
  if (page === "network" && input.operation === "process-terminate") return "process"
  if (page === "file-tools" && ["execute", "undo"].includes(action)) return "files"
  if (page === "navigation" && ["add", "update", "move", "batch-update", "delete"].includes(action)) return "navigation"
  return "local"
}
export function redactToolData(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[深层数据省略]"
  if (typeof value === "string")
    return value
      .replace(/("(?:authorization|cookie|api[-_]?key|password|private[-_]?key|secret|token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[已隐藏]"')
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[私钥已隐藏]")
      .replace(/\b(Bearer\s+)[^\s"',]+/gi, "$1[已隐藏]")
      .replace(/((?:authorization|cookie|set-cookie|api[-_]?key|password|secret|token)\s*[=:]\s*)([^\r\n&]+)/gi, "$1[已隐藏]")
      .replace(/([?&](?:token|key|api_key|password|secret)=)[^&#\s]+/gi, "$1[已隐藏]")
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactToolData(item, depth + 1))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|cookie|api.?key|password|private.?key|secret|^env$|token/i.test(key) ? "[已隐藏]" : redactToolData(item, depth + 1),
      ]),
    )
  return value
}

import { XMLValidator } from "fast-xml-parser"
import type { PageId } from "./pages"

export type SmartInputAction = { label: string; description: string; page: PageId; payload: Record<string, unknown> }
export function detectSmartInput(input: string): SmartInputAction[] {
  const value = input.trim()
  if (!value || value.length > 200_000) return []
  // Prefer full-format parsing over overlapping heuristics (URLs used to match YAML).
  try {
    const url = new URL(value)
    if (/^https?:$/.test(url.protocol) && url.hostname && !/\s/.test(value))
      return [{ label: "解析 URL", description: "拆解路径与查询参数", page: "network", payload: { operation: "url-inspect", url: value } }]
  } catch {
    /* Not a complete URL. */
  }
  try {
    const parsed = JSON.parse(value)
    if (parsed !== null && typeof parsed === "object")
      return [
        { label: "格式化 JSON", description: "校验并整理缩进", page: "formatter", payload: { operation: "json-format", input: value } },
      ]
  } catch {
    /* Not JSON. */
  }
  if (value.startsWith("<") && XMLValidator.validate(value) === true)
    return [
      { label: "格式化 XML", description: "校验并整理节点缩进", page: "formatter", payload: { operation: "xml-format", input: value } },
    ]
  if (/^[\w-]+\.[\w-]+\.[\w-]*$/.test(value)) {
    try {
      const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
      const [header, payload] = value.split(".").slice(0, 2).map(decode)
      if (typeof header?.alg === "string" && payload && typeof payload === "object" && !Array.isArray(payload))
        return [
          {
            label: "解析 JWT",
            description: "查看 Header、Payload 与有效期",
            page: "crypto",
            payload: { operation: "jwt-parse", input: value },
          },
        ]
    } catch {
      /* Domain names and malformed tokens are not JWTs. */
    }
  }
  if (value.length >= 8 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && /[+/=]/.test(value)) {
    try {
      const binary = atob(value)
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
      if (decoded.trim() && !/[\u0000-\u0008\u000e-\u001f\u007f]/.test(decoded))
        return [
          {
            label: "解码 Base64",
            description: "转换为 UTF-8 文本",
            page: "converter",
            payload: { module: "encoding", source: "base64", target: "text", input: value },
          },
        ]
    } catch {
      /* Not UTF-8 Base64. */
    }
  }
  // Plain text, numeric IDs/timestamps, YAML and cron are too ambiguous for automatic prompts.
  return []
}

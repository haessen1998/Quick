import { XMLValidator } from "fast-xml-parser"
import { parse as parseYaml } from "yaml"
import { parse as parseToml } from "smol-toml"

export type PreflightInput = { format: string; input: string; expression?: string; flags?: string }
/** Syntax only: never run a regex, query, transformation, network request or user code. */
export function checkInput({ format, input, expression, flags = "" }: PreflightInput): string | null {
  if (input.length + (expression?.length ?? 0) > 200_000) return "内容较大，已跳过自动检查；执行时仍会校验。"
  try {
    if (format === "json" || format === "jsonpath" || format === "json-schema") JSON.parse(input)
    if (format === "yaml") parseYaml(input)
    if (format === "toml") parseToml(input)
    if (format === "xml" || format === "xpath") {
      const valid = XMLValidator.validate(input)
      if (valid !== true) return `XML: ${valid.err.msg} (line ${valid.err.line})`
    }
    if (format === "json-schema" && expression !== undefined) {
      const schema = JSON.parse(expression)
      if (typeof schema !== "boolean" && (!schema || typeof schema !== "object" || Array.isArray(schema)))
        return "JSON Schema 应为对象或布尔值。"
    }
    if (format === "jsonpath" && expression !== undefined && !expression.trim()) return "请输入 JSONPath 表达式。"
    if (format === "regex" && expression !== undefined) new RegExp(expression, flags)
    if (format === "selector" && expression !== undefined && typeof document !== "undefined")
      document.createDocumentFragment().querySelector(expression)
    if (format === "xpath" && expression !== undefined && typeof document !== "undefined") document.createExpression(expression, null)
    if (format === "base64") {
      const binary = atob(input.replace(/\s/g, ""))
      new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
    }
    if (format === "url") decodeURIComponent(input)
    if (format === "hex" && !/^(?:[\s,;]*(?:0x)?[\da-f]{1,2})+[\s,;]*$/i.test(input)) return "请输入有效的 Hex 字节列表。"
    if (format === "ascii" || format === "utf8") {
      if (
        !input
          .trim()
          .split(/[\s,;]+/)
          .every((token) => /^\d{1,3}$/.test(token) && Number(token) <= 255)
      )
        return "字节列表应由 0–255 的整数构成。"
    }
    const radix: Record<string, RegExp> = { "2": /^[+-]?[01]+$/, "8": /^[+-]?[0-7]+$/, "10": /^[+-]?\d+$/, "16": /^[+-]?[\da-f]+$/i }
    if (
      radix[format] &&
      !radix[format].test(
        input
          .trim()
          .replace(/_/g, "")
          .replace(/^([-+])?0[bBoOxX]/, "$1"),
      )
    )
      return `输入不符合 ${format} 进制整数格式。`
  } catch (error) {
    return `${format}: ${error instanceof Error ? error.message : String(error)}`
  }
  return null
}

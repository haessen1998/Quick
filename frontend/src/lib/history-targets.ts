import { isMap, isSeq, parseDocument } from "yaml"
import { XMLValidator } from "fast-xml-parser"
import type { ToolRun } from "./tool-results"
export type HistoryTarget = { label: string; page: "formatter" | "converter"; payload: Record<string, unknown> }
/** Suggest only formats validated locally; pass the original text without reserializing it. */
export function historyTargets(run: Pick<ToolRun, "text" | "success" | "transferable">): HistoryTarget[] {
  if (!run.success || run.transferable === false || !run.text.trim() || run.text.length > 200_000) return []
  const text = run.text
  let format = ""
  try {
    JSON.parse(text)
    format = "json"
  } catch {
    /* Other structured formats may apply. */
  }
  if (!format && text.trimStart().startsWith("<") && XMLValidator.validate(text) === true) format = "xml"
  if (!format) {
    try {
      const document = parseDocument(text)
      if (!document.errors.length && !document.warnings.length && (isMap(document.contents) || isSeq(document.contents))) format = "yaml"
    } catch {
      /* Plain text has no format-specific actions. */
    }
  }
  if (!format) return []
  const targets: HistoryTarget[] = [
    { label: `发送到 ${format.toUpperCase()} 格式化`, page: "formatter", payload: { operation: `${format}-format`, input: text } },
  ]
  if (format === "json" || format === "yaml") {
    const target = format === "json" ? "yaml" : "json"
    targets.push({
      label: `${format.toUpperCase()} → ${target.toUpperCase()}`,
      page: "converter",
      payload: { module: "standard", source: format, target, input: text },
    })
  }
  return targets
}

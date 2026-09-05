import { useSyncExternalStore } from "react"
import type { PageId } from "./pages"
import { redactToolData } from "./tool-policy"
export type ToolRun = {
  id: string
  page: PageId
  action: string
  startedAt: number
  durationMs: number
  success: boolean
  text: string
  result: unknown
  transferable?: boolean
}
export type RunDetails = {
  input: Record<string, unknown>
  result: unknown
  replay?: { action: string; input: Record<string, unknown> }
  replayUnavailable?: string
}
// Local history details are deliberately separate from workflow/AI artifacts.
const details = new Map<string, RunDetails>()
export function toolRunDetails(id: string) {
  return details.get(id)
}
export function replayDetails(action: string, input: Record<string, unknown>): RunDetails["replay"] {
  const { operationAutoApproved: _approval, sourceResultId: _source, ...snapshot } = structuredClone(input)
  return { action, input: snapshot }
}
/** Native output is inspectable locally, but never becomes an AI/workflow artifact. */
export async function recordManualOperation<T>(
  page: PageId,
  action: string,
  operation: () => T | Promise<T>,
  options: { input: Record<string, unknown>; replayAction?: string; replayInput?: Record<string, unknown>; replayUnavailable?: string } = {
    input: {},
  },
): Promise<T> {
  const startedAt = Date.now()
  const input = structuredClone(options.input)
  const replayInput = structuredClone(options.replayInput ?? input)
  const record = (success: boolean, result: unknown) =>
    recordToolRun(
      {
        page,
        action,
        startedAt,
        durationMs: Date.now() - startedAt,
        success,
        transferable: false,
        text: success ? "操作已完成，结果保留在工具页面。" : "操作失败，请在工具页面查看错误。",
        result: { success },
      },
      {
        input: redactToolData(input, 0, Infinity) as Record<string, unknown>,
        result: redactToolData(result, 0, Infinity),
        replay:
          options.replayAction && JSON.stringify(redactToolData(replayInput, 0, Infinity)) === JSON.stringify(replayInput)
            ? replayDetails(options.replayAction, replayInput)
            : undefined,
        replayUnavailable: options.replayUnavailable ?? "此操作需要回到工具页面重新确认输入或敏感信息。",
      },
    )
  try {
    const result = await operation()
    const status = result as { success?: boolean; isError?: boolean } | null
    record(status?.success !== false && status?.isError !== true, result)
    return result
  } catch (error) {
    record(false, { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
let runs: ToolRun[] = []
const subscribers = new Set<() => void>()
export function recordToolRun(run: Omit<ToolRun, "id">, detail?: RunDetails): ToolRun {
  const entry = { ...run, id: crypto.randomUUID() }
  if (detail) details.set(entry.id, structuredClone(detail))
  runs = [entry, ...runs].slice(0, 40)
  let bytes = 0
  runs = runs.filter((item) => {
    bytes += item.text.length * 2 + JSON.stringify(item.result ?? null).length * 2 + JSON.stringify(details.get(item.id) ?? null).length * 2
    return item.id === entry.id || bytes <= 8 * 1024 * 1024
  })
  const retained = new Set(runs.map((item) => item.id))
  for (const id of details.keys()) if (!retained.has(id)) details.delete(id)
  subscribers.forEach((listener) => listener())
  return entry
}
export function findToolRun(id: string) {
  return runs.find((run) => run.id === id)
}
export function getToolRuns(): readonly ToolRun[] {
  return runs
}
export function clearToolRuns() {
  runs = []
  details.clear()
  subscribers.forEach((listener) => listener())
}
export function useToolRuns() {
  return useSyncExternalStore(
    (listener) => {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    () => runs,
  )
}
export function modelResult(result: unknown) {
  const redacted = redactToolData(result)
  const text = JSON.stringify(redacted ?? null)
  return text.length <= 16000 ? redacted : { preview: text.slice(0, 16000), truncated: true, totalCharacters: text.length }
}

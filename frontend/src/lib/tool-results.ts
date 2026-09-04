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
}
let runs: ToolRun[] = []
const subscribers = new Set<() => void>()
export function recordToolRun(run: Omit<ToolRun, "id">): ToolRun {
  const entry = { ...run, id: crypto.randomUUID() }
  runs = [entry, ...runs].slice(0, 40)
  let bytes = 0
  runs = runs.filter((item) => {
    bytes += item.text.length * 2 + JSON.stringify(item.result ?? null).length * 2
    return item.id === entry.id || bytes <= 8 * 1024 * 1024
  })
  subscribers.forEach((listener) => listener())
  return entry
}
export function findToolRun(id: string) {
  return runs.find((run) => run.id === id)
}
export function clearToolRuns() {
  runs = []
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

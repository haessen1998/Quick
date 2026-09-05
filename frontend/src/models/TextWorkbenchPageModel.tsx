import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { useDraftState } from "@/lib/workspace-store"
import { diffChars, diffLines, diffWordsWithSpace } from "diff"
import { createContext, useContext, useMemo, type ReactNode } from "react"

export type Granularity = "line" | "word" | "char"

export type InlinePart = { value: string; changed: boolean }

export type DiffRow = {
  left: string
  right: string
  kind: "same" | "changed" | "added" | "removed"
  leftParts?: InlinePart[]
  rightParts?: InlinePart[]
}

export function inlineDiff(left: string, right: string, granularity: Granularity) {
  if (granularity === "line") return undefined
  const changes = granularity === "char" ? diffChars(left, right) : diffWordsWithSpace(left, right)
  return {
    left: changes.filter((change) => !change.added).map((change) => ({ value: change.value, changed: Boolean(change.removed) })),
    right: changes.filter((change) => !change.removed).map((change) => ({ value: change.value, changed: Boolean(change.added) })),
  }
}

export function buildDiffRows(left: string, right: string, granularity: Granularity, ignoreWhitespace: boolean): DiffRow[] {
  const changes = diffLines(left, right, { ignoreWhitespace })
  const rows: DiffRow[] = []
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    const lines = change.value.replace(/\n$/, "").split("\n")
    if (!change.added && !change.removed) {
      rows.push(...lines.map((line) => ({ left: line, right: line, kind: "same" as const })))
      continue
    }
    if (change.removed && changes[index + 1]?.added) {
      const added = changes[index + 1].value.replace(/\n$/, "").split("\n")
      const count = Math.max(lines.length, added.length)
      for (let row = 0; row < count; row += 1) {
        const leftLine = lines[row] ?? ""
        const rightLine = added[row] ?? ""
        const inline = inlineDiff(leftLine, rightLine, granularity)
        rows.push({ left: leftLine, right: rightLine, kind: "changed", leftParts: inline?.left, rightParts: inline?.right })
      }
      index += 1
      continue
    }
    rows.push(
      ...lines.map((line) => ({
        left: change.removed ? line : "",
        right: change.added ? line : "",
        kind: change.removed ? ("removed" as const) : ("added" as const),
      })),
    )
  }
  return rows
}

function useTextWorkbenchPageModel() {
  const [mode, setMode] = useDraftState<"markdown" | "diff">("text-workbench", "mode", "markdown")
  const [markdown, setMarkdown] = useDraftState(
    "text-workbench",
    "markdown",
    '# Quick\n\n一个本地优先的跨平台开发者工具箱。\n\n```mermaid\nflowchart LR\n  A[输入] --> B[Quick]\n  B --> C[格式化与转换]\n  B --> D[网络与文件工具]\n```\n\n```go\nfmt.Println("Quick")\n```',
  )
  const [left, setLeft] = useDraftState("text-workbench", "left", "Quick\nGo\nReact\n旧内容\n")
  const [right, setRight] = useDraftState("text-workbench", "right", "Quick\nGo\nReact + shadcn/ui\n新内容\n")
  const [granularity, setGranularity] = useDraftState<Granularity>("text-workbench", "granularity", "word")
  const [ignoreWhitespace, setIgnoreWhitespace] = useDraftState("text-workbench", "ignoreWhitespace", false)
  const rows = useMemo(() => buildDiffRows(left, right, granularity, ignoreWhitespace), [left, right, granularity, ignoreWhitespace])

  useAssistantCapability({
    page: "text-workbench",
    getContext: () =>
      mode === "markdown"
        ? { mode, markdown: markdown.slice(0, 8000) }
        : {
            mode,
            left: left.slice(0, 6000),
            right: right.slice(0, 6000),
            granularity,
            ignoreWhitespace,
            changedRows: rows.filter((row) => row.kind !== "same").length,
          },
    actions: {
      fill: (values) => {
        const nextMode = String(values.mode ?? "")
        if (nextMode === "markdown") {
          const value = String(values.markdown ?? "")
          setMode("markdown")
          setMarkdown(value)
          return { success: true, mode: nextMode, characters: value.length, previewReady: true, executed: true }
        }
        if (nextMode !== "diff") throw new Error(`不支持的文本工作台模式：${nextMode}`)
        const nextLeft = String(values.left ?? "")
        const nextRight = String(values.right ?? "")
        const nextGranularity = (
          ["line", "word", "char"].includes(String(values.granularity)) ? String(values.granularity) : "word"
        ) as Granularity
        const nextIgnoreWhitespace = Boolean(values.ignoreWhitespace)
        const nextRows = buildDiffRows(nextLeft, nextRight, nextGranularity, nextIgnoreWhitespace)
        setMode("diff")
        setLeft(nextLeft)
        setRight(nextRight)
        setGranularity(nextGranularity)
        setIgnoreWhitespace(nextIgnoreWhitespace)
        return {
          success: true,
          mode: nextMode,
          granularity: nextGranularity,
          changedRows: nextRows.filter((row) => row.kind !== "same").length,
          totalRows: nextRows.length,
          executed: true,
        }
      },
    },
  })

  return {
    mode,
    setMode,
    markdown,
    setMarkdown,
    left,
    setLeft,
    right,
    setRight,
    granularity,
    setGranularity,
    ignoreWhitespace,
    setIgnoreWhitespace,
    rows,
  }
}

const ModelContext = createContext<ReturnType<typeof useTextWorkbenchPageModel> | null>(null)
export function TextWorkbenchPageModelProvider(props: { children: ReactNode }) {
  const model = useTextWorkbenchPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useTextWorkbenchPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("TextWorkbenchPageModelProvider missing")
  return value
}

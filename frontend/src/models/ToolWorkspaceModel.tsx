import { useAssistantCapability, useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage } from "@/lib/i18n"
import type { PageId } from "@/lib/pages"
import { useSmartInput } from "@/lib/smart-input"
import { useDraftState } from "@/lib/workspace-store"
import { type LucideIcon } from "lucide-react"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"

export type TextTool = {
  id: string
  label: string
  description: string
  group: string
  icon: LucideIcon
  sample: string
  run: (input: string) => string | Promise<string>
}

export type ToolWorkspaceProps = {
  title: string
  description: string
  tools: TextTool[]
  outputPlaceholder?: string
  assistantPage: PageId
  activeToolOptions?: Partial<Record<string, ReactNode>>
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function useToolWorkspaceModel({
  title,
  description,
  tools,
  assistantPage,
  activeToolOptions,
  outputPlaceholder = "处理结果会显示在这里…",
}: ToolWorkspaceProps) {
  const registry = useAssistantCapabilityRegistry()
  const { language, t } = useLanguage()
  const [activeToolId, setActiveToolId] = useDraftState("formatter", "activeToolId", tools[0]?.id ?? "")
  const activeTool = useMemo(() => tools.find((tool) => tool.id === activeToolId) ?? tools[0], [activeToolId, tools])
  const [input, setInput] = useDraftState("formatter", "input", tools[0]?.sample ?? "")
  const [output, setOutput] = useDraftState("formatter", "output", "")
  const [error, setError] = useDraftState("formatter", "error", "")
  const [processing, setProcessing] = useDraftState("formatter", "processing", false)
  const [copied, setCopied] = useDraftState("formatter", "copied", false)
  const groups = useMemo(() => Array.from(new Set(tools.map((tool) => tool.group))), [tools])

  useSmartInput(assistantPage, (values) => {
    const operation = String(values.operation ?? "")
    const nextTool = tools.find((tool) => tool.id === operation) ?? tools[0]
    if (!nextTool) return
    setActiveToolId(nextTool.id)
    setInput(String(values.input ?? ""))
    setOutput("")
    setError("")
  })

  const executeTool = async (tool: TextTool, value: string, fromAssistant = false) => {
    setActiveToolId(tool.id)
    setInput(value)
    setProcessing(true)
    setError("")
    try {
      const result = await tool.run(value)
      setOutput(result)
      toast.success(`${tool.label}完成`)
      return { success: true, operation: tool.id, label: tool.label, result, truncated: result.length > 16000, executed: true }
    } catch (caughtError) {
      const message = getErrorMessage(caughtError)
      setOutput("")
      setError(message)
      toast.error(`${tool.label}失败`, { description: message })
      if (fromAssistant) return { success: false, operation: tool.id, error: message, executed: true }
      throw caughtError
    } finally {
      setProcessing(false)
    }
  }

  useAssistantCapability({
    page: assistantPage,
    getContext: () => ({
      operation: activeTool?.id ?? "",
      operationLabel: activeTool?.label ?? "",
      input: input.slice(0, 8000),
      output: output.slice(0, 8000),
      error,
    }),
    actions: {
      fill: (values) => {
        const operation = String(values.operation ?? "")
        const nextTool = tools.find((tool) => tool.id === operation)
        if (!nextTool) throw new Error(`不支持的格式化操作：${operation}`)
        const nextInput = String(values.input ?? "")
        setActiveToolId(nextTool.id)
        setInput(nextInput)
        setOutput("")
        setError("")
        toast.success(`小Q已填写：${nextTool.label}`)
        return { success: true, operation: nextTool.id, label: nextTool.label, inputLength: nextInput.length, executed: false }
      },
      run: (values) => {
        const operation = String(values.operation ?? "")
        const nextTool = tools.find((tool) => tool.id === operation)
        if (!nextTool) throw new Error(`不支持的格式化操作：${operation}`)
        return executeTool(nextTool, String(values.input ?? ""), true)
      },
    },
  })

  const selectTool = (tool: TextTool) => {
    setActiveToolId(tool.id)
    // Changing an operation preserves the current document.
    setOutput("")
    setError("")
  }

  const processInput = async () => {
    try {
      await registry.execute("formatter", "run", { operation: activeTool.id, input })
    } catch {
      /* Error state and toast are handled by executeTool. */
    }
  }

  const copyOutput = async () => {
    try {
      await writeClipboard(output)
      setCopied(true)
      toast.success("结果已复制")
      window.setTimeout(() => setCopied(false), 1500)
    } catch (caughtError) {
      toast.error("复制失败", { description: getErrorMessage(caughtError) })
    }
  }

  return {
    title,
    description,
    tools,
    assistantPage,
    activeToolOptions,
    outputPlaceholder,
    language,
    t,
    activeTool,
    input,
    setInput,
    output,
    setOutput,
    error,
    setError,
    processing,
    copied,
    groups,
    selectTool,
    processInput,
    copyOutput,
  }
}

const ModelContext = createContext<ReturnType<typeof useToolWorkspaceModel> | null>(null)
export function ToolWorkspaceModelProvider(props: Parameters<typeof useToolWorkspaceModel>[0] & { children: ReactNode }) {
  const model = useToolWorkspaceModel(props)
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useToolWorkspaceViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("ToolWorkspaceModelProvider missing")
  return value
}

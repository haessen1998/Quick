import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { uiText } from "@/lib/i18n"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { type PageId } from "./pages"
import { toolDefinition, validateToolInput } from "./tool-definition"
import {
  DEFAULT_TOOL_PERMISSIONS,
  PERMISSION_LABELS,
  redactToolData,
  toolEffect,
  type ToolEffect,
  type ToolPermissions,
} from "./tool-policy"
import { findToolRun, modelResult, recordToolRun } from "./tool-results"
type CapabilityAction = (input: Record<string, unknown>, options?: ExecutionOptions) => unknown | Promise<unknown>
export type AssistantPageCapability = { page: PageId; getContext: () => Record<string, unknown>; actions: Record<string, CapabilityAction> }
type Approval = { effect: Exclude<ToolEffect, "local">; input: unknown; resolve: (approved: boolean) => void }
type ExecutionOptions = { signal?: AbortSignal }
type Registry = {
  execute: (page: PageId, action: string, input: Record<string, unknown>, options?: ExecutionOptions) => Promise<unknown>
  getPageContext: (page: PageId) => Record<string, unknown> | null
  register: (page: PageId, current: () => AssistantPageCapability) => () => void
  requestApproval: (effect: ToolEffect, input: unknown, signal?: AbortSignal) => Promise<boolean>
  catalog: () => ReturnType<typeof toolDefinition>[]
}
const Context = createContext<Registry | null>(null)
export function AssistantCapabilityProvider({
  children,
  permissions = DEFAULT_TOOL_PERMISSIONS,
}: {
  children: ReactNode
  permissions?: ToolPermissions
}) {
  const capabilities = useRef(new Map<PageId, () => AssistantPageCapability>())
  const permissionRef = useRef(permissions)
  permissionRef.current = permissions
  const [approval, setApproval] = useState<Approval | null>(null)
  const approvalRef = useRef<Approval | null>(null)
  const tail = useRef<Promise<unknown>>(Promise.resolve())
  const register = useCallback((page: PageId, current: () => AssistantPageCapability) => {
    capabilities.current.set(page, current)
    return () => {
      if (capabilities.current.get(page) === current) capabilities.current.delete(page)
    }
  }, [])
  const requestApproval = useCallback(async (effect: ToolEffect, input: unknown, signal?: AbortSignal) => {
    if (signal?.aborted) return false
    if (effect === "local" || permissionRef.current[effect]) return true
    if (approvalRef.current) return false
    return new Promise<boolean>((resolve) => {
      const finish = (accepted: boolean) => {
        signal?.removeEventListener("abort", cancel)
        approvalRef.current = null
        setApproval(null)
        resolve(accepted)
      }
      const cancel = () => finish(false)
      const next = { effect, input: redactToolData(input), resolve: finish }
      approvalRef.current = next
      setApproval(next)
      signal?.addEventListener("abort", cancel, { once: true })
    })
  }, [])
  useEffect(
    () => () => {
      approvalRef.current?.resolve(false)
    },
    [],
  )
  const execute = useCallback(
    (page: PageId, action: string, input: Record<string, unknown>, options: ExecutionOptions = {}) => {
      const run = async () => {
        if (options.signal?.aborted) return { success: false, cancelled: true, executed: false }
        const handler = capabilities.current.get(page)?.().actions[action]
        if (!handler) throw new Error(`未注册工具 ${page}.${action}`)
        const source = typeof input.sourceResultId === "string" ? findToolRun(input.sourceResultId) : undefined
        if (input.sourceResultId && !source) throw new Error("源结果已过期，请重新执行来源工具")
        if (source?.transferable === false) throw new Error("此记录仅包含执行状态，请从工具页面提供结果。")
        const validated = validateToolInput(page, action, { ...input, ...(source ? { input: source.text } : {}) })
        const effect = toolEffect(page, action, validated)
        if (!(await requestApproval(effect, { page, action, ...validated }, options.signal)))
          return { success: false, cancelled: true, executed: false }
        if (options.signal?.aborted) return { success: false, cancelled: true, executed: false }
        const args = { ...validated, operationAutoApproved: effect !== "local" }
        const startedAt = Date.now()
        let result: unknown
        try {
          result = await handler(args, options)
        } catch (error) {
          result = { success: false, executed: true, error: error instanceof Error ? error.message : String(error) }
        }
        const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {}
        // Only export the handler's explicit result. Reading arbitrary ViewModel output
        // would let a workflow recover secrets intentionally kept out of AI responses.
        const text =
          typeof record.body === "string" ? record.body : typeof record.result === "string" ? record.result : JSON.stringify(result ?? null)
        const entry = recordToolRun({
          page,
          action,
          startedAt,
          durationMs: Date.now() - startedAt,
          success: record.success !== false,
          text,
          result,
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
        return { ...(modelResult(result) as object), artifactId: entry.id, durationMs: entry.durationMs, success: entry.success }
      }
      const pending = tail.current.then(run, run)
      tail.current = pending.catch(() => undefined)
      return pending
    },
    [requestApproval],
  )
  const getPageContext = useCallback(
    (page: PageId) => redactToolData(capabilities.current.get(page)?.().getContext() ?? null) as Record<string, unknown> | null,
    [],
  )
  const catalog = useCallback(
    () =>
      [...capabilities.current].flatMap(([page, current]) => Object.keys(current().actions).map((action) => toolDefinition(page, action))),
    [],
  )
  const value = useMemo(
    () => ({ register, execute, getPageContext, requestApproval, catalog }),
    [register, execute, getPageContext, requestApproval, catalog],
  )
  return (
    <Context.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(approval)}
        onOpenChange={(open) => {
          if (!open) approvalRef.current?.resolve(false)
        }}
      >
        <DialogContent className="flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{uiText("允许此次操作？")}</DialogTitle>
            <DialogDescription>
              {approval && PERMISSION_LABELS[approval.effect]} {uiText("· 仅允许下面这一个操作。")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border p-3 text-xs">
            {JSON.stringify(approval?.input, null, 2)}
          </pre></DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => approvalRef.current?.resolve(false)}>
              {uiText("取消")}
            </Button>
            <Button onClick={() => approvalRef.current?.resolve(true)}>{uiText("允许本次")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  )
}
export function useAssistantCapability(capability: AssistantPageCapability) {
  const context = useContext(Context)
  const current = useRef(capability)
  current.current = capability
  useEffect(() => context?.register(capability.page, () => current.current), [capability.page, context])
}
export function useAssistantCapabilityRegistry() {
  const context = useContext(Context)
  if (!context) throw new Error("AssistantCapabilityProvider missing")
  return context
}

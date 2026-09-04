import type { PageId } from "./pages"
export type WorkflowStep = { page: PageId; action: string; input: Record<string, unknown>; fromPrevious?: boolean }
type Execute = (page: PageId, action: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>
/** Bounded sequential execution. Every step still passes the ordinary permission boundary. */
export async function runWorkflow(steps: WorkflowStep[], execute: Execute, signal?: AbortSignal) {
  if (!steps.length || steps.length > 12) throw new Error("工作流需要 1–12 个步骤")
  const completed: Record<string, unknown>[] = []
  let previousId: string | undefined
  for (let index = 0; index < steps.length; index++) {
    if (signal?.aborted) return { success: false, cancelled: true, completed }
    const step = steps[index]
    if (step.fromPrevious && !previousId) throw new Error("第一步不能引用上一步结果")
    let result: Record<string, unknown>
    try {
      result = (await execute(
        step.page,
        step.action,
        { ...step.input, ...(step.fromPrevious ? { sourceResultId: previousId } : {}) },
        { signal },
      )) as Record<string, unknown>
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : String(error) }
    }
    completed.push({ step: index + 1, page: step.page, action: step.action, ...result })
    if (result.success === false || result.cancelled || result.prepared || result.requiresConfirmation || result.executed === false)
      return { success: false, stoppedAt: index + 1, requiresAttention: Boolean(result.prepared || result.requiresConfirmation || result.executed === false), completed }
    previousId = typeof result.artifactId === "string" ? result.artifactId : undefined
  }
  return { success: true, completed, artifactId: previousId }
}

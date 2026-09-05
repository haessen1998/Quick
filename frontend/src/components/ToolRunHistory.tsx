import { useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { historyTargets } from "@/lib/history-targets"
import { writeClipboard } from "@/lib/clipboard"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Empty, EmptyMedia, EmptyDescription } from "@/components/ui/empty"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"
import { PAGE_LABELS, type PageId } from "@/lib/pages"
import { sendSmartInput } from "@/lib/smart-input"
import { clearToolRuns, useToolRuns, toolRunDetails } from "@/lib/tool-results"
import { History, CircleCheck, CircleAlert } from "lucide-react"
import { useMemo, useState, useRef } from "react"
export function ToolRunHistory({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { t } = useLanguage()
  const runs = useToolRuns()
  const registry = useAssistantCapabilityRegistry()
  const [replaying, setReplaying] = useState(false)
  const busy = useRef(false)
  const replay = async (id: string, page: PageId) => {
    const saved = toolRunDetails(id)?.replay
    if (!saved || busy.current) return
    busy.current = true
    setReplaying(true)
    setOpen(false)
    try {
      const result = (await registry.execute(page, saved.action, structuredClone(saved.input))) as {
        success?: boolean
        cancelled?: boolean
      }
      if (result.cancelled) toast.info(t("已取消重放"))
      else {
        onNavigate(page)
        result.success === false ? toast.error(t("重放失败，请查看执行结果")) : toast.success(t("重放完成"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      busy.current = false
      setReplaying(false)
      setOpen(true)
    }
  }
  const targets = useMemo(() => new Map(runs.map((run) => [run.id, historyTargets(run)])), [runs])
  const [open, setOpen] = useState(false)
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="default" data-wails-no-drag aria-haspopup="dialog" aria-label={t("执行记录")}>
            <History className="size-4" />
            {runs.length > 0 && <span className="text-xs tabular-nums">{runs.length}</span>}
          </Button>
        </DialogTrigger>
        <DialogContent className="flex max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("执行记录")}</DialogTitle>
            <DialogDescription>{t("参数和结果仅保留在当前会话。重放会恢复当次参数并重新执行，敏感操作仍需确认。")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {runs.map((run) => (
              <article key={run.id} className="min-w-0 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 break-all">
                    {run.success ? (
                      <CircleCheck className="size-4 shrink-0 text-muted-foreground" aria-label={t("成功")} />
                    ) : (
                      <CircleAlert className="size-4 shrink-0 text-destructive" aria-label={t("失败")} />
                    )}{" "}
                    {t(PAGE_LABELS[run.page])} · {run.action}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{run.durationMs} ms</span>
                </div>
                <div className="my-3 space-y-3">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("参数")}</p>
                    <pre
                      data-i18n-skip
                      aria-label={t("执行参数")}
                      className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-xs leading-5"
                    >
                      {toolRunDetails(run.id)
                        ? JSON.stringify(toolRunDetails(run.id)!.input, null, 2)
                        : t("旧记录未保存参数，请重新执行工具。")}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("结果")}</p>
                    <pre
                      data-i18n-skip
                      aria-label={t("执行结果")}
                      className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-xs leading-5"
                    >
                      {run.transferable === false && toolRunDetails(run.id)
                        ? typeof toolRunDetails(run.id)!.result === "string"
                          ? (toolRunDetails(run.id)!.result as string)
                          : JSON.stringify(toolRunDetails(run.id)!.result, null, 2)
                        : run.text}
                    </pre>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onNavigate(run.page)
                      setOpen(false)
                    }}
                  >
                    {t("打开工具")}
                  </Button>
                  <Button size="sm" disabled={replaying || !toolRunDetails(run.id)?.replay} onClick={() => void replay(run.id, run.page)}>
                    {t(replaying ? "正在重放…" : "重放")}
                  </Button>
                  {run.transferable !== false && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await writeClipboard(run.text)
                        toast.success(t("已复制"))
                      }}
                    >
                      {t("复制结果")}
                    </Button>
                  )}
                  {targets.get(run.id)?.map((target) => (
                    <Button
                      key={target.label}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        sendSmartInput(target.page, target.payload)
                        onNavigate(target.page)
                        setOpen(false)
                      }}
                    >
                      {t(target.label)}
                    </Button>
                  ))}
                </div>
                {!toolRunDetails(run.id)?.replay && (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t(toolRunDetails(run.id)?.replayUnavailable ?? "旧记录未保存参数，无法重放。")}
                  </p>
                )}
              </article>
            ))}
            {!runs.length && (
              <Empty className="min-h-52">
                <EmptyMedia>
                  <History aria-hidden />
                </EmptyMedia>
                <EmptyDescription>{t("执行工具后显示记录")}</EmptyDescription>
              </Empty>
            )}
          </DialogBody>
          {runs.length > 0 && (
            <DialogFooter>
              <Button variant="outline" size="sm" disabled={replaying} onClick={clearToolRuns}>
                {t("清空记录")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

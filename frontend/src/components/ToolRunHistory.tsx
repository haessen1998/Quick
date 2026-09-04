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
import { clearToolRuns, useToolRuns } from "@/lib/tool-results"
import { History, CircleCheck, CircleAlert } from "lucide-react"
import { useState } from "react"
export function ToolRunHistory({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { t } = useLanguage()
  const runs = useToolRuns()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-wails-no-drag
            aria-haspopup="dialog"
            aria-label={t("执行记录")}
          >
            <History className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="flex max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("执行记录")}</DialogTitle>
            <DialogDescription>{t("结果仅保留在当前应用会话，可继续交给其他工具。")}</DialogDescription>
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
                <pre
                  data-i18n-skip
                  className="my-3 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-3 text-xs leading-5"
                >
                  {run.text.slice(0, 4000)}
                </pre>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onNavigate(run.page)
                      setOpen(false)
                    }}
                  >
                    {t("查看工具")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      sendSmartInput("formatter", { operation: "json-format", input: run.text })
                      onNavigate("formatter")
                      setOpen(false)
                    }}
                  >
                    {t("发送到 JSON 格式化")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      sendSmartInput("converter", { module: "standard", source: "json", target: "yaml", input: run.text })
                      onNavigate("converter")
                      setOpen(false)
                    }}
                  >
                    JSON → YAML
                  </Button>
                </div>
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
              <Button variant="outline" size="sm" onClick={clearToolRuns}>
                {t("清空记录")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

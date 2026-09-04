import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"
import { PAGE_LABELS, type PageId } from "@/lib/pages"
import { sendSmartInput } from "@/lib/smart-input"
import { clearToolRuns, useToolRuns } from "@/lib/tool-results"
import { History } from "lucide-react"
import { useState } from "react"
export function ToolRunHistory({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { t } = useLanguage()
  const runs = useToolRuns()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="rounded border p-1.5" aria-label={t("执行记录")} onClick={() => setOpen(true)}>
        <History className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("执行记录")}</DialogTitle>
            <DialogDescription>{t("结果仅保留在当前应用会话，可继续交给其他工具。")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-auto">
            {runs.map((run) => (
              <article key={run.id} className="rounded border p-3">
                <div className="flex gap-2 text-sm">
                  <span>
                    {run.success ? "✓" : "!"} {t(PAGE_LABELS[run.page])} · {run.action}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{run.durationMs} ms</span>
                </div>
                <pre data-i18n-skip className="my-2 max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {run.text.slice(0, 4000)}
                </pre>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => {
                      onNavigate(run.page)
                      setOpen(false)
                    }}
                  >
                    {t("查看工具")}
                  </button>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => {
                      sendSmartInput("formatter", { operation: "json-format", input: run.text })
                      onNavigate("formatter")
                      setOpen(false)
                    }}
                  >
                    {t("发送到 JSON 格式化")}
                  </button>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => {
                      sendSmartInput("converter", { module: "standard", source: "json", target: "yaml", input: run.text })
                      onNavigate("converter")
                      setOpen(false)
                    }}
                  >
                    JSON → YAML
                  </button>
                </div>
              </article>
            ))}
            {!runs.length && <p className="text-sm text-muted-foreground">{t("执行工具后显示记录")}</p>}
          </div>
          {runs.length > 0 && (
            <button className="text-sm text-muted-foreground" onClick={clearToolRuns}>
              {t("清空记录")}
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

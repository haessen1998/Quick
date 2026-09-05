import { useLayoutEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/lib/i18n"
import type { PageId } from "@/lib/pages"
import {
  addWorkspaceDocument,
  closeWorkspaceDocument,
  restoreWorkspaceDocument,
  selectWorkspaceDocument,
  useWorkspaceDocuments,
} from "@/lib/workspace-store"
import { Plus, X, FileText } from "lucide-react"
import { toast } from "sonner"

export const DOCUMENT_PAGES: PageId[] = ["formatter", "converter", "validation", "text-workbench", "frontend", "time-ids"]
export function WorkspaceTabs({ page, children }: { page: PageId; children: ReactNode }) {
  const { t } = useLanguage()
  const { documents, selected } = useWorkspaceDocuments(page)
  const scrollArea = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const area = scrollArea.current
    if (!area) return
    const reveal = () =>
      area.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(area)
    return () => observer.disconnect()
  }, [page, selected])
  if (!DOCUMENT_PAGES.includes(page)) return <>{children}</>
  const current = documents.find((doc) => doc.id === selected)!
  const closeCurrent = () => {
    closeWorkspaceDocument(page, selected)
    toast(t("文档已关闭"), { action: { label: t("撤销"), onClick: () => restoreWorkspaceDocument(page) } })
  }
  return (
    <Tabs value={selected} onValueChange={(id) => selectWorkspaceDocument(page, id)} className="shrink-0">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b px-4" title={t("切页保留 · 关闭应用后清除")}>
        <div ref={scrollArea} className="min-w-0 overflow-x-auto py-1">
          <TabsList aria-label={t("工作文档")} className="h-9 bg-transparent p-0">
            {documents.map((doc) => (
              <TabsTrigger
                key={doc.id}
                value={doc.id}
                className="relative h-9 rounded-none px-3 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-foreground hover:text-foreground"
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
              >
                <FileText className="size-3.5" aria-hidden />
                {t(doc.title)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l pl-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("新建文档")}
            title={t("新建文档")}
            disabled={documents.length >= 12}
            onClick={() => {
              try {
                addWorkspaceDocument(page)
              } catch (error) {
                toast.error(String(error))
              }
            }}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${t("关闭")} ${t(current.title)}`}
            title={`${t("关闭")} ${t(current.title)}`}
            disabled={documents.length <= 1}
            onClick={closeCurrent}
          >
            <X />
          </Button>
        </div>
      </div>
      <TabsContent value={selected}>{children}</TabsContent>
    </Tabs>
  )
}

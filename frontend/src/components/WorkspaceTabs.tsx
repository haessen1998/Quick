import { useLanguage } from "@/lib/i18n"
import type { PageId } from "@/lib/pages"
import {
  addWorkspaceDocument,
  closeWorkspaceDocument,
  restoreWorkspaceDocument,
  selectWorkspaceDocument,
  useWorkspaceDocuments,
} from "@/lib/workspace-store"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"

export const DOCUMENT_PAGES: PageId[] = ["formatter", "converter", "validation", "text-workbench", "frontend", "time-ids"]
export function WorkspaceTabs({ page }: { page: PageId }) {
  const { t } = useLanguage()
  const { documents, selected } = useWorkspaceDocuments(page)
  if (!DOCUMENT_PAGES.includes(page)) return null
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-3 py-2" aria-label={t("工作文档")}>
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`flex shrink-0 items-center rounded-md border ${doc.id === selected ? "bg-background shadow-sm" : "border-transparent"}`}
        >
          <button
            className="px-3 py-1 text-xs"
            onClick={() => selectWorkspaceDocument(page, doc.id)}
            aria-current={doc.id === selected ? "page" : undefined}
          >
            {t(doc.title)}
          </button>
          {documents.length > 1 && (
            <button
              className="p-1.5 text-muted-foreground"
              aria-label={`${t("关闭")} ${t(doc.title)}`}
              onClick={() => {
                closeWorkspaceDocument(page, doc.id)
                toast(t("文档已关闭"), { action: { label: t("撤销"), onClick: () => restoreWorkspaceDocument(page) } })
              }}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      <button
        className="rounded p-1.5 hover:bg-muted"
        aria-label={t("新建文档")}
        onClick={() => {
          try {
            addWorkspaceDocument(page)
          } catch (error) {
            toast.error(String(error))
          }
        }}
      >
        <Plus className="size-4" />
      </button>
      <span className="ml-auto shrink-0 px-2 text-[10px] text-muted-foreground">{t("切页保留 · 关闭应用后清除")}</span>
    </div>
  )
}

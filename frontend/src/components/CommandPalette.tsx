import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { useLanguage } from "@/lib/i18n"
import { PAGE_IDS, PAGE_LABELS, type PageId } from "@/lib/pages"
import { FORMATTER_OPERATIONS, VALIDATION_MODES } from "@/lib/tool-catalog"
import { updateWorkspaceFields } from "@/lib/workspace-store"
import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

export function CommandPalette({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { t } = useLanguage()
  const registry = useAssistantCapabilityRegistry()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
  const items = useMemo(
    () =>
      [
        ...PAGE_IDS.map((page) => ({ id: page, label: t(PAGE_LABELS[page]), page, fields: {} as Record<string, unknown> })),
        ...FORMATTER_OPERATIONS.map((operation) => ({
          id: operation,
          label: operation.replace("-format", " 格式化").replace("-minify", " 压缩"),
          page: "formatter" as PageId,
          fields: { activeToolId: operation },
        })),
        ...VALIDATION_MODES.map((mode) => ({ id: mode, label: `${mode} ${t("校验")}`, page: "validation" as PageId, fields: { mode } })),
        {
          id: "base64-decode",
          label: "Base64 解码",
          page: "converter" as PageId,
          fields: { moduleId: "encoding", source: "base64", target: "text" },
        },
        {
          id: "json-yaml",
          label: "JSON → YAML",
          page: "converter" as PageId,
          fields: { moduleId: "standard", source: "json", target: "yaml" },
        },
      ].filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(query.toLowerCase())),
    [query, t],
  )
  const choose = (item: (typeof items)[number]) => {
    updateWorkspaceFields(item.page, item.fields)
    onNavigate(item.page)
    setOpen(false)
    setQuery("")
  }
  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={t("搜索工具")}
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Ctrl/⌘ K</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("搜索工具")}</DialogTitle>
            <DialogDescription>{t("按名称或操作搜索；打开工具会保留当前文档。")}</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            className="rounded-lg border p-3 text-sm outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="JSON、Base64、正则…"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && items[0]) choose(items[0])
            }}
          />
          <div className="max-h-80 overflow-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => choose(item)}
              >
                {t(item.label)}
              </button>
            ))}
            {!items.length && <p className="p-3 text-sm text-muted-foreground">{t("没有匹配的工具")}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            {registry.catalog().length} {t("个动作已就绪，无需打开页面")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

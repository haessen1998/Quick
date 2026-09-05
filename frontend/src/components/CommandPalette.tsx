import { Button } from "@/components/ui/button"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Dialog, DialogTrigger, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setQuery("")
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="text-muted-foreground"
            aria-label={t("搜索工具")}
            aria-haspopup="dialog"
            data-wails-no-drag
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Ctrl/⌘ K</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("搜索工具")}</DialogTitle>
            <DialogDescription>{t("按名称或操作搜索；打开工具会保留当前文档。")}</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} loop>
            <CommandInput value={query} onValueChange={setQuery} placeholder="JSON、Base64、正则…" aria-label={t("搜索工具")} />
            <CommandList className="mx-3 my-2" aria-label={t("搜索工具")}>
              <CommandEmpty>{t("没有匹配的工具")}</CommandEmpty>
              {items.map((item) => (
                <CommandItem key={item.id} value={item.id} onSelect={() => choose(item)}>
                  {t(item.label)}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          <DialogFooter className="flex-row flex-wrap items-center justify-between sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              {registry.catalog().length} {t("个动作已就绪，无需打开页面")}
            </p>
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              ↑ ↓ · Enter · Esc
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

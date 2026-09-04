import { CodeEditor } from "@/components/CodeEditor"
import { formatJSON } from "@/lib/data-integrity"
import { useLanguage } from "@/lib/i18n"
import { toast } from "sonner"

export function JSONSchemaEditor({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t } = useLanguage()
  return (
    <div className="overflow-hidden rounded-lg border border-input bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
        <span>JSON Schema</span>
        <span className="text-muted-foreground">{t("粘贴后自动格式化")}</span>
      </div>
      <CodeEditor
        className="h-56 min-h-32 resize-y font-mono text-sm"
        aria-label={t("表达式")}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        spellCheck={false}
        onPaste={(event) => {
          event.preventDefault()
          const field = event.currentTarget
          const pasted = value.slice(0, field.selectionStart) + event.clipboardData.getData("text/plain") + value.slice(field.selectionEnd)
          try {
            onValueChange(formatJSON(pasted))
          } catch (error) {
            onValueChange(pasted)
            toast.error(t("JSON Schema 格式化失败，已保留粘贴内容。可请小Q修复。"), {
              description: error instanceof Error ? error.message : String(error),
            })
          }
        }}
      />
    </div>
  )
}

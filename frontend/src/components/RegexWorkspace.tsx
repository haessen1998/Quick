import { CodeEditor } from "@/components/CodeEditor"
import { InputPreflight } from "@/components/InputPreflight"
import { Button } from "@/components/ui/button"
import { writeClipboard } from "@/lib/clipboard"
import { uiText } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { inputClass, regexFlags, type useValidationPageViewModel } from "@/models/ValidationPageModel"
import { Copy, Play, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

export function RegexWorkspace({ model }: { model: ReturnType<typeof useValidationPageViewModel> }) {
  const {
    t,
    expression,
    setExpression,
    input,
    setInput,
    flags,
    setFlags,
    replacement,
    setReplacement,
    matchResult,
    replaceResult,
    running,
    run,
    loadSample,
    error,
    highlighted,
    previewRunning,
    previewError,
    cancelPreview,
  } = model
  const cellHeader = "flex h-11 shrink-0 items-center justify-between gap-2 border-b px-4 text-xs font-medium"
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="space-y-3 border-b p-4">
        <label className="block space-y-2 text-xs font-medium">
          <span>{uiText("查找表达式")}</span>
          <input
            aria-label={uiText("表达式")}
            className={inputClass}
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Flags</span>
          {regexFlags.map((flag) => (
            <label
              key={flag.id}
              title={flag.title}
              className={cn(
                "app-interactive flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 font-mono text-xs",
                flags.includes(flag.id) && "border-primary bg-primary/8 text-primary",
              )}
            >
              <input
                type="checkbox"
                checked={flags.includes(flag.id)}
                onChange={() => setFlags((current) => (current.includes(flag.id) ? current.replace(flag.id, "") : `${current}${flag.id}`))}
                className="size-3 accent-primary"
              />
              {flag.label}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadSample}>
            {uiText("载入示例")}
          </Button>
          <Button disabled={running} onClick={() => void run()}>
            <Play />
            {uiText("查找匹配")}
          </Button>
          <Button variant="outline" disabled={!previewRunning} onClick={cancelPreview}>
            {uiText("取消预览")}
          </Button>
        </div>
      </div>
      <InputPreflight identity="regex" format="regex" expression={expression} input={input} flags={flags} />
      {error && (
        <div role="alert" className="m-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </div>
      )}
      <div data-slot="regex-grid" className="grid md:grid-cols-2">
        <section aria-label={uiText("原始文本")} className="min-w-0 border-b md:border-r">
          <h2 className={cellHeader}>{uiText("原始文本")}</h2>
          <CodeEditor
            aria-label={uiText("待校验数据")}
            className="h-56 resize-none"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
          />
        </section>
        <section aria-label={uiText("匹配结果")} className="min-w-0 border-b">
          <h2 className={cellHeader}>{uiText("匹配结果")}</h2>
          <pre
            aria-label={uiText("匹配结果")}
            className="h-56 overflow-auto whitespace-pre-wrap break-all bg-muted/20 p-4 font-mono text-sm leading-6"
          >
            {matchResult ?? t("执行后显示结果")}
          </pre>
        </section>
        <section aria-label={uiText("匹配高亮与替换")} className="min-w-0 border-b md:border-r md:border-b-0">
          <h2 className={cellHeader}>{uiText("匹配高亮与替换")}</h2>
          <div className="flex h-80 flex-col gap-3 p-4">
            <pre
              aria-label={uiText("匹配高亮")}
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-sm leading-6"
            >
              {previewError
                ? t(previewError)
                : previewRunning
                  ? uiText("正在预览…")
                  : highlighted.map((segment, index) =>
                      segment.match ? (
                        <mark key={index} className="rounded bg-amber-300/70 text-foreground">
                          {segment.value}
                        </mark>
                      ) : (
                        <span key={index}>{segment.value}</span>
                      ),
                    )}
            </pre>
            <label className="block space-y-2 text-xs font-medium">
              <span>{uiText("替换为")}</span>
              <textarea
                aria-label={uiText("替换为")}
                className={cn(inputClass, "h-16 resize-none overflow-auto focus-visible:ring-0 focus-visible:border-ring")}
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder={uiText("输入替换内容，例如 bar；留空则删除匹配内容")}
                spellCheck={false}
              />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {uiText("支持 $1、$<name>，留空删除匹配内容；勾选 g 替换全部。")}
            </p>
            <div>
              <Button disabled={running} onClick={() => void run("replace")}>
                <Play />
                {uiText("执行替换")}
              </Button>
            </div>
          </div>
        </section>
        <section aria-label={uiText("替换结果")} className="min-w-0">
          <div className={cellHeader}>
            <h2>{uiText("替换结果")}</h2>
            <Button
              variant="ghost"
              size="xs"
              disabled={replaceResult === null}
              onClick={async () => {
                await writeClipboard(replaceResult ?? "")
                toast.success(t("已复制"))
              }}
            >
              <Copy />
              {uiText("复制结果")}
            </Button>
          </div>
          <pre
            aria-label={uiText("替换结果")}
            className="h-80 overflow-auto whitespace-pre-wrap break-all bg-muted/20 p-4 font-mono text-sm leading-6"
          >
            {replaceResult === null ? t("执行后显示结果") : replaceResult || uiText("替换结果为空")}
          </pre>
        </section>
      </div>
    </div>
  )
}

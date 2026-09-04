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
  return (
    <div className="space-y-3">
      <InputPreflight identity="regex" format="regex" expression={expression} input={input} flags={flags} />
      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label={uiText("输入与查找匹配")} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{uiText("输入与查找匹配")}</h2>
            <Button variant="outline" size="sm" onClick={loadSample}>
              {uiText("载入示例")}
            </Button>
          </header>
          <div className="space-y-3 p-4">
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
                    onChange={() =>
                      setFlags((current) => (current.includes(flag.id) ? current.replace(flag.id, "") : `${current}${flag.id}`))
                    }
                    className="size-3 accent-primary"
                  />
                  {flag.label}
                </label>
              ))}
            </div>
            <label className="block space-y-2 text-xs font-medium">
              <span>{uiText("原始文本")}</span>
              <CodeEditor
                aria-label={uiText("待校验数据")}
                className={cn(inputClass, "h-64 resize-none font-mono leading-6")}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={running} onClick={() => void run()}>
                <Play />
                {uiText("查找匹配")}
              </Button>
              <Button variant="outline" disabled={!previewRunning} onClick={cancelPreview}>
                {uiText("取消预览")}
              </Button>
            </div>
          </div>
          <div className="border-t">
            <h3 className="px-4 pt-3 text-xs font-medium">{uiText("匹配结果")}</h3>
            <pre
              aria-label={uiText("匹配结果")}
              className="max-h-64 min-h-20 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm"
            >
              {matchResult ?? t("执行后显示结果")}
            </pre>
          </div>
          <details className="border-t px-4 py-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">{uiText("匹配高亮")}</summary>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">
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
          </details>
        </section>
        <section aria-label={uiText("替换与结果")} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
          <header className="flex min-h-[3.25rem] items-center border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{uiText("替换与结果")}</h2>
          </header>
          <div className="space-y-3 p-4">
            <label className="block space-y-2 text-xs font-medium">
              <span>{uiText("替换为")}</span>
              <textarea
                aria-label={uiText("替换为")}
                className={cn(inputClass, "h-20 resize-none overflow-auto")}
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder={uiText("输入替换内容，例如 bar；留空则删除匹配内容")}
                spellCheck={false}
              />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {uiText("使用输入组的原始文本和查找表达式。支持 $1、$<name>，留空删除匹配内容；g 控制是否替换全部。")}
            </p>
            <Button disabled={running} onClick={() => void run("replace")}>
              <Play />
              {uiText("执行替换")}
            </Button>
          </div>
          <div className="border-t">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <h3 className="text-xs font-medium">{uiText("替换结果")}</h3>
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
          </div>
        </section>
      </div>
    </div>
  )
}

import { InputPreflight } from "@/components/InputPreflight"
import { CodeEditor } from "@/components/CodeEditor"
import { Button } from "@/components/ui/button"
import { writeClipboard } from "@/lib/clipboard"
import { uiText } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { modules,RadioGroup,useDataConversionPageViewModel } from "@/models/DataConversionPageModel"
import { ArrowLeftRight,Copy,Play,Sparkles } from "lucide-react"
import { toast } from "sonner"

export default function DataConversionPage() {
 const { t, moduleId, module, source, target, setTarget, input, setInput, output, setOutput, error, setError, chooseModule, chooseSource, run, swappable, swap } = useDataConversionPageViewModel()
return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("开发工具")}</div><h1 className="text-3xl font-semibold tracking-tight">{uiText("数据转换")}</h1><p className="mt-2 text-sm text-muted-foreground">{uiText("选择模块，再指定来源与目标；输入输出区域保持一致。")}</p></div>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{modules.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => chooseModule(item)} className={cn("app-interactive flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted", moduleId === item.id && "border-primary bg-primary/8 ring-1 ring-primary")}><Icon className="size-4 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{t(item.label)}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{t(item.description)}</span></span></button> })}</div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid gap-5 border-b p-4 lg:grid-cols-2"><RadioGroup legend={uiText("来源")} name={`${module.id}-source`} options={module.sources} value={source} disabledValue={module.sources.length > 1 ? target : undefined} onChange={chooseSource} /><RadioGroup legend={uiText("目标")} name={`${module.id}-target`} options={module.targets} value={target} disabledValue={module.targets.some((option) => option.id === source) ? source : undefined} onChange={(next) => { setTarget(next); setOutput(""); setError("") }} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><div className="text-sm font-medium">{t(module.label)}</div><div className="text-xs text-muted-foreground">{t(module.description)}</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={module.samples[source] === undefined} onClick={() => { setInput(module.samples[source] ?? ""); setOutput(""); setError("") }}>{t("载入示例")}</Button><Button variant="outline" disabled={!swappable} onClick={swap}><ArrowLeftRight />{t("交换")}</Button><Button onClick={run} disabled={!input}><Play />{t("执行转换")}</Button></div></div>
          <InputPreflight identity={`${moduleId}/${source}/${target}`} format={source} input={input} />
          {error && <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="grid lg:grid-cols-2"><div className="border-b lg:border-r lg:border-b-0"><div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground"><span>{t("输入")} · {t(module.sources.find((option) => option.id === source)?.label ?? "")}</span><span>{t(`${input.length} 字符`)}</span></div><CodeEditor className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none" aria-label={t("输入")} error={error} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></div><div><div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground"><span>{t("输出")} · {t(module.targets.find((option) => option.id === target)?.label ?? "")}</span><Button variant="ghost" size="xs" disabled={!output} onClick={async () => { await writeClipboard(output); toast.success(t("已复制")) }}><Copy />{t("复制")}</Button></div><CodeEditor className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-muted/20 p-4 font-mono text-sm leading-6 outline-none" aria-label={t("输出")} readOnly value={output} placeholder={t("转换结果会显示在这里…")} /></div></div>
        </div>
      </div>
    </section>
  )
}

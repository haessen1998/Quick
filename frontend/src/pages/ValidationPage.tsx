import { useState } from "react"
import { Braces, CheckCircle2, CodeXml, Play, Regex, Sparkles, TriangleAlert } from "lucide-react"
import { JSONPath } from "jsonpath-plus"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Mode = "jsonpath" | "xpath" | "regex"
const inputClass = "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const regexFlags = [
  { id: "g", label: "g", title: "全局匹配" },
  { id: "i", label: "i", title: "忽略大小写" },
  { id: "m", label: "m", title: "多行模式" },
  { id: "s", label: "s", title: "点号匹配换行" },
  { id: "u", label: "u", title: "Unicode 模式" },
  { id: "y", label: "y", title: "粘连匹配" },
] as const

function evaluateXPath(xml: string, expression: string) {
  const documentValue = new DOMParser().parseFromString(xml, "application/xml")
  const parserError = documentValue.querySelector("parsererror")
  if (parserError) throw new Error(parserError.textContent || "XML 解析失败")
  const result = documentValue.evaluate(expression, documentValue, null, XPathResult.ANY_TYPE, null)
  if (result.resultType === XPathResult.STRING_TYPE) return result.stringValue
  if (result.resultType === XPathResult.NUMBER_TYPE) return String(result.numberValue)
  if (result.resultType === XPathResult.BOOLEAN_TYPE) return String(result.booleanValue)
  const values: string[] = []
  let node = result.iterateNext()
  while (node) {
    values.push(node instanceof Element ? new XMLSerializer().serializeToString(node) : node.textContent ?? "")
    node = result.iterateNext()
  }
  return values.length ? values.join("\n") : "未匹配到节点"
}

export default function ValidationPage() {
  const [mode, setMode] = useState<Mode>("jsonpath")
  const [expression, setExpression] = useState("$.store.books[?(@.price < 20)].title")
  const [input, setInput] = useState('{"store":{"books":[{"title":"Go","price":18},{"title":"Wails","price":26}]}}')
  const [flags, setFlags] = useState("gi")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")

  const selectMode = (next: Mode) => {
    setMode(next); setOutput(""); setError("")
    if (next === "jsonpath") { setExpression("$.store.books[?(@.price < 20)].title"); setInput('{"store":{"books":[{"title":"Go","price":18},{"title":"Wails","price":26}]}}') }
    if (next === "xpath") { setExpression("//book[@price < 20]/title"); setInput('<store><book price="18"><title>Go</title></book><book price="26"><title>Wails</title></book></store>') }
    if (next === "regex") { setExpression("(?<protocol>https?)://(?<host>[^/\\s]+)"); setInput("访问 https://github.com/haessen1998/Quick 或 https://v3.wails.io"); setFlags("gi") }
  }

  const run = () => {
    try {
      const result = mode === "jsonpath"
        ? JSON.stringify(JSONPath({ path: expression, json: JSON.parse(input), wrap: true }), null, 2)
        : mode === "xpath"
          ? evaluateXPath(input, expression)
          : (() => {
              const uniqueFlags = Array.from(new Set(flags.replace(/[^gimsuy]/g, "").split(""))).join("")
              const regex = new RegExp(expression, uniqueFlags)
              const serialize = (match: RegExpExecArray) => ({ value: match[0], index: match.index, groups: match.groups ?? {}, captures: match.slice(1) })
              const matches = uniqueFlags.includes("g")
                ? Array.from(input.matchAll(regex), serialize)
                : (() => { const match = regex.exec(input); return match ? [serialize(match)] : [] })()
              return JSON.stringify(matches, null, 2)
            })()
      setOutput(result); setError("")
    } catch (caught) {
      setOutput(""); setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const modes = [
    { id: "jsonpath" as const, label: "JSONPath", icon: Braces },
    { id: "xpath" as const, label: "XPath", icon: CodeXml },
    { id: "regex" as const, label: "正则表达式", icon: Regex },
  ]

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">校验工具</h1><p className="mt-2 text-sm text-muted-foreground">运行 JSONPath、XPath 与正则表达式，查看匹配结果和错误信息。</p></div>
        <div className="mb-4 flex flex-wrap gap-2">
          {modes.map(({ id, label, icon: Icon }) => <Button key={id} variant={mode === id ? "default" : "outline"} onClick={() => selectMode(id)}><Icon />{label}</Button>)}
        </div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <input className={inputClass} value={expression} onChange={(event) => setExpression(event.target.value)} placeholder={`${mode} 表达式`} />
              {mode === "regex" && <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">Flags</span>{regexFlags.map((flag) => <label key={flag.id} title={flag.title} className={cn("app-interactive flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs", flags.includes(flag.id) && "border-primary bg-primary/8 text-primary")}><input type="checkbox" checked={flags.includes(flag.id)} onChange={() => setFlags((current) => current.includes(flag.id) ? current.replace(flag.id, "") : `${current}${flag.id}`)} className="size-3 accent-primary" />{flag.label}</label>)}<code className="ml-auto text-xs text-muted-foreground">/{expression}/{flags}</code></div>}
            </div>
            <Button onClick={run}><Play />执行校验</Button>
          </div>
          {error && <div className="m-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert className="size-4 shrink-0" />{error}</div>}
          <div className="grid md:grid-cols-2">
            <label className="border-b md:border-r md:border-b-0"><div className="flex h-10 items-center border-b px-4 text-xs text-muted-foreground">待校验数据</div><textarea className={cn(inputClass, "h-[28rem] resize-none overflow-auto rounded-none border-0 p-4 font-mono leading-6 focus-visible:ring-0")} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></label>
            <div><div className="flex h-10 items-center gap-2 border-b px-4 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />匹配结果</div><pre className="h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-sm leading-6">{output || "执行后显示结果"}</pre></div>
          </div>
        </div>
      </div>
    </section>
  )
}

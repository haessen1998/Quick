import { useMemo, useState } from "react"
import { Braces, CheckCircle2, Code2, CodeXml, Copy, ListChecks, Play, Plus, Regex, Sparkles, Target, Trash2, TriangleAlert } from "lucide-react"
import { JSONPath } from "jsonpath-plus"
import Ajv from "ajv"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { cn } from "@/lib/utils"

type Mode = "jsonpath" | "json-schema" | "xpath" | "selector" | "glob" | "regex"
type RegexTestCase = { input: string; expected: boolean; label?: string }
type RegexTestResult = RegexTestCase & { actual: boolean; passed: boolean }
const inputClass = "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const regexFlags = [
  { id: "g", label: "g", title: "全局匹配" }, { id: "i", label: "i", title: "忽略大小写" },
  { id: "m", label: "m", title: "多行模式" }, { id: "s", label: "s", title: "点号匹配换行" },
  { id: "u", label: "u", title: "Unicode 模式" }, { id: "y", label: "y", title: "粘连匹配" },
] as const

function parseMarkup(input: string, mime: DOMParserSupportedType) {
  const documentValue = new DOMParser().parseFromString(input, mime)
  const parserError = documentValue.querySelector("parsererror")
  if (parserError) throw new Error(parserError.textContent || "文档解析失败")
  return documentValue
}

function evaluateXPath(xml: string, expression: string) {
  const documentValue = parseMarkup(xml, "application/xml")
  const result = documentValue.evaluate(expression, documentValue, null, XPathResult.ANY_TYPE, null)
  if (result.resultType === XPathResult.STRING_TYPE) return result.stringValue
  if (result.resultType === XPathResult.NUMBER_TYPE) return String(result.numberValue)
  if (result.resultType === XPathResult.BOOLEAN_TYPE) return String(result.booleanValue)
  const values: string[] = []
  let node = result.iterateNext()
  while (node) { values.push(node instanceof Element ? new XMLSerializer().serializeToString(node) : node.textContent ?? ""); node = result.iterateNext() }
  return values.length ? values.join("\n") : "未匹配到节点"
}

function evaluateSelector(html: string, expression: string) {
  const documentValue = parseMarkup(html, "text/html")
  const values = Array.from(documentValue.querySelectorAll(expression)).map((node, index) => ({ index, tag: node.tagName.toLowerCase(), text: node.textContent?.trim() ?? "", html: node.outerHTML }))
  return JSON.stringify(values, null, 2)
}

function evaluateJSONSchema(input: string, expression: string) {
  const validator = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(expression))
  const valid = validator(JSON.parse(input))
  return JSON.stringify({ valid, errors: validator.errors ?? [] }, null, 2)
}

function evaluateGlob(input: string, expression: string) {
  const escaped = expression.replace(/\\/g, "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*")
  const regex = new RegExp(`^${escaped}$`, "i")
  const values = input.replace(/\r\n?/g, "\n").split("\n").filter(Boolean).map((value) => ({ value, matched: regex.test(value.replace(/\\/g, "/")) }))
  return JSON.stringify(values, null, 2)
}

function cleanFlags(flags: string) { return Array.from(new Set(flags.replace(/[^dgimsuvy]/g, "").split(""))).join("") }

function evaluate(mode: Mode, expression: string, input: string, flags: string) {
  if (mode === "jsonpath") return JSON.stringify(JSONPath({ path: expression, json: JSON.parse(input), wrap: true }), null, 2)
  if (mode === "json-schema") return evaluateJSONSchema(input, expression)
  if (mode === "xpath") return evaluateXPath(input, expression)
  if (mode === "selector") return evaluateSelector(input, expression)
  if (mode === "glob") return evaluateGlob(input, expression)
  const uniqueFlags = cleanFlags(flags)
  const regex = new RegExp(expression, uniqueFlags)
  const serialize = (match: RegExpExecArray) => ({ value: match[0], index: match.index, groups: match.groups ?? {}, captures: match.slice(1) })
  const matches = uniqueFlags.includes("g") ? Array.from(input.matchAll(regex), serialize) : (() => { const match = regex.exec(input); return match ? [serialize(match)] : [] })()
  return JSON.stringify(matches, null, 2)
}

function runRegexTests(expression: string, flags: string, cases: RegexTestCase[]): RegexTestResult[] {
  const regex = new RegExp(expression, cleanFlags(flags).replace(/[gy]/g, ""))
  return cases.map((item) => { const actual = regex.test(item.input); return { ...item, actual, passed: actual === item.expected } })
}

function regexSegments(input: string, expression: string, flags: string) {
  if (!expression) return [{ value: input, match: false }]
  try {
    const regex = new RegExp(expression, cleanFlags(flags).replace(/[gy]/g, "") + "g")
    const result: { value: string; match: boolean }[] = []
    let index = 0
    for (const match of input.matchAll(regex)) {
      const start = match.index ?? 0
      if (start > index) result.push({ value: input.slice(index, start), match: false })
      if (match[0]) result.push({ value: match[0], match: true })
      index = start + match[0].length
    }
    if (index < input.length) result.push({ value: input.slice(index), match: false })
    return result.length ? result : [{ value: input, match: false }]
  } catch { return [{ value: input, match: false }] }
}

export default function ValidationPage() {
  const [mode, setMode] = useState<Mode>("jsonpath")
  const [expression, setExpression] = useState("$.store.books[?(@.price < 20)].title")
  const [input, setInput] = useState('{"store":{"books":[{"title":"Go","price":18},{"title":"React","price":26}]}}')
  const [flags, setFlags] = useState("gi")
  const [replacement, setReplacement] = useState("$<host>")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const [testCases, setTestCases] = useState<RegexTestCase[]>([{ label: "有效 HTTPS", input: "https://go.dev", expected: true }, { label: "无协议", input: "go.dev", expected: false }])
  const [testResults, setTestResults] = useState<RegexTestResult[]>([])
  const [generatedLanguage, setGeneratedLanguage] = useState("javascript")
  const [generatedCode, setGeneratedCode] = useState("")
  const [codeExplanation, setCodeExplanation] = useState("")

  const selectMode = (next: Mode) => {
    setMode(next); setOutput(""); setError(""); setTestResults([]); setGeneratedCode("")
    if (next === "jsonpath") { setExpression("$.store.books[?(@.price < 20)].title"); setInput('{"store":{"books":[{"title":"Go","price":18},{"title":"React","price":26}]}}') }
    if (next === "json-schema") { setExpression('{"type":"object","required":["name","version"],"properties":{"name":{"type":"string","minLength":1},"version":{"type":"integer","minimum":1}},"additionalProperties":false}'); setInput('{"name":"Quick","version":1}') }
    if (next === "xpath") { setExpression("//book[@price < 20]/title"); setInput('<store><book price="18"><title>Go</title></book><book price="26"><title>React</title></book></store>') }
    if (next === "selector") { setExpression("article.card[data-ready='true'] > h2"); setInput('<main><article class="card" data-ready="true"><h2>Quick</h2></article><article class="card"><h2>Other</h2></article></main>') }
    if (next === "glob") { setExpression("src/**/*.tsx"); setInput("src/App.tsx\nsrc/pages/Home.tsx\nsrc/styles/app.css\nREADME.md") }
    if (next === "regex") { setExpression("(?<protocol>https?)://(?<host>[^/\\s]+)"); setInput("访问 https://github.com/haessen1998/Quick 或 https://go.dev"); setFlags("gi") }
  }

  const run = () => {
    try { const result = evaluate(mode, expression, input, flags); setOutput(result); setError("") }
    catch (caught) { setOutput(""); setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const runTests = () => {
    try { setTestResults(runRegexTests(expression, flags, testCases)); setError("") }
    catch (caught) { setTestResults([]); setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const replacementPreview = useMemo(() => {
    if (mode !== "regex") return ""
    try { return input.replace(new RegExp(expression, cleanFlags(flags)), replacement) } catch { return "表达式有效后显示替换预览" }
  }, [expression, flags, input, mode, replacement])
  const highlighted = useMemo(() => mode === "regex" ? regexSegments(input, expression, flags) : [], [expression, flags, input, mode])

  useAssistantCapability({
    page: "validation",
    getContext: () => ({ mode, expression, flags: mode === "regex" ? flags : undefined, replacement: mode === "regex" ? replacement : undefined, input: input.slice(0, 8000), output: output.slice(0, 8000), error, testCases: mode === "regex" ? testCases.slice(0, 30) : undefined, testResults: mode === "regex" ? testResults.slice(0, 30) : undefined, generatedLanguage, hasGeneratedCode: Boolean(generatedCode) }),
    actions: {
      run: (values) => {
        const action = String(values.action ?? "run")
        const nextMode = String(values.mode ?? "regex") as Mode
        if (!(["jsonpath", "json-schema", "xpath", "selector", "glob", "regex"] as string[]).includes(nextMode)) throw new Error(`不支持的校验模式：${nextMode}`)
        const nextExpression = String(values.expression ?? expression)
        const nextInput = String(values.input ?? input)
        const nextFlags = cleanFlags(String(values.flags ?? "gi"))
        setMode(nextMode); setExpression(nextExpression); setInput(nextInput); setFlags(nextFlags)
        try {
          if (action === "test-cases") {
            if (nextMode !== "regex") throw new Error("批量测试用例当前只支持正则表达式")
            const cases = Array.isArray(values.testCases) ? values.testCases.slice(0, 100).map((item) => { const value = item as Record<string, unknown>; return { input: String(value.input ?? ""), expected: Boolean(value.expected), label: String(value.label ?? "") } }) : []
            if (!cases.length) throw new Error("请提供至少一个测试用例")
            const results = runRegexTests(nextExpression, nextFlags, cases)
            setTestCases(cases); setTestResults(results); setError("")
            return { success: results.every((item) => item.passed), action, passed: results.filter((item) => item.passed).length, total: results.length, results, executed: true }
          }
          if (action === "show-code") {
            const language = String(values.language ?? "javascript")
            const code = String(values.code ?? "")
            if (!code.trim()) throw new Error("没有可显示的代码")
            setGeneratedLanguage(language); setGeneratedCode(code); setCodeExplanation(String(values.explanation ?? "")); setError("")
            return { success: true, action, language, codeLength: code.length, executed: true }
          }
          const result = evaluate(nextMode, nextExpression, nextInput, nextFlags)
          setReplacement(String(values.replacement ?? replacement)); setOutput(result); setError("")
          return { success: true, action, mode: nextMode, result: result.slice(0, 16000), truncated: result.length > 16000, executed: true }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setOutput(""); setError(message)
          return { success: false, action, mode: nextMode, error: message, executed: true }
        }
      },
    },
  })

  const modes = [
    { id: "jsonpath" as const, label: "JSONPath", icon: Braces }, { id: "json-schema" as const, label: "JSON Schema", icon: CheckCircle2 },
    { id: "xpath" as const, label: "XPath", icon: CodeXml }, { id: "selector" as const, label: "CSS Selector", icon: Target },
    { id: "glob" as const, label: "Glob", icon: ListChecks }, { id: "regex" as const, label: "正则表达式", icon: Regex },
  ]

  return (
    <section className="page-shell"><div className="mx-auto w-full max-w-7xl">
      <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">校验工具</h1><p className="mt-2 text-sm text-muted-foreground">运行 JSONPath、XPath、CSS Selector 与正则；批量验证正反及边界样例，并承接 AI 生成的多语言代码。</p></div>
      <div className="mb-4 flex flex-wrap gap-2">{modes.map(({ id, label, icon: Icon }) => <Button key={id} variant={mode === id ? "default" : "outline"} onClick={() => selectMode(id)}><Icon />{label}</Button>)}</div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_auto]"><div className="space-y-3">{mode === "json-schema" ? <textarea className={`${inputClass} h-28 resize-y font-mono`} value={expression} onChange={(event) => setExpression(event.target.value)} placeholder="JSON Schema" /> : <input className={inputClass} value={expression} onChange={(event) => setExpression(event.target.value)} placeholder={`${mode} 表达式`} />}
          {mode === "regex" && <><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">Flags</span>{regexFlags.map((flag) => <label key={flag.id} title={flag.title} className={cn("app-interactive flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs", flags.includes(flag.id) && "border-primary bg-primary/8 text-primary")}><input type="checkbox" checked={flags.includes(flag.id)} onChange={() => setFlags((current) => current.includes(flag.id) ? current.replace(flag.id, "") : `${current}${flag.id}`)} className="size-3 accent-primary" />{flag.label}</label>)}<code className="ml-auto text-xs text-muted-foreground">/{expression}/{flags}</code></div><input className={inputClass} value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="替换模板，例如 $1 或 $<name>" /></>}
        </div><Button onClick={run}><Play />执行校验</Button></div>
        {error && <div className="m-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert className="size-4 shrink-0" />{error}</div>}
        <div className="grid md:grid-cols-2"><label className="border-b md:border-r md:border-b-0"><div className="flex h-10 items-center border-b px-4 text-xs text-muted-foreground">待校验数据</div><textarea className={cn(inputClass, "h-[24rem] resize-none overflow-auto rounded-none border-0 p-4 font-mono leading-6 focus-visible:ring-0")} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></label><div><div className="flex h-10 items-center gap-2 border-b px-4 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />匹配结果</div><pre className="h-[24rem] overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-sm leading-6">{output || "执行后显示结果"}</pre></div></div>
      </div>
      {mode === "regex" && <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="border-b px-4 py-3 text-sm font-medium">匹配高亮与替换预览</div><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-b p-4 font-mono text-sm">{highlighted.map((segment, index) => segment.match ? <mark key={index} className="rounded bg-amber-300/70 px-0.5 text-foreground">{segment.value}</mark> : <span key={index}>{segment.value}</span>)}</pre><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-sm">{replacementPreview}</pre></article>
        <article className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="flex items-center justify-between border-b px-4 py-3"><span className="flex items-center gap-2 text-sm font-medium"><ListChecks className="size-4" />测试用例</span><div className="flex gap-2"><Button variant="ghost" size="xs" onClick={() => setTestCases((items) => [...items, { input: "", expected: true, label: "" }])}><Plus />添加</Button><Button size="xs" onClick={runTests}><Play />运行</Button></div></div><div className="max-h-80 overflow-auto">{testCases.map((item, index) => { const result = testResults[index]; return <div key={index} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b p-2 last:border-0"><input className={inputClass} value={item.input} onChange={(event) => setTestCases((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, input: event.target.value } : value))} placeholder={item.label || `样例 ${index + 1}`} /><label className={cn("flex items-center gap-1 rounded-md border px-2 py-2 text-xs", result && (result.passed ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300" : "border-destructive/50 text-destructive"))}><input type="checkbox" checked={item.expected} onChange={(event) => setTestCases((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, expected: event.target.checked } : value))} className="accent-primary" />应匹配{result && ` · ${result.passed ? "通过" : "失败"}`}</label><Button variant="ghost" size="icon" onClick={() => setTestCases((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div> })}</div></article>
        <article className="overflow-hidden rounded-xl border bg-card shadow-sm xl:col-span-2"><div className="flex items-center justify-between border-b px-4 py-3"><span className="flex items-center gap-2 text-sm font-medium"><Code2 className="size-4" />AI 生成的使用代码</span><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{generatedLanguage}</span><Button variant="ghost" size="xs" disabled={!generatedCode} onClick={async () => { await navigator.clipboard.writeText(generatedCode); toast.success("代码已复制") }}><Copy />复制</Button></div></div>{codeExplanation && <div className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">{codeExplanation}</div>}<pre className="min-h-28 max-h-96 overflow-auto whitespace-pre p-4 font-mono text-sm">{generatedCode || "让小Q根据当前正则生成 JavaScript、TypeScript、Python、C#、Java、Go、Rust 或 PHP 使用代码。"}</pre></article>
      </div>}
    </div></section>
  )
}

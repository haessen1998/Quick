import { checkInput } from "@/lib/input-preflight"
import { useAssistantCapability, useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { useLanguage } from "@/lib/i18n"
import { evaluateRegex } from "@/lib/regex-client"
import { useDraftState } from "@/lib/workspace-store"
import Ajv from "ajv"
import { JSONPath } from "jsonpath-plus"
import { Braces, CheckCircle2, CodeXml, ListChecks, Regex, Target } from "lucide-react"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

export type Mode = "jsonpath" | "json-schema" | "xpath" | "selector" | "glob" | "regex"

export type RegexTestCase = {
  input: string
  expected: boolean
  label?: string
}

export type RegexTestResult = RegexTestCase & {
  actual: boolean
  passed: boolean
}

export const inputClass =
  "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

export const regexFlags = [
  { id: "g", label: "g", title: "全局匹配" },
  { id: "i", label: "i", title: "忽略大小写" },
  { id: "m", label: "m", title: "多行模式" },
  { id: "s", label: "s", title: "点号匹配换行" },
  { id: "u", label: "u", title: "Unicode 模式" },
  { id: "y", label: "y", title: "粘连匹配" },
] as const

export function parseMarkup(input: string, mime: DOMParserSupportedType) {
  const documentValue = new DOMParser().parseFromString(input, mime)
  const parserError = documentValue.querySelector("parsererror")
  if (parserError) throw new Error(parserError.textContent || "文档解析失败")
  return documentValue
}

export function evaluateXPath(xml: string, expression: string) {
  const documentValue = parseMarkup(xml, "application/xml")
  const result = documentValue.evaluate(expression, documentValue, null, XPathResult.ANY_TYPE, null)
  if (result.resultType === XPathResult.STRING_TYPE) return result.stringValue
  if (result.resultType === XPathResult.NUMBER_TYPE) return String(result.numberValue)
  if (result.resultType === XPathResult.BOOLEAN_TYPE) return String(result.booleanValue)
  const values: string[] = []
  let node = result.iterateNext()
  while (node) {
    values.push(node instanceof Element ? new XMLSerializer().serializeToString(node) : (node.textContent ?? ""))
    node = result.iterateNext()
  }
  return values.length ? values.join("\n") : "未匹配到节点"
}

export function evaluateSelector(html: string, expression: string) {
  const documentValue = parseMarkup(html, "text/html")
  const values = Array.from(documentValue.querySelectorAll(expression)).map((node, index) => ({
    index,
    tag: node.tagName.toLowerCase(),
    text: node.textContent?.trim() ?? "",
    html: node.outerHTML,
  }))
  return JSON.stringify(values, null, 2)
}

export function evaluateJSONSchema(input: string, expression: string) {
  const validator = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(expression))
  const valid = validator(JSON.parse(input))
  return JSON.stringify({ valid, errors: validator.errors ?? [] }, null, 2)
}

export function evaluateGlob(input: string, expression: string) {
  const escaped = expression
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*")
  const regex = new RegExp(`^${escaped}$`, "i")
  const values = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter(Boolean)
    .map((value) => ({
      value,
      matched: regex.test(value.replace(/\\/g, "/")),
    }))
  return JSON.stringify(values, null, 2)
}

export function cleanFlags(flags: string) {
  return Array.from(new Set(flags.replace(/[^dgimsuvy]/g, "").split(""))).join("")
}

export async function evaluate(mode: Mode, expression: string, input: string, flags: string, signal?: AbortSignal) {
  if (mode === "jsonpath") return JSON.stringify(JSONPath({ path: expression, json: JSON.parse(input), wrap: true }), null, 2)
  if (mode === "json-schema") return evaluateJSONSchema(input, expression)
  if (mode === "xpath") return evaluateXPath(input, expression)
  if (mode === "selector") return evaluateSelector(input, expression)
  if (mode === "glob") return evaluateGlob(input, expression)
  return evaluateRegex({ kind: "matches", expression, input, flags }, signal)
}

function useValidationPageModel() {
  const { t } = useLanguage()
  const registry = useAssistantCapabilityRegistry()
  const [mode, setMode] = useDraftState<Mode>("validation", "mode", "jsonpath")
  const [expression, setExpression] = useDraftState("validation", "expression", "$.store.books[?(@.price < 20)].title")
  const [input, setInput] = useDraftState(
    "validation",
    "input",
    '{"store":{"books":[{"title":"Go","price":18},{"title":"React","price":26}]}}',
  )
  const [flags, setFlags] = useDraftState("validation", "flags", "gi")
  const [replacement, setReplacement] = useDraftState("validation", "replacement", "$<host>")
  const [output, setOutput] = useDraftState("validation", "output", "")
  const [outputKind, setOutputKind] = useDraftState("validation", "outputKind", "matches")
  const [hasOutput, setHasOutput] = useDraftState("validation", "hasOutput", Boolean(output))
  const [running, setRunning] = useState(false)
  const [error, setError] = useDraftState("validation", "error", "")
  const [testCases, setTestCases] = useDraftState<RegexTestCase[]>("validation", "testCases", [
    { label: "有效 HTTPS", input: "https://go.dev", expected: true },
    { label: "无协议", input: "go.dev", expected: false },
  ])
  const [testResults, setTestResults] = useDraftState<RegexTestResult[]>("validation", "testResults", [])
  const [generatedLanguage, setGeneratedLanguage] = useDraftState("validation", "generatedLanguage", "javascript")
  const [generatedCode, setGeneratedCode] = useDraftState("validation", "generatedCode", "")
  const [codeExplanation, setCodeExplanation] = useDraftState("validation", "codeExplanation", "")

  const selectMode = (next: Mode) => {
    setMode(next)
    setHasOutput(false)
    setOutput("")
    setError("")
    setTestResults([])
    setGeneratedCode("")
  }

  const loadSample = () => {
    const next = mode
    if (next === "jsonpath") {
      setExpression("$.store.books[?(@.price < 20)].title")
      setInput('{"store":{"books":[{"title":"Go","price":18},{"title":"React","price":26}]}}')
    }
    if (next === "json-schema") {
      setExpression(
        '{"type":"object","required":["name","version"],"properties":{"name":{"type":"string","minLength":1},"version":{"type":"integer","minimum":1}},"additionalProperties":false}',
      )
      setInput('{"name":"Quick","version":1}')
    }
    if (next === "xpath") {
      setExpression("//book[@price < 20]/title")
      setInput('<store><book price="18"><title>Go</title></book><book price="26"><title>React</title></book></store>')
    }
    if (next === "selector") {
      setExpression("article.card[data-ready='true'] > h2")
      setInput(
        '<main><article class="card" data-ready="true"><h2>Quick</h2></article><article class="card"><h2>Other</h2></article></main>',
      )
    }
    if (next === "glob") {
      setExpression("src/**/*.tsx")
      setInput("src/App.tsx\nsrc/pages/Home.tsx\nsrc/styles/app.css\nREADME.md")
    }
    if (next === "regex") {
      setExpression("(?<protocol>https?)://(?<host>[^/\\s]+)")
      setInput("访问 https://github.com/haessen1998/Quick 或 https://go.dev")
      setFlags("gi")
      setReplacement("$<host>")
    }
  }

  const run = async (action = "run") => {
    setRunning(true)
    try {
      await registry.execute("validation", "run", {
        action,
        mode,
        expression,
        input,
        flags,
        replacement,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }
  const runTests = async () => {
    try {
      await registry.execute("validation", "run", {
        action: "test-cases",
        mode: "regex",
        expression,
        input,
        flags,
        testCases,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }
  const [replacementPreview, setReplacementPreview] = useDraftState("validation", "replacementPreview", "")
  const [highlighted, setHighlighted] = useState<{ value: string; match: boolean }[]>([])
  const previewAbort = useRef<AbortController | null>(null)
  const [previewRunning, setPreviewRunning] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const cancelPreview = () => {
    previewAbort.current?.abort()
    setPreviewRunning(false)
    setPreviewReady(false)
    setPreviewError("预览已取消")
  }
  useEffect(() => {
    const controller = new AbortController()
    previewAbort.current = controller
    setPreviewRunning(false)
    setHighlighted([])
    setPreviewReady(false)
    setPreviewError("")
    setReplacementPreview("")
    if (mode !== "regex") return () => controller.abort()
    const issue = checkInput({ format: "regex", input, expression, flags })
    if (issue) {
      setPreviewError(issue)
      return () => controller.abort()
    }
    setPreviewRunning(true)
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return
      void evaluateRegex<{
        segments: { value: string; match: boolean }[]
        replacement: string
      }>({ kind: "preview", expression, input, flags, replacement }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          setHighlighted(result.segments)
          setReplacementPreview(result.replacement)
          setPreviewReady(true)
        })
        .catch((error) => {
          if (!controller.signal.aborted && error.name !== "AbortError") {
            setHighlighted([])
            setPreviewError(error.message)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewRunning(false)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [expression, input, flags, replacement, mode])

  useAssistantCapability({
    page: "validation",
    getContext: () => ({
      mode,
      expression,
      flags: mode === "regex" ? flags : undefined,
      replacement: mode === "regex" ? replacement : undefined,
      input: input.slice(0, 8000),
      output: output.slice(0, 8000),
      error,
      testCases: mode === "regex" ? testCases.slice(0, 30) : undefined,
      testResults: mode === "regex" ? testResults.slice(0, 30) : undefined,
      generatedLanguage,
      hasGeneratedCode: Boolean(generatedCode),
    }),
    actions: {
      run: async (values, options) => {
        const action = String(values.action ?? "run")
        const nextMode = String(values.mode ?? "regex") as Mode
        if (!(["jsonpath", "json-schema", "xpath", "selector", "glob", "regex"] as string[]).includes(nextMode))
          throw new Error(`不支持的校验模式：${nextMode}`)
        const nextExpression = String(values.expression ?? expression)
        const nextInput = String(values.input ?? input)
        const nextFlags = cleanFlags(String(values.flags ?? "gi"))
        setMode(nextMode)
        setExpression(nextExpression)
        setInput(nextInput)
        setFlags(nextFlags)
        try {
          if (action === "test-cases") {
            if (nextMode !== "regex") throw new Error("批量测试用例当前只支持正则表达式")
            const cases = Array.isArray(values.testCases)
              ? values.testCases.slice(0, 100).map((item) => {
                  const value = item as Record<string, unknown>
                  return {
                    input: String(value.input ?? ""),
                    expected: Boolean(value.expected),
                    label: String(value.label ?? ""),
                  }
                })
              : []
            if (!cases.length) throw new Error("请提供至少一个测试用例")
            const results = await evaluateRegex<RegexTestResult[]>(
              {
                kind: "tests",
                expression: nextExpression,
                flags: nextFlags,
                input: "",
                cases,
              },
              options?.signal,
            )
            setTestCases(cases)
            setTestResults(results)
            setError("")
            return {
              success: results.every((item) => item.passed),
              action,
              passed: results.filter((item) => item.passed).length,
              total: results.length,
              results,
              executed: true,
            }
          }
          if (action === "show-code") {
            const language = String(values.language ?? "javascript")
            const code = String(values.code ?? "")
            if (!code.trim()) throw new Error("没有可显示的代码")
            setGeneratedLanguage(language)
            setGeneratedCode(code)
            setCodeExplanation(String(values.explanation ?? ""))
            setError("")
            return {
              success: true,
              action,
              language,
              codeLength: code.length,
              executed: true,
            }
          }
          if (action === "replace" && nextMode !== "regex") throw new Error("替换操作仅支持正则表达式")
          const result =
            action === "replace"
              ? await evaluateRegex<string>(
                  {
                    kind: "replace",
                    expression: nextExpression,
                    input: nextInput,
                    flags: nextFlags,
                    replacement: String(values.replacement ?? replacement),
                  },
                  options?.signal,
                )
              : await evaluate(nextMode, nextExpression, nextInput, nextFlags, options?.signal)
          setOutputKind(action === "replace" ? "replacement" : "matches")
          setHasOutput(true)
          setReplacement(String(values.replacement ?? replacement))
          setOutput(result)
          setError("")
          return {
            success: true,
            action,
            mode: nextMode,
            result,
            truncated: result.length > 16000,
            executed: true,
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setOutput("")
          setHasOutput(false)
          setError(message)
          return {
            success: false,
            action,
            mode: nextMode,
            error: message,
            executed: true,
          }
        }
      },
    },
  })

  const modes = [
    { id: "jsonpath" as const, label: "JSONPath", icon: Braces },
    { id: "json-schema" as const, label: "JSON Schema", icon: CheckCircle2 },
    { id: "xpath" as const, label: "XPath", icon: CodeXml },
    { id: "selector" as const, label: "CSS Selector", icon: Target },
    { id: "glob" as const, label: "Glob", icon: ListChecks },
    { id: "regex" as const, label: "正则表达式", icon: Regex },
  ]

  return {
    t,
    mode,
    expression,
    setExpression,
    input,
    setInput,
    flags,
    setFlags,
    replacement,
    setReplacement,
    output,
    outputKind,
    hasOutput,
    running,
    error,
    testCases,
    setTestCases,
    testResults,
    generatedLanguage,
    generatedCode,
    codeExplanation,
    selectMode,
    loadSample,
    run,
    runTests,
    replacementPreview,
    highlighted,
    previewRunning,
    previewReady,
    previewError,
    cancelPreview,
    modes,
  }
}

const ModelContext = createContext<ReturnType<typeof useValidationPageModel> | null>(null)
export function ValidationPageModelProvider(props: { children: ReactNode }) {
  const model = useValidationPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useValidationPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("ValidationPageModelProvider missing")
  return value
}

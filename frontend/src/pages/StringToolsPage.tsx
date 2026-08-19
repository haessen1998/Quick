import { useMemo, useState } from "react"
import {
  ArrowRightLeft,
  Braces,
  Check,
  Clipboard,
  Code2,
  Eraser,
  FileJson,
  Link,
  Play,
  Sparkles,
  TextQuote,
  TriangleAlert,
} from "lucide-react"
import { parseDocument } from "yaml"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ToolId =
  | "escape"
  | "unescape"
  | "json-format"
  | "json-minify"
  | "yaml-format"
  | "html-format"
  | "url-encode"
  | "url-decode"
  | "base64-encode"
  | "base64-decode"

type ToolDefinition = {
  id: ToolId
  label: string
  description: string
  icon: typeof TextQuote
  sample: string
  run: (input: string) => string | Promise<string>
}

function escapeString(input: string) {
  return JSON.stringify(input).slice(1, -1)
}

function unescapeString(input: string) {
  const trimmed = input.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed)
  }
  return JSON.parse(`"${input}"`)
}

function encodeBase64(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(input: string) {
  const binary = atob(input.replace(/\s/g, ""))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function formatHtml(input: string) {
  const [prettier, htmlPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/html"),
  ])
  return prettier.format(input, { parser: "html", plugins: [htmlPlugin], tabWidth: 2, printWidth: 100 })
}

const tools: ToolDefinition[] = [
  {
    id: "escape",
    label: "字符串转义",
    description: "生成 JSON/JavaScript 可用的转义字符串",
    icon: TextQuote,
    sample: "Hello\n你好 \"Quick\"",
    run: escapeString,
  },
  {
    id: "unescape",
    label: "字符串反转义",
    description: "还原换行、引号和 Unicode 转义",
    icon: TextQuote,
    sample: 'Hello\\n\\u4f60\\u597d \\"Quick\\"',
    run: unescapeString,
  },
  {
    id: "json-format",
    label: "JSON 格式化",
    description: "校验 JSON 并使用两个空格缩进",
    icon: FileJson,
    sample: '{"name":"Quick","features":["Wails","shadcn/ui"],"ready":true}',
    run: (input) => JSON.stringify(JSON.parse(input), null, 2),
  },
  {
    id: "json-minify",
    label: "JSON 压缩",
    description: "移除 JSON 中不必要的空白",
    icon: Braces,
    sample: '{\n  "name": "Quick",\n  "ready": true\n}',
    run: (input) => JSON.stringify(JSON.parse(input)),
  },
  {
    id: "yaml-format",
    label: "YAML 格式化",
    description: "校验并规范 YAML 缩进",
    icon: Code2,
    sample: "name: Quick\nfeatures:\n - Wails\n - shadcn/ui\nready: true",
    run: (input) => {
      const document = parseDocument(input)
      if (document.errors.length > 0) throw document.errors[0]
      return document.toString({ indent: 2, lineWidth: 0 })
    },
  },
  {
    id: "html-format",
    label: "HTML 格式化",
    description: "使用 Prettier 整理 HTML 结构",
    icon: Code2,
    sample: '<main><h1>Quick</h1><p>Wails + shadcn/ui</p><button type="button">Start</button></main>',
    run: formatHtml,
  },
  {
    id: "url-encode",
    label: "URL 编码",
    description: "使用 encodeURIComponent 编码文本",
    icon: Link,
    sample: "Quick 桌面应用?mode=dev&ready=true",
    run: encodeURIComponent,
  },
  {
    id: "url-decode",
    label: "URL 解码",
    description: "还原百分号编码的 URL 文本",
    icon: Link,
    sample: "Quick%20%E6%A1%8C%E9%9D%A2%E5%BA%94%E7%94%A8%3Fmode%3Ddev",
    run: decodeURIComponent,
  },
  {
    id: "base64-encode",
    label: "Base64 编码",
    description: "以 UTF-8 编码文本",
    icon: Braces,
    sample: "Quick 你好",
    run: encodeBase64,
  },
  {
    id: "base64-decode",
    label: "Base64 解码",
    description: "将 Base64 还原为 UTF-8 文本",
    icon: Braces,
    sample: "UXVpY2sg5L2g5aW9",
    run: decodeBase64,
  },
]

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function StringToolsPage() {
  const [activeToolId, setActiveToolId] = useState<ToolId>("escape")
  const [input, setInput] = useState(tools[0].sample)
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const activeTool = useMemo(() => tools.find((tool) => tool.id === activeToolId) ?? tools[0], [activeToolId])

  const selectTool = (tool: ToolDefinition) => {
    setActiveToolId(tool.id)
    setInput(tool.sample)
    setOutput("")
    setError("")
  }

  const processInput = async () => {
    setProcessing(true)
    setError("")
    try {
      const result = await activeTool.run(input)
      setOutput(result)
      toast.success(`${activeTool.label}完成`)
    } catch (caughtError) {
      const message = getErrorMessage(caughtError)
      setOutput("")
      setError(message)
      toast.error(`${activeTool.label}失败`, { description: message })
    } finally {
      setProcessing(false)
    }
  }

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      toast.success("结果已复制")
      window.setTimeout(() => setCopied(false), 1500)
    } catch (caughtError) {
      toast.error("复制失败", { description: getErrorMessage(caughtError) })
    }
  }

  const swapValues = () => {
    setInput(output)
    setOutput(input)
    setError("")
  }

  const clearValues = () => {
    setInput("")
    setOutput("")
    setError("")
  }

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            开发工具
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">字符串处理</h1>
          <p className="mt-2 text-sm text-muted-foreground">格式化、压缩、编码与转义常用文本格式。</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">处理类型</div>
            <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
              {tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={cn(
                      "app-interactive flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                      activeTool.id === tool.id && "bg-muted font-medium text-foreground",
                    )}
                    onClick={() => selectTool(tool)}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{tool.label}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{activeTool.label}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{activeTool.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={clearValues}>
                  <Eraser /> 清空
                </Button>
                <Button variant="outline" size="sm" disabled={!output} onClick={swapValues}>
                  <ArrowRightLeft /> 交换
                </Button>
                <Button size="sm" disabled={processing || !input} onClick={processInput}>
                  <Play /> {processing ? "处理中…" : "执行"}
                </Button>
              </div>
            </div>

            {error && (
              <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 break-words">
                  <div className="font-medium">处理失败</div>
                  <div className="mt-1 font-mono text-xs opacity-90">{error}</div>
                </div>
              </div>
            )}

            <div className="grid gap-0 md:grid-cols-2">
              <label className="min-w-0 border-b md:border-r md:border-b-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>输入</span>
                  <span>{input.length} 字符</span>
                </div>
                <textarea
                  className="app-interactive h-80 w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="在这里输入内容…"
                  spellCheck={false}
                />
              </label>

              <div className="min-w-0">
                <div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground">
                  <span>输出</span>
                  <Button variant="ghost" size="xs" disabled={!output} onClick={copyOutput}>
                    {copied ? <Check /> : <Clipboard />}
                    {copied ? "已复制" : "复制"}
                  </Button>
                </div>
                <textarea
                  className="app-interactive h-80 w-full resize-none overflow-auto bg-muted/20 p-4 font-mono text-sm leading-6 outline-none"
                  value={output}
                  readOnly
                  placeholder="处理结果会显示在这里…"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default StringToolsPage

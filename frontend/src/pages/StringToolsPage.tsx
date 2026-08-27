import { Braces, Code2, FileCode2, FileJson, FileType2 } from "lucide-react"
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser"
import { useMemo, useState } from "react"
import { parseDocument } from "yaml"

import { ToolWorkspace, type TextTool } from "@/components/ToolWorkspace"
import { Switch } from "@/components/ui/switch"

async function formatHtml(input: string) {
  const [prettier, htmlPlugin] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/html")])
  return prettier.format(input, { parser: "html", plugins: [htmlPlugin], tabWidth: 2, printWidth: 100 })
}

async function formatCss(input: string) {
  const [prettier, postcssPlugin] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/postcss")])
  return prettier.format(input, { parser: "css", plugins: [postcssPlugin], tabWidth: 2, printWidth: 100 })
}

async function formatJavaScript(input: string) {
  const [prettier, babelPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ])
  return prettier.format(input, { parser: "babel", plugins: [babelPlugin, estreePlugin], tabWidth: 2, semi: false })
}

function parseXml(input: string) {
  const validation = XMLValidator.validate(input)
  if (validation !== true) throw new Error(`${validation.err.msg}（第 ${validation.err.line} 行）`)
  return new XMLParser({ ignoreAttributes: false, preserveOrder: true, commentPropName: "#comment" }).parse(input)
}

function buildXml(input: string, format: boolean) {
  return new XMLBuilder({
    ignoreAttributes: false,
    preserveOrder: true,
    commentPropName: "#comment",
    format,
    indentBy: "  ",
    suppressEmptyNode: false,
  }).build(parseXml(input))
}

function minifyHtmlText(input: string) {
  return input
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim()
}

const jsonSample = '{"name":"Quick","features":["Wails","shadcn/ui"],"ready":true}'
const xmlSample = '<tool name="Quick"><runtime>Wails</runtime><ready>true</ready></tool>'
const htmlSample = '<main><h1>Quick</h1><p>Developer tools</p><button type="button">Start</button></main>'
const cssSample = '.card{display:grid;gap:12px;color:#111;background:#fff}.card:hover{transform:translateY(-2px)}'
const jsSample = 'const tools=["format","convert"];function ready(name){return `${name}: ${tools.join(", ")}`}'

function parseEmbeddedJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(parseEmbeddedJSON)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseEmbeddedJSON(item)]))
  }
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}")) && !(trimmed.startsWith("[") && trimmed.endsWith("]"))) return value
  try {
    return parseEmbeddedJSON(JSON.parse(trimmed))
  } catch {
    return value
  }
}

function createTools(formatEmbeddedJSON: boolean): TextTool[] {
  return [
  { id: "json-format", group: "JSON", label: "JSON 格式化", description: formatEmbeddedJSON ? "校验 JSON，并递归展开字符串中的 JSON 对象或数组" : "校验 JSON 并使用两个空格缩进", icon: FileJson, sample: jsonSample, run: (input) => { const parsed = JSON.parse(input); return JSON.stringify(formatEmbeddedJSON ? parseEmbeddedJSON(parsed) : parsed, null, 2) } },
  { id: "json-minify", group: "JSON", label: "JSON 压缩", description: "移除 JSON 中不必要的空白", icon: Braces, sample: JSON.stringify(JSON.parse(jsonSample), null, 2), run: (input) => JSON.stringify(JSON.parse(input)) },
  { id: "yaml-format", group: "YAML", label: "YAML 格式化", description: "校验并规范 YAML 缩进", icon: FileType2, sample: "name: Quick\nfeatures:\n  - Wails\n  - shadcn/ui\nready: true", run: (input) => { const document = parseDocument(input); if (document.errors.length) throw document.errors[0]; return document.toString({ indent: 2, lineWidth: 0 }) } },
  { id: "xml-format", group: "XML", label: "XML 格式化", description: "校验 XML 并整理元素缩进", icon: FileCode2, sample: xmlSample, run: (input) => buildXml(input, true) },
  { id: "xml-minify", group: "XML", label: "XML 压缩", description: "移除 XML 元素间不必要的空白", icon: FileCode2, sample: buildXml(xmlSample, true), run: (input) => buildXml(input, false) },
  { id: "html-format", group: "HTML", label: "HTML 格式化", description: "使用 Prettier 整理 HTML 结构", icon: Code2, sample: htmlSample, run: formatHtml },
  { id: "html-minify", group: "HTML", label: "HTML 压缩", description: "移除注释与标签间空白，不破坏文本内容", icon: Code2, sample: htmlSample, run: minifyHtmlText },
  { id: "css-format", group: "CSS", label: "CSS 格式化", description: "使用 Prettier 整理 CSS 规则", icon: FileCode2, sample: cssSample, run: formatCss },
  { id: "css-minify", group: "CSS", label: "CSS 压缩", description: "优化并压缩 CSS", icon: FileCode2, sample: cssSample, run: async (input) => { const { minify } = await import("csso"); return minify(input).css } },
  { id: "javascript-format", group: "JavaScript", label: "JavaScript 格式化", description: "使用 Babel 解析并格式化 JavaScript", icon: Code2, sample: jsSample, run: formatJavaScript },
  { id: "javascript-minify", group: "JavaScript", label: "JavaScript 压缩", description: "使用 Terser 压缩 JavaScript", icon: Code2, sample: jsSample, run: async (input) => { const { minify } = await import("terser"); const result = await minify(input); if (!result.code) throw new Error("未生成压缩结果"); return result.code } },
  ]
}

export default function StringToolsPage() {
  const [formatEmbeddedJSON, setFormatEmbeddedJSON] = useState(false)
  const tools = useMemo(() => createTools(formatEmbeddedJSON), [formatEmbeddedJSON])
  return (
    <ToolWorkspace
      title="字符串格式化"
      description="格式化、校验与压缩 JSON、YAML、XML、HTML、CSS 和 JavaScript。"
      tools={tools}
      assistantPage="formatter"
      activeToolOptions={{ "json-format": (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5 sm:max-w-md">
          <span className="min-w-0">
            <span className="block text-xs font-medium">展开嵌套 JSON 字符串</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">递归识别字符串中的 JSON 对象和数组，并转换为可缩进的结构。</span>
          </span>
          <Switch checked={formatEmbeddedJSON} onCheckedChange={setFormatEmbeddedJSON} aria-label="展开嵌套 JSON 字符串" />
        </label>
      ) }}
    />
  )
}

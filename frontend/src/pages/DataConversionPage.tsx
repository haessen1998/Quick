import { useMemo, useState } from "react"
import { ArrowLeftRight, Binary, Braces, CaseSensitive, CodeXml, Copy, Hash, Play, Sparkles, TextQuote } from "lucide-react"
import { camelCase, constantCase, dotCase, kebabCase, pascalCase, snakeCase } from "change-case"
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser"
import Papa from "papaparse"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { cn } from "@/lib/utils"

type Option = { id: string; label: string }
type ModuleId = "naming" | "standard" | "encoding" | "bytes" | "code" | "radix"
type ConversionModule = {
  id: ModuleId
  label: string
  description: string
  icon: typeof ArrowLeftRight
  sources: Option[]
  targets: Option[]
  defaultSource: string
  defaultTarget: string
  samples: Record<string, string>
  convert: (input: string, source: string, target: string) => string
}

function encodeBase64(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(input: string) {
  const binary = atob(input.replace(/\s/g, ""))
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

function escapeString(input: string) { return JSON.stringify(input).slice(1, -1) }

function unescapeString(input: string) {
  const trimmed = input.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed)
  let quoted = ""
  let precedingBackslashes = 0
  for (const character of input) {
    if (character === '"' && precedingBackslashes % 2 === 0) quoted += "\\"
    quoted += character
    precedingBackslashes = character === "\\" ? precedingBackslashes + 1 : 0
  }
  return JSON.parse(`"${quoted}"`)
}

function textToUnicode(input: string) {
  return Array.from(input).map((character) => {
    let encoded = ""
    for (let index = 0; index < character.length; index += 1) encoded += `\\u${character.charCodeAt(index).toString(16).padStart(4, "0")}`
    return encoded
  }).join("")
}

function unicodeToText(input: string) {
  let matched = false
  const decoded = input.replace(/\\u([0-9a-fA-F]{4})/g, (_escape, hex: string) => {
    matched = true
    return String.fromCharCode(Number.parseInt(hex, 16))
  })
  if (!matched) throw new Error("未找到有效的 \\uXXXX Unicode 转义")
  return decoded
}

function parseByteList(input: string, radix: number) {
  const tokens = input.trim().split(/[\s,;]+/).filter(Boolean)
  if (!tokens.length) throw new Error("请输入字节列表")
  return Uint8Array.from(tokens.map((token) => {
    const normalized = token.replace(/^0x/i, "")
    const pattern = radix === 16 ? /^[0-9a-fA-F]{1,2}$/ : /^\d{1,3}$/
    if (!pattern.test(normalized)) throw new Error(`无效字节：${token}`)
    const value = Number.parseInt(normalized, radix)
    if (value < 0 || value > 255) throw new Error(`字节超出 0–255：${token}`)
    return value
  }))
}

function jsonObject(input: string) {
  const value = JSON.parse(input)
  if (value === null || typeof value !== "object") throw new Error("请输入 JSON 对象或数组")
  return value
}

function xmlToObject(input: string) {
  const validation = XMLValidator.validate(input)
  if (validation !== true) throw new Error(validation.err.msg)
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(input)
}

function parseStandard(input: string, source: string) {
  if (source === "json") return JSON.parse(input)
  if (source === "yaml") return parseYaml(input)
  if (source === "xml") return xmlToObject(input)
  if (source === "toml") return parseToml(input)
  const result = Papa.parse(input, { header: true, dynamicTyping: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(result.errors[0].message)
  return result.data
}

function stringifyStandard(value: unknown, target: string) {
  if (target === "json") return JSON.stringify(value, null, 2)
  if (target === "yaml") return stringifyYaml(value, { indent: 2, lineWidth: 0 })
  if (target === "xml") return new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true }).build(value)
  if (target === "toml") return stringifyToml(value as Record<string, unknown>)
  return Papa.unparse(Array.isArray(value) ? value : [value])
}

type CodeLanguage = "csharp" | "java" | "go"

function valueType(value: unknown, language: CodeLanguage): string {
  if (Array.isArray(value)) {
    const child = value.length ? valueType(value[0], language) : (language === "go" ? "any" : "Object")
    return language === "go" ? `[]${child}` : `List<${child}>`
  }
  if (value === null) return language === "go" ? "any" : "Object"
  if (typeof value === "string") return language === "java" ? "String" : "string"
  if (typeof value === "boolean") return language === "java" ? "boolean" : "bool"
  if (typeof value === "number") return Number.isInteger(value) ? (language === "go" ? "int64" : "long") : (language === "go" ? "float64" : "double")
  return language === "go" ? "map[string]any" : "Object"
}

function generateModel(input: string, language: CodeLanguage) {
  const parsed = jsonObject(input)
  const root = Array.isArray(parsed) ? parsed[0] : parsed
  if (!root || Array.isArray(root) || typeof root !== "object") throw new Error("代码生成需要 JSON 对象，数组中至少需要一个对象")
  const entries = Object.entries(root)
  if (language === "csharp") return `using System.Collections.Generic;\n\npublic class Root\n{\n${entries.map(([key, value]) => `    public ${valueType(value, language)} ${pascalCase(key)} { get; set; }`).join("\n")}\n}`
  if (language === "java") return `import java.util.List;\n\npublic class Root {\n${entries.map(([key, value]) => `    public ${valueType(value, language)} ${camelCase(key)};`).join("\n")}\n}`
  return `type Root struct {\n${entries.map(([key, value]) => `\t${pascalCase(key)} ${valueType(value, language)} \`json:"${key}"\``).join("\n")}\n}`
}

function radixConvert(input: string, source: string, target: string) {
  const from = Number(source)
  const to = Number(target)
  const cleaned = input.trim().replace(/_/g, "").replace(/^([-+])?0[bBoOxX]/, "$1")
  const negative = cleaned.startsWith("-")
  const digits = cleaned.replace(/^[-+]/, "")
  const valid = from === 2 ? /^[01]+$/ : from === 8 ? /^[0-7]+$/ : from === 10 ? /^\d+$/ : /^[0-9a-fA-F]+$/
  if (!valid.test(digits)) throw new Error(`输入不是有效的 ${from} 进制整数`)
  let value = 0n
  for (const digit of digits.toLowerCase()) value = value * BigInt(from) + BigInt(Number.parseInt(digit, 16))
  return `${negative ? "-" : ""}${value.toString(to).toUpperCase()}`
}

const namingTargets = [
  { id: "upper", label: "UPPER CASE" }, { id: "lower", label: "lower case" }, { id: "camel", label: "camelCase" },
  { id: "pascal", label: "PascalCase" }, { id: "snake", label: "snake_case" }, { id: "kebab", label: "kebab-case" },
  { id: "constant", label: "CONSTANT_CASE" }, { id: "dot", label: "dot.case" },
]
const dataFormats = [{ id: "json", label: "JSON" }, { id: "yaml", label: "YAML" }, { id: "xml", label: "XML" }, { id: "csv", label: "CSV" }, { id: "toml", label: "TOML" }]
const encodingFormats = [{ id: "text", label: "普通文本" }, { id: "escaped", label: "转义文本" }, { id: "url", label: "URL 编码" }, { id: "base64", label: "Base64" }, { id: "unicode", label: "Unicode" }]
const byteFormats = [{ id: "text", label: "UTF-8 文本" }, { id: "hex", label: "Hex 字节" }, { id: "ascii", label: "ASCII 码" }, { id: "utf8", label: "UTF-8 字节" }]
const radixFormats = [{ id: "2", label: "二进制" }, { id: "8", label: "八进制" }, { id: "10", label: "十进制" }, { id: "16", label: "十六进制" }]

const modules: ConversionModule[] = [
  {
    id: "naming", label: "大小写与命名", description: "将普通文本转换为常见命名风格", icon: CaseSensitive,
    sources: [{ id: "text", label: "自动识别文本" }], targets: namingTargets, defaultSource: "text", defaultTarget: "camel", samples: { text: "Quick developer tools" },
    convert: (input, _source, target) => ({ upper: (value: string) => value.toUpperCase(), lower: (value: string) => value.toLowerCase(), camel: camelCase, pascal: pascalCase, snake: snakeCase, kebab: kebabCase, constant: constantCase, dot: dotCase }[target]?.(input) ?? input),
  },
  {
    id: "standard", label: "标准数据格式", description: "JSON、YAML、XML、CSV 与 TOML 双向转换", icon: Braces,
    sources: dataFormats, targets: dataFormats, defaultSource: "json", defaultTarget: "yaml",
    samples: { json: '{"name":"Quick","ready":true}', yaml: "name: Quick\nready: true", xml: '<tool name="Quick"><ready>true</ready></tool>', csv: "name,ready\nQuick,true", toml: 'name = "Quick"\nready = true' },
    convert: (input, source, target) => stringifyStandard(parseStandard(input, source), target),
  },
  {
    id: "encoding", label: "字符串编码", description: "转义、URL、Base64 与 Unicode 双向转换", icon: TextQuote,
    sources: encodingFormats, targets: encodingFormats, defaultSource: "text", defaultTarget: "base64",
    samples: { text: "Quick 你好", escaped: 'Hello\\n\\u4f60\\u597d \\"Quick\\"', url: "Quick%20%E4%BD%A0%E5%A5%BD", base64: "UXVpY2sg5L2g5aW9", unicode: "Quick：\\u4f60\\u597d，状态：\\u2705，出发：\\ud83d\\ude80" },
    convert: (input, source, target) => {
      const text = source === "text" ? input : source === "escaped" ? unescapeString(input) : source === "url" ? decodeURIComponent(input) : source === "base64" ? decodeBase64(input) : unicodeToText(input)
      return target === "text" ? text : target === "escaped" ? escapeString(text) : target === "url" ? encodeURIComponent(text) : target === "base64" ? encodeBase64(text) : textToUnicode(text)
    },
  },
  {
    id: "bytes", label: "文本与字节", description: "Hex、ASCII 与 UTF-8 字节互转", icon: Binary,
    sources: byteFormats, targets: byteFormats, defaultSource: "text", defaultTarget: "hex",
    samples: { text: "Quick 你好", hex: "51 75 69 63 6b 20 e4 bd a0 e5 a5 bd", ascii: "81 117 105 99 107", utf8: "81 117 105 99 107 32 228 189 160 229 165 189" },
    convert: (input, source, target) => {
      const bytes = source === "text" ? new TextEncoder().encode(input) : parseByteList(input, source === "hex" ? 16 : 10)
      if (source === "ascii" && Array.from(bytes).some((byte) => byte > 127)) throw new Error("ASCII 仅支持 0–127")
      if (target === "text") return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      if (target === "hex") return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ")
      if (target === "ascii" && Array.from(bytes).some((byte) => byte > 127)) throw new Error("这些字节不能表示为 ASCII")
      return Array.from(bytes).join(" ")
    },
  },
  {
    id: "code", label: "代码模型生成", description: "从 JSON 对象生成强类型模型", icon: CodeXml,
    sources: [{ id: "json", label: "JSON" }], targets: [{ id: "csharp", label: "C# Class" }, { id: "java", label: "Java Class" }, { id: "go", label: "Go Struct" }], defaultSource: "json", defaultTarget: "csharp",
    samples: { json: '{"name":"Quick","version":1,"ready":true,"tags":["Wails","React"]}' }, convert: (input, _source, target) => generateModel(input, target as CodeLanguage),
  },
  {
    id: "radix", label: "进制转换", description: "二、八、十、十六进制整数互转", icon: Hash,
    sources: radixFormats, targets: radixFormats, defaultSource: "10", defaultTarget: "16", samples: { "2": "11111111", "8": "377", "10": "255", "16": "FF" }, convert: radixConvert,
  },
]

function RadioGroup({ legend, name, options, value, disabledValue, onChange }: { legend: string; name: string; options: Option[]; value: string; disabledValue?: string; onChange: (value: string) => void }) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-xs font-medium text-muted-foreground">{legend}</legend><div className="flex flex-wrap gap-2">{options.map((option) => <label key={option.id} className={cn("app-interactive flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted", value === option.id && "border-primary bg-primary/8 text-primary", disabledValue === option.id && "cursor-not-allowed opacity-40")}><input type="radio" name={name} value={option.id} checked={value === option.id} disabled={disabledValue === option.id} onChange={() => onChange(option.id)} className="size-3.5 accent-primary" />{option.label}</label>)}</div></fieldset>
}

export default function DataConversionPage() {
  const [moduleId, setModuleId] = useState<ModuleId>("standard")
  const module = useMemo(() => modules.find((item) => item.id === moduleId)!, [moduleId])
  const [source, setSource] = useState("json")
  const [target, setTarget] = useState("yaml")
  const [input, setInput] = useState('{"name":"Quick","ready":true}')
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")

  const chooseModule = (next: ConversionModule) => { setModuleId(next.id); setSource(next.defaultSource); setTarget(next.defaultTarget); setInput(next.samples[next.defaultSource] ?? ""); setOutput(""); setError("") }
  const chooseSource = (next: string) => {
    setSource(next); setInput(module.samples[next] ?? ""); setOutput(""); setError("")
    if (next === target && module.targets.some((option) => option.id === next)) setTarget(module.targets.find((option) => option.id !== next)?.id ?? target)
  }
  const run = () => { try { setOutput(module.convert(input, source, target)); setError("") } catch (caught) { setOutput(""); setError(caught instanceof Error ? caught.message : String(caught)) } }
  const swappable = module.sources.some((option) => option.id === target) && module.targets.some((option) => option.id === source)
  const swap = () => { if (swappable) { setSource(target); setTarget(source); setInput(output || module.samples[target] || ""); setOutput(input); setError("") } }

  useAssistantCapability({
    page: "converter",
    getContext: () => ({ module: moduleId, source, target, input: input.slice(0, 8000), output: output.slice(0, 8000), error }),
    actions: {
      convert: (values) => {
        const nextModule = modules.find((item) => item.id === String(values.module ?? ""))
        if (!nextModule) throw new Error(`未知转换模块：${String(values.module ?? "")}`)
        const nextSource = String(values.source ?? "")
        const nextTarget = String(values.target ?? "")
        if (!nextModule.sources.some((item) => item.id === nextSource)) throw new Error(`${nextModule.label} 不支持来源 ${nextSource}`)
        if (!nextModule.targets.some((item) => item.id === nextTarget)) throw new Error(`${nextModule.label} 不支持目标 ${nextTarget}`)
        if (nextSource === nextTarget) throw new Error("来源与目标不能相同")
        const nextInput = String(values.input ?? "")
        setModuleId(nextModule.id); setSource(nextSource); setTarget(nextTarget); setInput(nextInput)
        try {
          const result = nextModule.convert(nextInput, nextSource, nextTarget)
          setOutput(result); setError("")
          toast.success(`小Q已完成：${nextModule.label}`)
          return { success: true, module: nextModule.id, source: nextSource, target: nextTarget, result: result.slice(0, 16000), truncated: result.length > 16000, executed: true }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setOutput(""); setError(message)
          return { success: false, module: nextModule.id, error: message, executed: true }
        }
      },
    },
  })

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">数据转换</h1><p className="mt-2 text-sm text-muted-foreground">选择模块，再指定来源与目标；输入输出区域保持一致。</p></div>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{modules.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => chooseModule(item)} className={cn("app-interactive flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted", moduleId === item.id && "border-primary bg-primary/8 ring-1 ring-primary")}><Icon className="size-4 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.label}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.description}</span></span></button> })}</div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid gap-5 border-b p-4 lg:grid-cols-2"><RadioGroup legend="来源" name={`${module.id}-source`} options={module.sources} value={source} disabledValue={module.sources.length > 1 ? target : undefined} onChange={chooseSource} /><RadioGroup legend="目标" name={`${module.id}-target`} options={module.targets} value={target} disabledValue={module.targets.some((option) => option.id === source) ? source : undefined} onChange={(next) => { setTarget(next); setOutput(""); setError("") }} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><div className="text-sm font-medium">{module.label}</div><div className="text-xs text-muted-foreground">{module.description}</div></div><div className="flex gap-2"><Button variant="outline" disabled={!swappable} onClick={swap}><ArrowLeftRight />交换</Button><Button onClick={run} disabled={!input}><Play />执行转换</Button></div></div>
          {error && <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="grid lg:grid-cols-2"><label className="border-b lg:border-r lg:border-b-0"><div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground"><span>输入 · {module.sources.find((option) => option.id === source)?.label}</span><span>{input.length} 字符</span></div><textarea className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 outline-none" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></label><div><div className="flex h-10 items-center justify-between border-b px-4 text-xs text-muted-foreground"><span>输出 · {module.targets.find((option) => option.id === target)?.label}</span><Button variant="ghost" size="xs" disabled={!output} onClick={async () => { await navigator.clipboard.writeText(output); toast.success("已复制") }}><Copy />复制</Button></div><textarea className="app-interactive h-[28rem] w-full resize-none overflow-auto bg-muted/20 p-4 font-mono text-sm leading-6 outline-none" readOnly value={output} placeholder="转换结果会显示在这里…" /></div></div>
        </div>
      </div>
    </section>
  )
}

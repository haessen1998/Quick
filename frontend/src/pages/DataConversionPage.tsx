import { Binary, Braces, CaseSensitive, CodeXml, FileJson, Hash, Link, TextQuote } from "lucide-react"
import { camelCase, constantCase, dotCase, kebabCase, pascalCase, snakeCase } from "change-case"
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser"
import Papa from "papaparse"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { ToolWorkspace, type TextTool } from "@/components/ToolWorkspace"

function encodeBase64(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(input: string) {
  const binary = atob(input.replace(/\s/g, ""))
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

function escapeString(input: string) {
  return JSON.stringify(input).slice(1, -1)
}

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
  if (!/^(?:\\u[0-9a-fA-F]{4}|\s)+$/.test(input.trim())) throw new Error("请输入由 \\uXXXX 组成的 Unicode 转义文本")
  return JSON.parse(`"${input.replace(/\s+/g, "")}"`)
}

function parseByteList(input: string, radix: number) {
  const tokens = input.trim().split(/[\s,;]+/).filter(Boolean)
  if (!tokens.length) throw new Error("请输入字节列表")
  return Uint8Array.from(tokens.map((token) => {
    const normalized = token.replace(/^0x/i, "")
    if (!new RegExp(radix === 16 ? "^[0-9a-fA-F]{1,2}$" : "^\\d{1,3}$").test(normalized)) throw new Error(`无效字节：${token}`)
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

type CodeLanguage = "csharp" | "java" | "go"

function valueType(value: unknown, language: CodeLanguage): string {
  if (Array.isArray(value)) {
    const child = value.length ? valueType(value[0], language) : (language === "go" ? "any" : "Object")
    if (language === "csharp") return `List<${child}>`
    if (language === "java") return `List<${child}>`
    return `[]${child}`
  }
  if (value === null) return language === "go" ? "any" : "Object"
  if (typeof value === "string") return language === "java" ? "String" : "string"
  if (typeof value === "boolean") return language === "java" ? "boolean" : "bool"
  if (typeof value === "number") return Number.isInteger(value) ? (language === "java" ? "long" : language === "go" ? "int64" : "long") : (language === "go" ? "float64" : "double")
  return language === "go" ? "map[string]any" : "Object"
}

function generateModel(input: string, language: CodeLanguage) {
  const parsed = jsonObject(input)
  const root = Array.isArray(parsed) ? parsed[0] : parsed
  if (!root || Array.isArray(root) || typeof root !== "object") throw new Error("代码生成需要 JSON 对象，数组中至少需要一个对象")
  const entries = Object.entries(root)
  if (language === "csharp") {
    return `using System.Collections.Generic;\n\npublic class Root\n{\n${entries.map(([key, value]) => `    public ${valueType(value, language)} ${pascalCase(key)} { get; set; }`).join("\n")}\n}`
  }
  if (language === "java") {
    return `import java.util.List;\n\npublic class Root {\n${entries.map(([key, value]) => `    public ${valueType(value, language)} ${camelCase(key)};`).join("\n")}\n}`
  }
  return `type Root struct {\n${entries.map(([key, value]) => `\t${pascalCase(key)} ${valueType(value, language)} \`json:"${key}"\``).join("\n")}\n}`
}

function radixConvert(input: string, from: number, to: number) {
  const cleaned = input.trim().replace(/_/g, "").replace(/^([-+])?0[bBoOxX]/, "$1")
  const negative = cleaned.startsWith("-")
  const digits = cleaned.replace(/^[-+]/, "")
  const valid = from === 2 ? /^[01]+$/ : from === 8 ? /^[0-7]+$/ : from === 10 ? /^\d+$/ : /^[0-9a-fA-F]+$/
  if (!valid.test(digits)) throw new Error(`输入不是有效的 ${from} 进制整数`)
  let value = 0n
  for (const digit of digits.toLowerCase()) value = value * BigInt(from) + BigInt(Number.parseInt(digit, 16))
  return `${negative ? "-" : ""}${value.toString(to).toUpperCase()}`
}

const jsonSample = '{"name":"Quick","version":1,"ready":true,"tags":["Wails","React"]}'
const tools: TextTool[] = [
  { id: "upper", group: "大小写与命名", label: "转大写", description: "将文本转换为大写", icon: CaseSensitive, sample: "Quick developer tools", run: (input) => input.toUpperCase() },
  { id: "lower", group: "大小写与命名", label: "转小写", description: "将文本转换为小写", icon: CaseSensitive, sample: "Quick Developer Tools", run: (input) => input.toLowerCase() },
  { id: "camel", group: "大小写与命名", label: "camelCase", description: "转换为小驼峰命名", icon: CaseSensitive, sample: "quick developer tools", run: camelCase },
  { id: "pascal", group: "大小写与命名", label: "PascalCase", description: "转换为大驼峰命名", icon: CaseSensitive, sample: "quick developer tools", run: pascalCase },
  { id: "snake", group: "大小写与命名", label: "snake_case", description: "转换为下划线命名", icon: CaseSensitive, sample: "QuickDeveloperTools", run: snakeCase },
  { id: "kebab", group: "大小写与命名", label: "kebab-case", description: "转换为短横线命名", icon: CaseSensitive, sample: "QuickDeveloperTools", run: kebabCase },
  { id: "constant", group: "大小写与命名", label: "CONSTANT_CASE", description: "转换为常量命名", icon: CaseSensitive, sample: "Quick developer tools", run: constantCase },
  { id: "dot", group: "大小写与命名", label: "dot.case", description: "转换为点分隔命名", icon: CaseSensitive, sample: "Quick developer tools", run: dotCase },

  { id: "json-yaml", group: "标准格式", label: "JSON → YAML", description: "将 JSON 转换为 YAML", icon: FileJson, sample: jsonSample, run: (input) => stringifyYaml(jsonObject(input), { indent: 2, lineWidth: 0 }) },
  { id: "yaml-json", group: "标准格式", label: "YAML → JSON", description: "将 YAML 转换为 JSON", icon: FileJson, sample: "name: Quick\nversion: 1\nready: true", run: (input) => JSON.stringify(parseYaml(input), null, 2) },
  { id: "json-xml", group: "标准格式", label: "JSON → XML", description: "将 JSON 对象转换为 XML", icon: CodeXml, sample: '{"tool":{"name":"Quick","ready":true}}', run: (input) => new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true }).build(jsonObject(input)) },
  { id: "xml-json", group: "标准格式", label: "XML → JSON", description: "保留 XML 属性并转换为 JSON", icon: CodeXml, sample: '<tool name="Quick"><ready>true</ready></tool>', run: (input) => JSON.stringify(xmlToObject(input), null, 2) },
  { id: "json-csv", group: "标准格式", label: "JSON → CSV", description: "将 JSON 对象数组转换为 CSV", icon: Braces, sample: '[{"name":"Quick","ready":true},{"name":"Demo","ready":false}]', run: (input) => { const value = JSON.parse(input); if (!Array.isArray(value)) throw new Error("JSON → CSV 需要对象数组"); return Papa.unparse(value) } },
  { id: "csv-json", group: "标准格式", label: "CSV → JSON", description: "按首行字段名转换 CSV", icon: Braces, sample: "name,ready\nQuick,true\nDemo,false", run: (input) => { const result = Papa.parse(input, { header: true, dynamicTyping: true, skipEmptyLines: true }); if (result.errors.length) throw new Error(result.errors[0].message); return JSON.stringify(result.data, null, 2) } },
  { id: "json-toml", group: "标准格式", label: "JSON → TOML", description: "将 JSON 对象转换为 TOML", icon: Braces, sample: jsonSample, run: (input) => stringifyToml(jsonObject(input)) },
  { id: "toml-json", group: "标准格式", label: "TOML → JSON", description: "将 TOML 转换为 JSON", icon: Braces, sample: 'name = "Quick"\nversion = 1\nready = true', run: (input) => JSON.stringify(parseToml(input), null, 2) },

  { id: "escape", group: "字符串编码", label: "字符串转义", description: "生成 JSON/JavaScript 可用的转义字符串", icon: TextQuote, sample: 'Hello\n你好 "Quick"', run: escapeString },
  { id: "unescape", group: "字符串编码", label: "字符串反转义", description: "还原换行、引号和 Unicode 转义", icon: TextQuote, sample: 'Hello\\n\\u4f60\\u597d \\"Quick\\"', run: unescapeString },
  { id: "url-encode", group: "字符串编码", label: "URL 编码", description: "使用 UTF-8 百分号编码", icon: Link, sample: "Quick 桌面应用?mode=dev&ready=true", run: encodeURIComponent },
  { id: "url-decode", group: "字符串编码", label: "URL 解码", description: "还原百分号编码文本", icon: Link, sample: "Quick%20%E6%A1%8C%E9%9D%A2%E5%BA%94%E7%94%A8", run: decodeURIComponent },
  { id: "base64-encode", group: "字符串编码", label: "Base64 编码", description: "以 UTF-8 编码文本", icon: Braces, sample: "Quick 你好", run: encodeBase64 },
  { id: "base64-decode", group: "字符串编码", label: "Base64 解码", description: "将 Base64 还原为 UTF-8", icon: Braces, sample: "UXVpY2sg5L2g5aW9", run: decodeBase64 },
  { id: "unicode-encode", group: "字符串编码", label: "文本 → Unicode", description: "转换为 \\uXXXX 序列", icon: TextQuote, sample: "Quick 你好 😀", run: textToUnicode },
  { id: "unicode-decode", group: "字符串编码", label: "Unicode → 文本", description: "还原 \\uXXXX 序列", icon: TextQuote, sample: "\\u0051\\u0075\\u0069\\u0063\\u006b\\u0020\\u4f60\\u597d", run: unicodeToText },
  { id: "text-hex", group: "字节互转", label: "文本 → Hex", description: "输出 UTF-8 十六进制字节", icon: Binary, sample: "Quick 你好", run: (input) => Array.from(new TextEncoder().encode(input), (byte) => byte.toString(16).padStart(2, "0")).join(" ") },
  { id: "hex-text", group: "字节互转", label: "Hex → 文本", description: "将十六进制字节解码为 UTF-8", icon: Binary, sample: "51 75 69 63 6b 20 e4 bd a0 e5 a5 bd", run: (input) => new TextDecoder("utf-8", { fatal: true }).decode(parseByteList(input, 16)) },
  { id: "text-ascii", group: "字节互转", label: "文本 → ASCII", description: "输出 ASCII 十进制码", icon: Binary, sample: "Quick", run: (input) => { if ([...input].some((character) => character.codePointAt(0)! > 127)) throw new Error("ASCII 仅支持 0–127 字符"); return [...input].map((character) => character.charCodeAt(0)).join(" ") } },
  { id: "ascii-text", group: "字节互转", label: "ASCII → 文本", description: "将十进制 ASCII 码还原为文本", icon: Binary, sample: "81 117 105 99 107", run: (input) => String.fromCharCode(...parseByteList(input, 10)) },
  { id: "text-utf8", group: "字节互转", label: "文本 → UTF-8 字节", description: "输出 UTF-8 十进制字节", icon: Binary, sample: "Quick 你好", run: (input) => Array.from(new TextEncoder().encode(input)).join(" ") },
  { id: "utf8-text", group: "字节互转", label: "UTF-8 字节 → 文本", description: "将十进制字节还原为文本", icon: Binary, sample: "81 117 105 99 107 32 228 189 160 229 165 189", run: (input) => new TextDecoder("utf-8", { fatal: true }).decode(parseByteList(input, 10)) },

  { id: "json-csharp", group: "代码生成", label: "JSON → C# Class", description: "根据顶层 JSON 对象生成 C# 类", icon: CodeXml, sample: jsonSample, run: (input) => generateModel(input, "csharp") },
  { id: "json-java", group: "代码生成", label: "JSON → Java Class", description: "根据顶层 JSON 对象生成 Java 类", icon: CodeXml, sample: jsonSample, run: (input) => generateModel(input, "java") },
  { id: "json-go", group: "代码生成", label: "JSON → Go Struct", description: "根据顶层 JSON 对象生成 Go 结构体", icon: CodeXml, sample: jsonSample, run: (input) => generateModel(input, "go") },
]

const radixNames: Record<number, string> = { 2: "二进制", 8: "八进制", 10: "十进制", 16: "十六进制" }
for (const from of [2, 8, 10, 16]) {
  for (const to of [2, 8, 10, 16]) {
    if (from === to) continue
    tools.push({
      id: `radix-${from}-${to}`,
      group: "进制转换",
      label: `${radixNames[from]} → ${radixNames[to]}`,
      description: `任意长度整数的 ${from} 进制到 ${to} 进制转换`,
      icon: Hash,
      sample: from === 2 ? "11111111" : from === 8 ? "377" : from === 10 ? "255" : "FF",
      run: (input) => radixConvert(input, from, to),
    })
  }
}

export default function DataConversionPage() {
  return <ToolWorkspace title="数据转换" description="命名风格、标准数据格式、编码、字节、Unicode、代码模型与进制互转。" tools={tools} />
}

import { useMemo, useState } from "react"
import { Activity, Braces, Copy, Globe2, Network, Play, Power, Router, Search, Sparkles, TerminalSquare } from "lucide-react"
import { toast } from "sonner"

import { NetworkService } from "../../bindings/changeme"
import { Button } from "@/components/ui/button"
import type { ProxySettings } from "@/lib/proxy"

type Mode = "ping" | "dns" | "port" | "cidr" | "http" | "process"
type NetworkResult = { success: boolean; output: string; durationMs: number }
type HTTPResult = { success: boolean; status: string; statusCode: number; headers: Record<string, string[]>; body: string; durationMs: number }
type ProcessInfo = { pid: number; name: string; ports: number[] }
type ProcessResult = { success: boolean; processes: ProcessInfo[]; output: string }
type HTTPRequest = { method: string; url: string; headers: string; body: string }

const inputClass = "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

function calculateCIDR(input: string) {
  const [address, prefixText] = input.trim().split("/")
  const octets = address?.split(".").map(Number)
  const prefix = Number(prefixText)
  if (!octets || octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255) || prefix < 0 || prefix > 32) throw new Error("请输入有效的 IPv4 CIDR，例如 192.168.1.10/24")
  const ip = octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const format = (value: number) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".")
  const total = 2 ** (32 - prefix)
  return `网络地址：${format(network)}\n广播地址：${format(broadcast)}\n子网掩码：${format(mask)}\n地址数量：${total}\n可用主机范围：${total > 2 ? `${format(network + 1)} – ${format(broadcast - 1)}` : "无传统主机范围"}`
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function httpToCurl(request: HTTPRequest) {
  const parts = ["curl", "-X", request.method.toUpperCase(), shellQuote(request.url)]
  for (const line of request.headers.split("\n").map((value) => value.trim()).filter(Boolean)) parts.push("-H", shellQuote(line))
  if (request.body) parts.push("--data-raw", shellQuote(request.body))
  return parts.join(" ")
}

function tokenizeCurl(command: string) {
  command = command.replace(/(?:\\|\^|`)\r?\n/g, " ")
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const character of command.trim()) {
    if (escaped) { current += character; escaped = false; continue }
    if (character === "\\" && quote !== "'") { escaped = true; continue }
    if (quote) { if (character === quote) quote = null; else current += character; continue }
    if (character === "'" || character === '"') { quote = character; continue }
    if (/\s/.test(character)) { if (current) { tokens.push(current); current = "" }; continue }
    current += character
  }
  if (quote) throw new Error("cURL 命令存在未闭合的引号")
  if (escaped) current += "\\"
  if (current) tokens.push(current)
  return tokens
}

function curlToHTTP(command: string): HTTPRequest {
  const tokens = tokenizeCurl(command)
  if (tokens[0]?.toLowerCase().endsWith("curl") || tokens[0]?.toLowerCase().endsWith("curl.exe")) tokens.shift()
  let method = "GET"
  let methodExplicit = false
  let url = ""
  const headers: string[] = []
  const bodies: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => { const value = tokens[++index]; if (value === undefined) throw new Error(`${token} 缺少参数`); return value }
    if (token === "-X" || token === "--request") { method = next().toUpperCase(); methodExplicit = true; continue }
    if (token.startsWith("-X") && token.length > 2) { method = token.slice(2).toUpperCase(); methodExplicit = true; continue }
    if (token === "-H" || token === "--header") { headers.push(next()); continue }
    if (token.startsWith("-H") && token.length > 2) { headers.push(token.slice(2)); continue }
    if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"].includes(token)) { bodies.push(next()); continue }
    if (token === "--url") { url = next(); continue }
    if (token === "-I" || token === "--head") { method = "HEAD"; methodExplicit = true; continue }
    if (token === "-G" || token === "--get") { method = "GET"; methodExplicit = true; continue }
    if (["-k", "--insecure", "--compressed", "-s", "--silent", "-L", "--location"].includes(token)) continue
    if (token === "-u" || token === "--user") { headers.push(`Authorization: Basic ${btoa(next())}`); continue }
    if (/^https?:\/\//i.test(token)) { url = token; continue }
    if (token.startsWith("-")) throw new Error(`暂不支持 cURL 参数：${token}`)
    if (!url) url = token
  }
  if (!url) throw new Error("cURL 命令中没有 HTTP/HTTPS URL")
  if (bodies.length && !methodExplicit) method = "POST"
  return { method, url, headers: headers.join("\n"), body: bodies.join("&") }
}

export default function NetworkPage({ proxy }: { proxy: ProxySettings }) {
  const [mode, setMode] = useState<Mode>("ping")
  const [host, setHost] = useState("github.com")
  const [port, setPort] = useState(443)
  const [recordType, setRecordType] = useState("A")
  const [cidr, setCIDR] = useState("192.168.1.10/24")
  const [method, setMethod] = useState("GET")
  const [url, setURL] = useState("https://api.github.com/repos/haessen1998/Quick")
  const [headers, setHeaders] = useState("Accept: application/vnd.github+json")
  const [body, setBody] = useState("")
  const [curl, setCurl] = useState("")
  const [processSearchType, setProcessSearchType] = useState<"port" | "pid" | "name">("port")
  const [processQuery, setProcessQuery] = useState("8080")
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [output, setOutput] = useState("")
  const [running, setRunning] = useState(false)
  const curlPreview = useMemo(() => httpToCurl({ method, url, headers, body }), [method, url, headers, body])

  const executeHTTP = async (request: HTTPRequest) => {
    const result = await NetworkService.HTTPRequest(request.method, request.url, request.headers, request.body, proxy.mode, proxy.url, 15000) as unknown as HTTPResult
    setOutput(`${result.status || "请求失败"} · ${result.durationMs} ms\n\n${JSON.stringify(result.headers, null, 2)}\n\n${result.body}`)
    if (!result.success) toast.error("HTTP 请求失败")
  }

  const run = async () => {
    setRunning(true); setOutput("")
    try {
      if (mode === "cidr") { setOutput(calculateCIDR(cidr)); return }
      if (mode === "http") { await executeHTTP({ method, url, headers, body }); return }
      const result = mode === "ping"
        ? await NetworkService.Ping(host, 5000) as unknown as NetworkResult
        : mode === "dns"
          ? await NetworkService.DNSQuery(host, recordType, 5000) as unknown as NetworkResult
          : await NetworkService.CheckPort(host, port, 5000) as unknown as NetworkResult
      setOutput(`${result.success ? "成功" : "失败"} · ${result.durationMs} ms\n\n${result.output}`)
    } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); setOutput(message); toast.error("网络操作失败", { description: message }) } finally { setRunning(false) }
  }

  const importCurl = async (execute: boolean) => {
    try {
      const request = curlToHTTP(curl)
      setMethod(request.method); setURL(request.url); setHeaders(request.headers); setBody(request.body)
      toast.success("cURL 已转换为 HTTP 请求")
      if (execute) { setRunning(true); await executeHTTP(request) }
    } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); setOutput(message); toast.error("cURL 解析失败", { description: message }) } finally { setRunning(false) }
  }

  const findProcesses = async () => {
    setRunning(true)
    try {
      const result = await NetworkService.FindProcesses(processSearchType, processQuery) as unknown as ProcessResult
      if (!result.success) throw new Error(result.output)
      setProcesses(result.processes ?? []); setOutput(result.output)
    } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); setOutput(message); toast.error("进程查询失败", { description: message }) } finally { setRunning(false) }
  }

  const terminateProcess = async (process: ProcessInfo) => {
    if (!window.confirm(`确定要强制关闭 ${process.name}（PID ${process.pid}）吗？未保存的数据可能丢失。`)) return
    try {
      const result = await NetworkService.TerminateProcess(process.pid) as unknown as NetworkResult
      if (!result.success) throw new Error(result.output)
      toast.success(`已关闭 ${process.name}`); await findProcesses()
    } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); toast.error("关闭进程失败", { description: message }) }
  }

  const modes = [
    { id: "ping" as const, label: "Ping", icon: Activity }, { id: "dns" as const, label: "DNS 查询", icon: Globe2 },
    { id: "port" as const, label: "端口检测", icon: Router }, { id: "cidr" as const, label: "CIDR/IP", icon: Braces },
    { id: "http" as const, label: "cURL / HTTP", icon: TerminalSquare }, { id: "process" as const, label: "本地进程", icon: Network },
  ]

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">网络工具</h1><p className="mt-2 text-sm text-muted-foreground">网络诊断、HTTP/cURL 双向转换，以及本机端口和进程查询。</p></div>
        <div className="mb-4 flex flex-wrap gap-2">{modes.map(({ id, label, icon: Icon }) => <Button key={id} variant={mode === id ? "default" : "outline"} onClick={() => { setMode(id); setOutput("") }}><Icon />{label}</Button>)}</div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b p-4">
            {mode === "ping" && <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="主机名或 IP" /><Button onClick={run} disabled={running}><Activity />Ping</Button></div>}
            {mode === "dns" && <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="域名" /><select className={inputClass} value={recordType} onChange={(event) => setRecordType(event.target.value)}>{["A", "AAAA", "CNAME", "MX", "NS", "TXT"].map((value) => <option key={value}>{value}</option>)}</select><Button onClick={run} disabled={running}><Search />查询</Button></div>}
            {mode === "port" && <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} /><input className={inputClass} type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} /><Button onClick={run} disabled={running}><Router />连接</Button></div>}
            {mode === "cidr" && <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input className={inputClass} value={cidr} onChange={(event) => setCIDR(event.target.value)} placeholder="192.168.1.10/24" /><Button onClick={run}><Play />计算</Button></div>}
            {mode === "process" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-[9rem_1fr_auto]"><select className={inputClass} value={processSearchType} onChange={(event) => { const next = event.target.value as typeof processSearchType; setProcessSearchType(next); setProcessQuery(next === "port" ? "8080" : next === "pid" ? "1" : "Quick") }}><option value="port">按端口</option><option value="pid">按 PID</option><option value="name">按程序名</option></select><input className={inputClass} value={processQuery} onChange={(event) => setProcessQuery(event.target.value)} placeholder={processSearchType === "name" ? "程序名，例如 Quick" : processSearchType.toUpperCase()} /><Button onClick={findProcesses} disabled={running}><Search />搜索</Button></div><div className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[6rem_1fr_1fr_5rem] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><span>PID</span><span>程序</span><span>本地 TCP 端口</span><span></span></div>{processes.length ? processes.map((process) => <div key={process.pid} className="grid grid-cols-[6rem_1fr_1fr_5rem] items-center border-t px-3 py-2 text-sm"><code>{process.pid}</code><span className="truncate" title={process.name}>{process.name}</span><span className="truncate text-muted-foreground">{process.ports.join(", ") || "—"}</span><Button variant="destructive" size="sm" onClick={() => terminateProcess(process)}><Power />关闭</Button></div>) : <div className="border-t p-6 text-center text-sm text-muted-foreground">搜索后显示本地进程；关闭操作会要求再次确认。</div>}</div></div>}
            {mode === "http" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((value) => <option key={value}>{value}</option>)}</select><input className={inputClass} value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com" /><Button onClick={run} disabled={running}><Play />发送 HTTP</Button></div><div className="grid gap-3 md:grid-cols-2"><textarea className={`${inputClass} h-28 resize-none font-mono`} value={headers} onChange={(event) => setHeaders(event.target.value)} placeholder="Header: value" /><textarea className={`${inputClass} h-28 resize-none font-mono`} value={body} onChange={(event) => setBody(event.target.value)} placeholder="请求体（可选）" /></div><div className="grid gap-3 lg:grid-cols-2"><div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>HTTP → cURL</span><Button variant="outline" size="sm" onClick={() => setCurl(curlPreview)}>写入编辑器</Button></div><pre className="h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 text-xs">{curlPreview}</pre></div><div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>cURL → HTTP</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => importCurl(false)}>转换</Button><Button size="sm" onClick={() => importCurl(true)} disabled={running}>转换并执行</Button></div></div><textarea className={`${inputClass} h-32 resize-none font-mono text-xs`} value={curl} onChange={(event) => setCurl(event.target.value)} placeholder="粘贴 curl 命令…" /></div></div><div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs"><span className="min-w-0 flex-1">代理：{proxy.mode === "system" ? "系统/环境" : proxy.mode === "custom" ? proxy.url || "自定义（未填写）" : "不使用"}</span><Button variant="ghost" size="icon-xs" onClick={async () => { await navigator.clipboard.writeText(curlPreview); toast.success("cURL 命令已复制") }}><Copy /></Button></div></div>}
          </div>
          {mode !== "process" && <pre className="min-h-52 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-sm leading-6">{running ? "执行中…" : output || "执行后显示结果"}</pre>}
          {mode === "process" && output && <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">{output}</div>}
        </div>
      </div>
    </section>
  )
}

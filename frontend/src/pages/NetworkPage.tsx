import { useMemo, useState } from "react"
import { Braces, Cable, Copy, Globe2, Network, Play, RadioTower, Router, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { NetworkService } from "../../bindings/changeme"
import { Button } from "@/components/ui/button"
import type { ProxySettings } from "@/lib/proxy"
import { cn } from "@/lib/utils"

type Mode = "ping" | "dns" | "port" | "cidr" | "http"
type NetworkResult = { success: boolean; output: string; durationMs: number }
type HTTPResult = { success: boolean; status: string; statusCode: number; headers: Record<string, string[]>; body: string; durationMs: number }
const inputClass = "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

function ipToNumber(ip: string) {
  const parts = ip.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) throw new Error("请输入有效 IPv4 地址")
  return parts.reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0)
}

function numberToIP(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".")
}

function calculateCIDR(value: string) {
  const [ip, prefixText] = value.trim().split("/")
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error("CIDR 前缀需要在 0–32 之间")
  const address = ipToNumber(ip)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (address & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const addresses = 2 ** (32 - prefix)
  const first = prefix >= 31 ? network : network + 1
  const last = prefix >= 31 ? broadcast : broadcast - 1
  return [
    `地址：${numberToIP(address)}/${prefix}`,
    `子网掩码：${numberToIP(mask)}`,
    `网络地址：${numberToIP(network)}`,
    `广播地址：${numberToIP(broadcast)}`,
    `可用范围：${numberToIP(first)} – ${numberToIP(last)}`,
    `地址数量：${addresses.toLocaleString()}`,
    `可用主机：${prefix >= 31 ? addresses : Math.max(0, addresses - 2).toLocaleString()}`,
  ].join("\n")
}

export default function NetworkPage({ proxy }: { proxy: ProxySettings }) {
  const [mode, setMode] = useState<Mode>("ping")
  const [host, setHost] = useState("github.com")
  const [port, setPort] = useState(443)
  const [recordType, setRecordType] = useState("A")
  const [cidr, setCIDR] = useState("192.168.1.42/24")
  const [method, setMethod] = useState("GET")
  const [url, setURL] = useState("https://api.github.com/repos/haessen1998/Quick")
  const [headers, setHeaders] = useState("Accept: application/vnd.github+json\nUser-Agent: Quick")
  const [body, setBody] = useState("")
  const [output, setOutput] = useState("")
  const [success, setSuccess] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)

  const curlPreview = useMemo(() => {
    const headerArgs = headers.split("\n").filter(Boolean).map((header) => `-H ${JSON.stringify(header)}`).join(" ")
    const bodyArg = body ? ` --data ${JSON.stringify(body)}` : ""
    const proxyArg = proxy.mode === "custom" && proxy.url ? ` --proxy ${JSON.stringify(proxy.url)}` : proxy.mode === "none" ? " --noproxy '*'" : ""
    return `curl -X ${method} ${headerArgs}${bodyArg}${proxyArg} ${JSON.stringify(url)}`.replace(/\s+/g, " ")
  }, [body, headers, method, proxy, url])

  const run = async () => {
    setRunning(true); setSuccess(null)
    try {
      if (mode === "cidr") { setOutput(calculateCIDR(cidr)); setSuccess(true); return }
      if (mode === "http") {
        const result = await NetworkService.HTTPRequest(method, url, headers, body, proxy.mode, proxy.url, 15000) as unknown as HTTPResult
        setSuccess(result.success)
        setOutput(`${result.status || "Request failed"}\n耗时：${result.durationMs ?? 0} ms\n\n${Object.entries(result.headers ?? {}).map(([name, values]) => `${name}: ${values.join(", ")}`).join("\n")}\n\n${result.body ?? ""}`)
        return
      }
      const result = mode === "ping"
        ? await NetworkService.Ping(host, 5000) as unknown as NetworkResult
        : mode === "dns"
          ? await NetworkService.DNSQuery(host, recordType, 8000) as unknown as NetworkResult
          : await NetworkService.CheckPort(host, port, 5000) as unknown as NetworkResult
      setSuccess(result.success)
      setOutput(`${result.output}\n\n耗时：${result.durationMs ?? 0} ms`)
    } catch (caught) {
      setSuccess(false); setOutput(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  const modes = [
    { id: "ping" as const, label: "Ping", icon: RadioTower },
    { id: "dns" as const, label: "DNS 查询", icon: Globe2 },
    { id: "port" as const, label: "端口检测", icon: Cable },
    { id: "cidr" as const, label: "CIDR/IP", icon: Network },
    { id: "http" as const, label: "cURL / HTTP", icon: Router },
  ]

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">网络工具</h1><p className="mt-2 text-sm text-muted-foreground">Ping、DNS、TCP 端口、IPv4 CIDR 与受控 HTTP 请求；网络请求遵循设置中的代理策略。</p></div>
        <div className="mb-4 flex flex-wrap gap-2">{modes.map(({ id, label, icon: Icon }) => <Button key={id} variant={mode === id ? "default" : "outline"} onClick={() => { setMode(id); setOutput(""); setSuccess(null) }}><Icon />{label}</Button>)}</div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b p-4">
            {mode === "ping" && <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="主机名或 IP" /><Button onClick={run} disabled={running}><Play />Ping</Button></div>}
            {mode === "dns" && <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="域名" /><select className={inputClass} value={recordType} onChange={(event) => setRecordType(event.target.value)}>{["A", "AAAA", "CNAME", "MX", "NS", "TXT"].map((type) => <option key={type}>{type}</option>)}</select><Button onClick={run} disabled={running}><Play />查询</Button></div>}
            {mode === "port" && <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="主机名或 IP" /><input className={inputClass} type="number" min="1" max="65535" value={port} onChange={(event) => setPort(Number(event.target.value))} /><Button onClick={run} disabled={running}><Play />连接</Button></div>}
            {mode === "cidr" && <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input className={inputClass} value={cidr} onChange={(event) => setCIDR(event.target.value)} placeholder="192.168.1.42/24" /><Button onClick={run}><Braces />计算</Button></div>}
            {mode === "http" && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((value) => <option key={value}>{value}</option>)}</select><input className={inputClass} value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com" /><Button onClick={run} disabled={running}><Play />发送</Button></div><div className="grid gap-3 md:grid-cols-2"><textarea className={`${inputClass} h-28 resize-none font-mono`} value={headers} onChange={(event) => setHeaders(event.target.value)} placeholder="Header: value" /><textarea className={`${inputClass} h-28 resize-none font-mono`} value={body} onChange={(event) => setBody(event.target.value)} placeholder="请求体（可选）" /></div><div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3"><code className="min-w-0 flex-1 select-text break-all text-xs">{curlPreview}</code><Button variant="ghost" size="icon-xs" onClick={async () => { await navigator.clipboard.writeText(curlPreview); toast.success("cURL 命令已复制") }}><Copy /></Button></div></div>}
          </div>
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground"><span className={cn("size-2 rounded-full", success === null ? "bg-muted-foreground/40" : success ? "bg-emerald-500" : "bg-destructive")} />代理：{proxy.mode === "system" ? "系统/环境" : proxy.mode === "custom" ? proxy.url || "指定（未配置）" : "不使用代理"}</div>
          <pre className="app-interactive h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-sm leading-6">{running ? "正在执行…" : output || "执行后显示结果"}</pre>
        </div>
      </div>
    </section>
  )
}

import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { useLanguage } from "@/lib/i18n"
import type { ProxySettings } from "@/lib/proxy"
import { useSmartInput } from "@/lib/smart-input"
import { useDraftState } from "@/lib/workspace-store"
import { Activity, Braces, Globe2, Link2, Network, Router, TerminalSquare } from "lucide-react"
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import { NetworkService } from "../../bindings/github.com/haessen1998/Quick/internal/network"

export type Mode = "ping" | "dns" | "port" | "cidr" | "url" | "http" | "process"

export type NetworkResult = { success: boolean; output: string; durationMs: number }

export type HTTPResult = {
  success: boolean
  status: string
  statusCode: number
  headers: Record<string, string[]>
  body: string
  durationMs: number
}

export type ProcessInfo = { pid: number; name: string; ports: number[] }

export type ProcessResult = { success: boolean; processes: ProcessInfo[]; output: string }

export type HTTPRequest = { method: string; url: string; headers: string; body: string }

export const inputClass =
  "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

export function calculateCIDR(input: string) {
  const [address, prefixText] = input.trim().split("/")
  const octets = address?.split(".").map(Number)
  const prefix = Number(prefixText)
  if (
    !octets ||
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255) ||
    prefix < 0 ||
    prefix > 32
  )
    throw new Error("请输入有效的 IPv4 CIDR，例如 192.168.1.10/24")
  const ip = octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const format = (value: number) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".")
  const total = 2 ** (32 - prefix)
  return `网络地址：${format(network)}\n广播地址：${format(broadcast)}\n子网掩码：${format(mask)}\n地址数量：${total}\n可用主机范围：${total > 2 ? `${format(network + 1)} – ${format(broadcast - 1)}` : "无传统主机范围"}`
}

export function validatedPingParameters(count: number, timeoutMS: number, packetSize: number) {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Ping 次数必须在 1–20 之间")
  if (!Number.isInteger(timeoutMS) || timeoutMS < 100 || timeoutMS > 60000) throw new Error("Ping 总超时必须在 100–60000 ms 之间")
  if (!Number.isInteger(packetSize) || packetSize < 1 || packetSize > 65500) throw new Error("Ping 数据包大小必须在 1–65500 字节之间")
  return { count, timeoutMS, packetSize }
}

export function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function httpToCurl(request: HTTPRequest) {
  const parts = ["curl", "-X", request.method.toUpperCase(), shellQuote(request.url)]
  for (const line of request.headers
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean))
    parts.push("-H", shellQuote(line))
  if (request.body) parts.push("--data-raw", shellQuote(request.body))
  return parts.join(" ")
}

export function tokenizeCurl(command: string) {
  command = command.replace(/(?:\\|\^|`)\r?\n/g, " ")
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const character of command.trim()) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
      continue
    }
    current += character
  }
  if (quote) throw new Error("cURL 命令存在未闭合的引号")
  if (escaped) current += "\\"
  if (current) tokens.push(current)
  return tokens
}

export function curlToHTTP(command: string): HTTPRequest {
  const tokens = tokenizeCurl(command)
  if (tokens[0]?.toLowerCase().endsWith("curl") || tokens[0]?.toLowerCase().endsWith("curl.exe")) tokens.shift()
  let method = "GET"
  let methodExplicit = false
  let url = ""
  const headers: string[] = []
  const bodies: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => {
      const value = tokens[++index]
      if (value === undefined) throw new Error(`${token} 缺少参数`)
      return value
    }
    if (token === "-X" || token === "--request") {
      method = next().toUpperCase()
      methodExplicit = true
      continue
    }
    if (token.startsWith("-X") && token.length > 2) {
      method = token.slice(2).toUpperCase()
      methodExplicit = true
      continue
    }
    if (token === "-H" || token === "--header") {
      headers.push(next())
      continue
    }
    if (token.startsWith("-H") && token.length > 2) {
      headers.push(token.slice(2))
      continue
    }
    if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"].includes(token)) {
      bodies.push(next())
      continue
    }
    if (token === "--url") {
      url = next()
      continue
    }
    if (token === "-I" || token === "--head") {
      method = "HEAD"
      methodExplicit = true
      continue
    }
    if (token === "-G" || token === "--get") {
      method = "GET"
      methodExplicit = true
      continue
    }
    if (["-k", "--insecure", "--compressed", "-s", "--silent", "-L", "--location"].includes(token)) continue
    if (token === "-u" || token === "--user") {
      headers.push(`Authorization: Basic ${btoa(next())}`)
      continue
    }
    if (/^https?:\/\//i.test(token)) {
      url = token
      continue
    }
    if (token.startsWith("-")) throw new Error(`暂不支持 cURL 参数：${token}`)
    if (!url) url = token
  }
  if (!url) throw new Error("cURL 命令中没有 HTTP/HTTPS URL")
  if (bodies.length && !methodExplicit) method = "POST"
  return { method, url, headers: headers.join("\n"), body: bodies.join("&") }
}

export function parseURL(value: string) {
  const parsed = new URL(value)
  return {
    href: parsed.href,
    protocol: parsed.protocol,
    username: parsed.username,
    password: parsed.password ? "••••••" : "",
    hostname: parsed.hostname,
    port: parsed.port || "默认",
    origin: parsed.origin,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    parameters: Array.from(parsed.searchParams.entries()).map(([key, item]) => ({ key, value: item })),
  }
}

function useNetworkPageModel({ proxy }: { proxy: ProxySettings }) {
  const { t } = useLanguage()
  const [mode, setMode] = useDraftState<Mode>("network", "mode", "ping")
  const [host, setHost] = useDraftState("network", "host", "github.com")
  const [pingCount, setPingCount] = useDraftState("network", "pingCount", 4)
  const [pingTimeoutMS, setPingTimeoutMS] = useDraftState("network", "pingTimeoutMS", 5000)
  const [pingPacketSize, setPingPacketSize] = useDraftState("network", "pingPacketSize", 32)
  const [port, setPort] = useDraftState("network", "port", 443)
  const [recordType, setRecordType] = useDraftState("network", "recordType", "A")
  const [cidr, setCIDR] = useDraftState("network", "cidr", "192.168.1.10/24")
  const [method, setMethod] = useDraftState("network", "method", "GET")
  const [url, setURL] = useDraftState("network", "url", "https://api.github.com/repos/haessen1998/Quick")
  const [headers, setHeaders] = useDraftState("network", "headers", "Accept: application/vnd.github+json")
  const [body, setBody] = useDraftState("network", "body", "")
  const [curl, setCurl] = useDraftState("network", "curl", "")
  const [processSearchType, setProcessSearchType] = useDraftState<"port" | "pid" | "name">("network", "processSearchType", "port")
  const [processQuery, setProcessQuery] = useDraftState("network", "processQuery", "")
  const [processes, setProcesses] = useDraftState<ProcessInfo[]>("network", "processes", [])
  const [processCanTerminate, setProcessCanTerminate] = useDraftState("network", "processCanTerminate", false)
  const [pendingTermination, setPendingTermination] = useDraftState<ProcessInfo | null>("network", "pendingTermination", null)
  const [terminatingPID, setTerminatingPID] = useDraftState<number | null>("network", "terminatingPID", null)
  const assistantSearchProcesses = useRef(new Map<number, ProcessInfo>())
  const [output, setOutput] = useDraftState("network", "output", "")
  const [running, setRunning] = useDraftState("network", "running", false)
  const curlPreview = useMemo(() => httpToCurl({ method, url, headers, body }), [method, url, headers, body])
  const urlInspection = useMemo(() => {
    try {
      return { value: parseURL(url), error: "" }
    } catch (caught) {
      return { value: null, error: caught instanceof Error ? caught.message : String(caught) }
    }
  }, [url])

  useSmartInput("network", (values) => {
    if (values.operation !== "url-inspect") return
    setMode("url")
    setURL(String(values.url ?? ""))
    setOutput("")
  })

  const changeURLParameters = (transform: (entries: [string, string][]) => [string, string][]) => {
    try {
      const parsed = new URL(url)
      parsed.search = new URLSearchParams(transform(Array.from(parsed.searchParams.entries()))).toString()
      setURL(parsed.href)
    } catch (caught) {
      toast.error("URL 无效", { description: caught instanceof Error ? caught.message : String(caught) })
    }
  }

  useAssistantCapability({
    page: "network",
    getContext: () =>
      mode === "url"
        ? { mode, url, inspection: urlInspection.value, error: urlInspection.error }
        : mode === "http"
          ? {
              mode,
              method,
              url,
              hasHeaders: Boolean(headers.trim()),
              bodyLength: body.length,
              hasCurl: Boolean(curl.trim()),
              requestSentByAssistant: false,
              output: output.slice(0, 4000),
            }
          : mode === "process"
            ? {
                mode,
                searchType: processSearchType,
                query: processQuery,
                resultCount: processes.length,
                canTerminate: processCanTerminate,
                output: output.slice(0, 2000),
              }
            : {
                mode,
                host: mode === "cidr" ? undefined : host,
                ping: mode === "ping" ? { count: pingCount, timeoutMS: pingTimeoutMS, packetSize: pingPacketSize } : undefined,
                port: mode === "port" ? port : undefined,
                recordType: mode === "dns" ? recordType : undefined,
                cidr: mode === "cidr" ? cidr : undefined,
                output: output.slice(0, 4000),
              },
    actions: {
      fill_http: (values) => {
        const nextMethod = String(values.method ?? "GET").toUpperCase()
        if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(nextMethod)) throw new Error(`不支持的 HTTP 方法：${nextMethod}`)
        const nextURL = String(values.url ?? "").trim()
        if (!/^https?:\/\//i.test(nextURL)) throw new Error("HTTP URL 必须以 http:// 或 https:// 开头")
        setMode("http")
        setMethod(nextMethod)
        setURL(nextURL)
        setHeaders(String(values.headers ?? ""))
        setBody(String(values.body ?? ""))
        setOutput("")
        toast.success("小Q已填写 HTTP 请求；尚未发送")
        return { success: true, method: nextMethod, url: nextURL, executed: false, confirmationRequired: true }
      },
      run: async (values) => {
        const operation = String(values.operation ?? "")
        setOutput("")
        try {
          const operationAutoApproved = values.operationAutoApproved === true
          if (operation === "http-prepare") {
            const nextMethod = String(values.method ?? "GET").toUpperCase()
            const nextURL = String(values.url ?? "").trim()
            if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(nextMethod))
              throw new Error(`不支持的 HTTP 方法：${nextMethod}`)
            if (!/^https?:\/\//i.test(nextURL)) throw new Error("HTTP URL 必须以 http:// 或 https:// 开头")
            setMode("http")
            setMethod(nextMethod)
            setURL(nextURL)
            setHeaders(String(values.headers ?? ""))
            setBody(String(values.body ?? ""))
            toast.success("HTTP 请求已准备；尚未发送")
            return { success: true, operation, method: nextMethod, url: nextURL, executed: false, confirmationRequired: true }
          }
          if (operation === "http-execute") {
            const nextMethod = String(values.method ?? "GET").toUpperCase()
            const nextURL = String(values.url ?? "").trim()
            const nextHeaders = String(values.headers ?? "")
            const nextBody = String(values.body ?? "")
            if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(nextMethod))
              throw new Error(`不支持的 HTTP 方法：${nextMethod}`)
            if (!/^https?:\/\//i.test(nextURL)) throw new Error("HTTP URL 必须以 http:// 或 https:// 开头")
            setMode("http")
            setMethod(nextMethod)
            setURL(nextURL)
            setHeaders(nextHeaders)
            setBody(nextBody)
            if (!operationAutoApproved)
              return {
                success: true,
                operation,
                method: nextMethod,
                url: nextURL,
                executed: false,
                confirmationRequired: true,
                message: "操作自动审核未开启，请在页面手动发送",
              }
            setRunning(true)
            const result = (await NetworkService.HTTPRequest(
              nextMethod,
              nextURL,
              nextHeaders,
              nextBody,
              proxy.mode,
              proxy.url,
              15000,
            )) as unknown as HTTPResult
            setOutput(
              `${result.status || "请求失败"} · ${result.durationMs} ms\n\n${JSON.stringify(result.headers, null, 2)}\n\n${result.body}`,
            )
            return {
              success: result.success,
              operation,
              executed: true,
              status: result.status,
              statusCode: result.statusCode,
              durationMs: result.durationMs,
              headers: result.headers,
              body: result.body,
              truncated: result.body.length > 12000,
            }
          }
          if (operation === "curl-to-http") {
            const command = String(values.curl ?? "")
            const request = curlToHTTP(command)
            setMode("http")
            setCurl(command)
            setMethod(request.method)
            setURL(request.url)
            setHeaders(request.headers)
            setBody(request.body)
            toast.success("cURL 已转换；请求尚未发送")
            return {
              success: true,
              operation,
              method: request.method,
              url: request.url,
              hasHeaders: Boolean(request.headers),
              bodyLength: request.body.length,
              executed: true,
              requestSent: false,
            }
          }
          if (operation === "http-to-curl") {
            const request = {
              method: String(values.method ?? "GET"),
              url: String(values.url ?? ""),
              headers: String(values.headers ?? ""),
              body: String(values.body ?? ""),
            }
            if (!/^https?:\/\//i.test(request.url)) throw new Error("HTTP URL 必须以 http:// 或 https:// 开头")
            const result = httpToCurl(request)
            setMode("http")
            setMethod(request.method)
            setURL(request.url)
            setHeaders(request.headers)
            setBody(request.body)
            setCurl(result)
            return { success: true, operation, result, executed: true, requestSent: false }
          }
          if (operation === "url-inspect") {
            const nextURL = String(values.url ?? "").trim()
            const result = parseURL(nextURL)
            setMode("url")
            setURL(nextURL)
            setOutput(JSON.stringify(result, null, 2))
            return { success: true, operation, result, executed: true, requestSent: false }
          }
          if (operation === "cidr") {
            const value = String(values.cidr ?? "")
            const result = calculateCIDR(value)
            setMode("cidr")
            setCIDR(value)
            setOutput(result)
            return { success: true, operation, result, executed: true }
          }
          if (operation === "process-search") {
            const searchType = String(values.searchType ?? "name") as "port" | "pid" | "name"
            const query = String(values.query ?? "").trim()
            if (!query) throw new Error("助手查询本地进程必须提供端口、PID 或程序名；显示全部请在页面手动操作")
            if (!["port", "pid", "name"].includes(searchType)) throw new Error(`不支持的进程查询类型：${searchType}`)
            assistantSearchProcesses.current.clear()
            setMode("process")
            setProcessSearchType(searchType)
            setProcessQuery(query)
            setRunning(true)
            const result = (await NetworkService.FindProcesses(searchType, query)) as unknown as ProcessResult
            if (!result.success) throw new Error(result.output)
            assistantSearchProcesses.current = new Map((result.processes ?? []).map((process) => [process.pid, process]))
            setProcesses(result.processes ?? [])
            setProcessCanTerminate(true)
            setOutput(result.output)
            return {
              success: true,
              operation,
              count: result.processes?.length ?? 0,
              processes: (result.processes ?? []).slice(0, 100),
              truncated: (result.processes?.length ?? 0) > 100,
              executed: true,
              terminationAvailable: operationAutoApproved,
            }
          }
          if (operation === "process-terminate") {
            const pid = Number(values.pid)
            if (!Number.isInteger(pid) || pid < 1) throw new Error("请输入有效的 PID")
            const matched = assistantSearchProcesses.current.get(pid)
            if (!matched) throw new Error("只能关闭小Q刚刚通过带条件搜索得到的进程；请先搜索并确认目标")
            if (!operationAutoApproved)
              return {
                success: true,
                operation,
                pid,
                executed: false,
                confirmationRequired: true,
                message: "操作自动审核未开启，请在页面确认后关闭",
              }
            setMode("process")
            setRunning(true)
            const current = (await NetworkService.FindProcesses("pid", String(pid))) as unknown as ProcessResult
            const currentProcess = current.processes?.find((process) => process.pid === pid)
            if (!current.success || !currentProcess || currentProcess.name !== matched.name)
              throw new Error("目标进程已退出或 PID 已被其他程序复用，请重新搜索")
            const result = (await NetworkService.TerminateProcess(pid)) as unknown as NetworkResult
            if (!result.success) throw new Error(result.output)
            assistantSearchProcesses.current.delete(pid)
            setProcesses((current) => current.filter((process) => process.pid !== pid))
            setOutput(result.output)
            return { success: true, operation, pid, process: matched.name, executed: true, output: result.output }
          }
          const nextHost = String(values.host ?? "").trim()
          if (!nextHost) throw new Error("请输入主机名或 IP")
          setHost(nextHost)
          setRunning(true)
          if (operation === "ping") {
            setMode("ping")
            const parameters = validatedPingParameters(
              Number(values.count ?? pingCount),
              Number(values.timeoutMS ?? pingTimeoutMS),
              Number(values.packetSize ?? pingPacketSize),
            )
            setPingCount(parameters.count)
            setPingTimeoutMS(parameters.timeoutMS)
            setPingPacketSize(parameters.packetSize)
            const result = (await NetworkService.Ping(
              nextHost,
              parameters.count,
              parameters.timeoutMS,
              parameters.packetSize,
            )) as unknown as NetworkResult
            const formatted = `${result.success ? "成功" : "失败"} · ${result.durationMs} ms\n\n${result.output}`
            setOutput(formatted)
            return { success: result.success, operation, output: result.output, durationMs: result.durationMs, executed: true }
          }
          if (operation === "dns") {
            const nextRecordType = String(values.recordType ?? "A").toUpperCase()
            setMode("dns")
            setRecordType(nextRecordType)
            const result = (await NetworkService.DNSQuery(nextHost, nextRecordType, 5000)) as unknown as NetworkResult
            setOutput(`${result.success ? "成功" : "失败"} · ${result.durationMs} ms\n\n${result.output}`)
            return { success: result.success, operation, output: result.output, durationMs: result.durationMs, executed: true }
          }
          if (operation === "port") {
            const nextPort = Number(values.port)
            if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) throw new Error("端口必须在 1–65535 之间")
            setMode("port")
            setPort(nextPort)
            const result = (await NetworkService.CheckPort(nextHost, nextPort, 5000)) as unknown as NetworkResult
            setOutput(`${result.success ? "成功" : "失败"} · ${result.durationMs} ms\n\n${result.output}`)
            return { success: result.success, operation, output: result.output, durationMs: result.durationMs, executed: true }
          }
          throw new Error(`不支持的网络操作：${operation}`)
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setOutput(message)
          return { success: false, operation, error: message, executed: !["http-prepare"].includes(operation) }
        } finally {
          setRunning(false)
        }
      },
    },
  })

  const executeHTTP = async (request: HTTPRequest) => {
    const result = (await NetworkService.HTTPRequest(
      request.method,
      request.url,
      request.headers,
      request.body,
      proxy.mode,
      proxy.url,
      15000,
    )) as unknown as HTTPResult
    setOutput(`${result.status || "请求失败"} · ${result.durationMs} ms\n\n${JSON.stringify(result.headers, null, 2)}\n\n${result.body}`)
    if (!result.success) toast.error("HTTP 请求失败")
  }

  const run = async () => {
    setRunning(true)
    setOutput("")
    try {
      if (mode === "cidr") {
        setOutput(calculateCIDR(cidr))
        return
      }
      if (mode === "http") {
        await executeHTTP({ method, url, headers, body })
        return
      }
      let result: NetworkResult
      if (mode === "ping") {
        const parameters = validatedPingParameters(pingCount, pingTimeoutMS, pingPacketSize)
        result = (await NetworkService.Ping(
          host,
          parameters.count,
          parameters.timeoutMS,
          parameters.packetSize,
        )) as unknown as NetworkResult
      } else if (mode === "dns") result = (await NetworkService.DNSQuery(host, recordType, 5000)) as unknown as NetworkResult
      else result = (await NetworkService.CheckPort(host, port, 5000)) as unknown as NetworkResult
      setOutput(`${result.success ? "成功" : "失败"} · ${result.durationMs} ms\n\n${result.output}`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setOutput(message)
      toast.error("网络操作失败", { description: message })
    } finally {
      setRunning(false)
    }
  }

  const importCurl = async (execute: boolean) => {
    try {
      const request = curlToHTTP(curl)
      setMethod(request.method)
      setURL(request.url)
      setHeaders(request.headers)
      setBody(request.body)
      toast.success("cURL 已转换为 HTTP 请求")
      if (execute) {
        setRunning(true)
        await executeHTTP(request)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setOutput(message)
      toast.error("cURL 解析失败", { description: message })
    } finally {
      setRunning(false)
    }
  }

  const findProcesses = async () => {
    setRunning(true)
    try {
      const result = (await NetworkService.FindProcesses(processSearchType, processQuery)) as unknown as ProcessResult
      if (!result.success) throw new Error(result.output)
      setProcesses(result.processes ?? [])
      setProcessCanTerminate(Boolean(processQuery.trim()))
      setOutput(result.output)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setProcessCanTerminate(false)
      setOutput(message)
      toast.error("进程查询失败", { description: message })
    } finally {
      setRunning(false)
    }
  }

  const terminateProcess = async (process: ProcessInfo) => {
    if (!processCanTerminate) return
    setTerminatingPID(process.pid)
    try {
      const result = (await NetworkService.TerminateProcess(process.pid)) as unknown as NetworkResult
      if (!result.success) throw new Error(result.output)
      setPendingTermination(null)
      toast.success(`已关闭 ${process.name}`)
      await findProcesses()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      toast.error("关闭进程失败", { description: message })
    } finally {
      setTerminatingPID(null)
    }
  }

  const modes = [
    { id: "ping" as const, label: "Ping", icon: Activity },
    { id: "dns" as const, label: "DNS 查询", icon: Globe2 },
    { id: "port" as const, label: "端口检测", icon: Router },
    { id: "cidr" as const, label: "CIDR/IP", icon: Braces },
    { id: "url" as const, label: "URL 工具", icon: Link2 },
    { id: "http" as const, label: "cURL / HTTP", icon: TerminalSquare },
    { id: "process" as const, label: "本地进程", icon: Network },
  ]

  return {
    proxy,
    t,
    mode,
    setMode,
    host,
    setHost,
    pingCount,
    setPingCount,
    pingTimeoutMS,
    setPingTimeoutMS,
    pingPacketSize,
    setPingPacketSize,
    port,
    setPort,
    recordType,
    setRecordType,
    cidr,
    setCIDR,
    method,
    setMethod,
    url,
    setURL,
    headers,
    setHeaders,
    body,
    setBody,
    curl,
    setCurl,
    processSearchType,
    setProcessSearchType,
    processQuery,
    setProcessQuery,
    processes,
    processCanTerminate,
    setProcessCanTerminate,
    pendingTermination,
    setPendingTermination,
    terminatingPID,
    output,
    setOutput,
    running,
    curlPreview,
    urlInspection,
    changeURLParameters,
    run,
    importCurl,
    findProcesses,
    terminateProcess,
    modes,
  }
}

const ModelContext = createContext<ReturnType<typeof useNetworkPageModel> | null>(null)
export function NetworkPageModelProvider(props: Parameters<typeof useNetworkPageModel>[0] & { children: ReactNode }) {
  const model = useNetworkPageModel(props)
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useNetworkPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("NetworkPageModelProvider missing")
  return value
}

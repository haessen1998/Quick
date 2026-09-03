import { useCallback, useMemo, useState } from "react"
import { CalendarClock, Clock3, Copy, Fingerprint, Hourglass, Play, RefreshCw, Sparkles, TimerReset } from "lucide-react"
import { CronExpressionParser } from "cron-parser"
import { DateTime } from "luxon"
import { ulid } from "ulid"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { useSmartInput } from "@/lib/smart-input"

const inputClass = "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const outputClass = "min-h-10 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all"
const timeZones = ["UTC", "Asia/Shanghai", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney"]
type DurationUnit = "milliseconds" | "seconds" | "minutes"

function convertDuration(value: string, unit: DurationUnit) {
  if (!value.trim()) throw new Error("请输入时长")
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error("请输入有效时长")
  const multiplier = unit === "minutes" ? 60_000 : unit === "seconds" ? 1_000 : 1
  const converted = numeric * multiplier
  if (!Number.isFinite(converted) || Math.abs(converted) > Number.MAX_SAFE_INTEGER) throw new Error("时长超出安全计算范围")
  const totalMilliseconds = Math.round(converted)
  let remainder = Math.abs(totalMilliseconds)
  const hours = Math.floor(remainder / 3_600_000); remainder %= 3_600_000
  const minutes = Math.floor(remainder / 60_000); remainder %= 60_000
  const seconds = Math.floor(remainder / 1_000)
  const milliseconds = remainder % 1_000
  const sign = totalMilliseconds < 0 ? "-" : ""
  const formatted = `${sign}${hours} 小时 ${minutes} 分钟 ${seconds} 秒${milliseconds ? ` ${milliseconds} 毫秒` : ""}`
  return { formatted, totalMilliseconds, hours, minutes, seconds, milliseconds }
}

function parseDuration(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("请输入时间段，例如 1h 2m 3.5s")
  let milliseconds = 0
  const colon = trimmed.match(/^([+-])?(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/)
  if (colon) milliseconds = (Number(colon[2]) * 3600 + Number(colon[3]) * 60 + Number(colon[4] ?? 0)) * 1000 * (colon[1] === "-" ? -1 : 1)
  else {
    const normalized = trimmed.toLowerCase().replace(/毫秒/g, "ms").replace(/小时|时/g, "h").replace(/分钟|分/g, "m").replace(/秒/g, "s").replace(/天/g, "d")
    const matches = [...normalized.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/g)]
    if (!matches.length || normalized.replace(/([+-]?\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/g, "").trim()) throw new Error("无法识别时间段；支持 1d 2h 3m 4s 500ms 或 HH:MM:SS")
    const factors = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }
    milliseconds = matches.reduce((total, match) => total + Number(match[1]) * factors[match[2] as keyof typeof factors], 0)
  }
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > Number.MAX_SAFE_INTEGER) throw new Error("时间段超出安全计算范围")
  const rounded = Math.round(milliseconds)
  const readable = convertDuration(String(rounded), "milliseconds")
  return { ...readable, seconds: rounded / 1000, minutesTotal: rounded / 60000, hoursTotal: rounded / 3600000 }
}

function secureRandom(length: number, alphabet: string) {
  if (length < 1 || length > 4096) throw new Error("长度需要在 1–4096 之间")
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("")
}

function generateSnowflake() {
  const epoch = 1704067200000n
  const timestamp = BigInt(Date.now()) - epoch
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return ((timestamp << 22n) | BigInt(random[0] & 0x3fffff)).toString()
}

function generateIdentifier(kind: string, length: number) {
  return kind === "uuid" || kind === "guid" ? crypto.randomUUID()
    : kind === "ulid" ? ulid()
    : kind === "snowflake" ? generateSnowflake()
    : kind === "number" ? secureRandom(length, "0123456789")
    : kind === "password" ? secureRandom(length, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=")
    : kind === "string" ? secureRandom(length, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
    : (() => { throw new Error(`不支持的生成类型：${kind}`) })()
}

function nextCronRuns(value: string, zone: string) {
  const expression = CronExpressionParser.parse(value, { tz: zone })
  return Array.from({ length: 6 }, () => DateTime.fromJSDate(expression.next().toDate()).setZone(zone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ"))
}

export default function TimeIdentifiersPage() {
  const [timestamp, setTimestamp] = useState(() => Math.floor(Date.now() / 1000).toString())
  const [timestampUnit, setTimestampUnit] = useState<"seconds" | "milliseconds">("seconds")
  const [dateInput, setDateInput] = useState(() => DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm:ss"))
  const [sourceZone, setSourceZone] = useState("Asia/Shanghai")
  const [targetZone, setTargetZone] = useState("UTC")
  const [diffStart, setDiffStart] = useState(() => DateTime.local().startOf("day").toFormat("yyyy-LL-dd'T'HH:mm"))
  const [diffEnd, setDiffEnd] = useState(() => DateTime.local().plus({ days: 1, hours: 2 }).startOf("hour").toFormat("yyyy-LL-dd'T'HH:mm"))
  const [durationValue, setDurationValue] = useState("3661")
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("seconds")
  const [durationText, setDurationText] = useState("1h 1m 1s")
  const [comparisonZones, setComparisonZones] = useState(["Asia/Shanghai", "UTC", "America/New_York", "Europe/London"])
  const [generator, setGenerator] = useState("uuid")
  const [length, setLength] = useState(24)
  const [generated, setGenerated] = useState("")
  const [cron, setCron] = useState("*/15 * * * *")
  const [cronZone, setCronZone] = useState("Asia/Shanghai")
  const [cronResults, setCronResults] = useState<string[]>([])
  const [cronError, setCronError] = useState("")

  const timestampResult = useMemo(() => {
    const numeric = Number(timestamp)
    if (!Number.isFinite(numeric)) return "请输入有效时间戳"
    const millis = timestampUnit === "seconds" ? numeric * 1000 : numeric
    const value = DateTime.fromMillis(millis)
    return value.isValid ? `${value.toFormat("yyyy-LL-dd HH:mm:ss.SSS ZZZZ")}\n${value.toUTC().toISO()}` : "时间戳超出有效范围"
  }, [timestamp, timestampUnit])

  const dateToTimestamp = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    if (!value.isValid) return "请输入有效日期时间"
    return `秒：${Math.floor(value.toMillis() / 1000)}\n毫秒：${value.toMillis()}`
  }, [dateInput, sourceZone])

  const timezoneResult = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    if (!value.isValid) return "请输入有效日期时间"
    return value.setZone(targetZone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ")
  }, [dateInput, sourceZone, targetZone])

  const difference = useMemo(() => {
    const start = DateTime.fromISO(diffStart)
    const end = DateTime.fromISO(diffEnd)
    if (!start.isValid || !end.isValid) return "请输入有效起止时间"
    const milliseconds = end.toMillis() - start.toMillis()
    const sign = milliseconds < 0 ? "-" : ""
    let remainder = Math.abs(milliseconds)
    const days = Math.floor(remainder / 86_400_000); remainder %= 86_400_000
    const hours = Math.floor(remainder / 3_600_000); remainder %= 3_600_000
    const minutes = Math.floor(remainder / 60_000); remainder %= 60_000
    const seconds = Math.floor(remainder / 1000)
    return `${sign}${days} 天 ${hours} 小时 ${minutes} 分钟 ${seconds} 秒\n总计：${milliseconds} ms`
  }, [diffStart, diffEnd])

  const durationResult = useMemo(() => {
    try {
      const result = convertDuration(durationValue, durationUnit)
      return `${result.formatted}\n总计：${result.totalMilliseconds} 毫秒`
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [durationValue, durationUnit])
  const parsedDurationResult = useMemo(() => {
    try {
      const result = parseDuration(durationText)
      return `${result.formatted}\n毫秒：${result.totalMilliseconds}\n秒：${result.seconds}\n分钟：${result.minutesTotal}`
    } catch (error) { return error instanceof Error ? error.message : String(error) }
  }, [durationText])
  const timezoneComparisons = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    return comparisonZones.map((zone) => ({ zone, value: value.isValid ? value.setZone(zone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ") : "无效时间" }))
  }, [comparisonZones, dateInput, sourceZone])

  useSmartInput("time-ids", useCallback((values) => {
    const operation = String(values.operation ?? "")
    if (operation === "timestamp-to-date") { setTimestamp(String(values.value ?? "")); setTimestampUnit(values.unit === "milliseconds" ? "milliseconds" : "seconds") }
    if (operation === "cron") { setCron(String(values.cron ?? "")); setCronZone(String(values.zone ?? "Asia/Shanghai")) }
    if (operation === "show-identifier") { setGenerator("uuid"); setGenerated(String(values.value ?? "")) }
  }, []))

  const runGenerator = () => {
    try {
      setGenerated(generateIdentifier(generator, length))
    } catch (error) {
      toast.error("生成失败", { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const parseCron = () => {
    try {
      setCronResults(nextCronRuns(cron, cronZone))
      setCronError("")
    } catch (error) {
      setCronResults([])
      setCronError(error instanceof Error ? error.message : String(error))
    }
  }

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success("已复制")
  }

  useAssistantCapability({
    page: "time-ids",
    getContext: () => ({ timestamp, timestampUnit, dateInput, sourceZone, targetZone, comparisonZones, diffStart, diffEnd, durationValue, durationUnit, durationResult, durationText, parsedDurationResult, generator, length, generated: generated ? "已生成（值不暴露给助手）" : "", cron, cronZone, cronResults, cronError }),
    actions: {
      run: (values) => {
        const operation = String(values.operation ?? "")
        try {
          if (operation === "timestamp-to-date") {
            const nextTimestamp = String(values.value ?? "")
            const unit = values.unit === "milliseconds" ? "milliseconds" : "seconds"
            const numeric = Number(nextTimestamp)
            if (!Number.isFinite(numeric)) throw new Error("请输入有效时间戳")
            const result = DateTime.fromMillis(unit === "seconds" ? numeric * 1000 : numeric)
            if (!result.isValid) throw new Error("时间戳超出有效范围")
            setTimestamp(nextTimestamp); setTimestampUnit(unit)
            return { success: true, result: `${result.toFormat("yyyy-LL-dd HH:mm:ss.SSS ZZZZ")}\n${result.toUTC().toISO()}`, executed: true }
          }
          if (operation === "date-to-timestamp") {
            const value = String(values.value ?? "")
            const zone = String(values.sourceZone ?? "Asia/Shanghai")
            const result = DateTime.fromISO(value, { zone })
            if (!result.isValid) throw new Error(result.invalidExplanation || "请输入有效日期时间")
            setDateInput(value); setSourceZone(zone)
            return { success: true, result: { seconds: Math.floor(result.toMillis() / 1000), milliseconds: result.toMillis() }, executed: true }
          }
          if (operation === "timezone") {
            const value = String(values.value ?? "")
            const from = String(values.sourceZone ?? "Asia/Shanghai")
            const to = String(values.targetZone ?? "UTC")
            const parsed = DateTime.fromISO(value, { zone: from })
            if (!parsed.isValid) throw new Error(parsed.invalidExplanation || "请输入有效日期时间")
            const converted = parsed.setZone(to)
            if (!converted.isValid) throw new Error(converted.invalidExplanation || "无效时区")
            setDateInput(value); setSourceZone(from); setTargetZone(to)
            return { success: true, result: converted.toFormat("yyyy-LL-dd HH:mm:ss ZZZZ"), executed: true }
          }
          if (operation === "difference") {
            const start = String(values.start ?? "")
            const end = String(values.end ?? "")
            const startValue = DateTime.fromISO(start); const endValue = DateTime.fromISO(end)
            if (!startValue.isValid || !endValue.isValid) throw new Error("请输入有效起止时间")
            const milliseconds = endValue.toMillis() - startValue.toMillis()
            setDiffStart(start); setDiffEnd(end)
            return { success: true, result: { milliseconds, seconds: milliseconds / 1000, minutes: milliseconds / 60000, hours: milliseconds / 3600000, days: milliseconds / 86400000 }, executed: true }
          }
          if (operation === "duration") {
            const value = String(values.value ?? "")
            const unit = String(values.durationUnit ?? values.unit ?? "seconds") as DurationUnit
            if (!(["milliseconds", "seconds", "minutes"] as string[]).includes(unit)) throw new Error("时长单位必须是毫秒、秒或分钟")
            const result = convertDuration(value, unit)
            setDurationValue(value); setDurationUnit(unit)
            return { success: true, result, executed: true }
          }
          if (operation === "parse-duration") {
            const value = String(values.value ?? "")
            const result = parseDuration(value)
            setDurationText(value)
            return { success: true, result, executed: true }
          }
          if (operation === "generate") {
            const kind = String(values.generator ?? "uuid")
            const nextLength = Number(values.length ?? 24)
            const result = generateIdentifier(kind, nextLength)
            setGenerator(kind); setLength(nextLength); setGenerated(result)
            toast.success(`小Q已生成${kind === "password" ? "密码" : "标识符"}`)
            return kind === "password" ? { success: true, result: "密码已生成，仅显示在 Quick 页面", sensitive: true, executed: true } : { success: true, result, executed: true }
          }
          if (operation === "cron") {
            const value = String(values.cron ?? "")
            const zone = String(values.zone ?? "Asia/Shanghai")
            const result = nextCronRuns(value, zone)
            setCron(value); setCronZone(zone); setCronResults(result); setCronError("")
            return { success: true, result, executed: true }
          }
          throw new Error(`不支持的时间操作：${operation}`)
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          if (operation === "cron") { setCronResults([]); setCronError(message) }
          return { success: false, error: message, executed: true }
        }
      },
    },
  })

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div>
          <h1 className="text-3xl font-semibold tracking-tight">时间与标识符</h1>
          <p className="mt-2 text-sm text-muted-foreground">处理时间戳、时区、日期差值、时间段、Cron，并生成常用唯一标识符与安全随机内容。</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Clock3 className="size-4" />Unix 时间戳 ↔ 日期时间</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
              <input className={inputClass} value={timestamp} onChange={(event) => setTimestamp(event.target.value)} />
              <select className={inputClass} value={timestampUnit} onChange={(event) => setTimestampUnit(event.target.value as typeof timestampUnit)}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{timestampResult}</pre>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input className={inputClass} type="datetime-local" step="1" value={dateInput} onChange={(event) => setDateInput(event.target.value)} />
              <select className={inputClass} value={sourceZone} onChange={(event) => setSourceZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{dateToTimestamp}</pre>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><CalendarClock className="size-4" />时区转换与日期差值</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select className={inputClass} value={sourceZone} onChange={(event) => setSourceZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
              <select className={inputClass} value={targetZone} onChange={(event) => setTargetZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
            </div>
            <div className={`${outputClass} mt-3`}>{timezoneResult}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{timezoneComparisons.map((item, index) => <label key={index} className="rounded-lg border bg-muted/20 p-2"><select className="app-interactive w-full bg-transparent text-xs font-medium outline-none" value={item.zone} onChange={(event) => setComparisonZones((zones) => zones.map((zone, itemIndex) => itemIndex === index ? event.target.value : zone))}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select><div className="mt-1 text-xs text-muted-foreground">{item.value}</div></label>)}</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">开始<input className={inputClass} type="datetime-local" value={diffStart} onChange={(event) => setDiffStart(event.target.value)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">结束<input className={inputClass} type="datetime-local" value={diffEnd} onChange={(event) => setDiffEnd(event.target.value)} /></label>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{difference}</pre>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex items-center gap-2 font-medium"><Hourglass className="size-4" />时间段转换</div>
            <p className="mt-1 text-xs text-muted-foreground">将秒、毫秒或分钟转换为小时、分钟、秒，结果精确到毫秒。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1.4fr)_auto]">
              <input className={inputClass} type="number" step="any" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} aria-label="时长数值" placeholder="例如 3661" />
              <select className={inputClass} value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as DurationUnit)} aria-label="时长单位"><option value="seconds">秒</option><option value="milliseconds">毫秒</option><option value="minutes">分钟</option></select>
              <pre className={`${outputClass} whitespace-pre-wrap`}>{durationResult}</pre>
              <Button variant="outline" size="icon" onClick={() => copy(durationResult)} aria-label="复制时间段结果"><Copy /></Button>
            </div>
            <div className="mt-4 border-t pt-4"><div className="mb-2 text-xs font-medium text-muted-foreground">可读时间段 → 数值</div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"><input className={inputClass} value={durationText} onChange={(event) => setDurationText(event.target.value)} placeholder="1d 2h 3m 4.5s 500ms 或 01:02:03" /><pre className={`${outputClass} whitespace-pre-wrap`}>{parsedDurationResult}</pre><Button variant="outline" size="icon" onClick={() => copy(parsedDurationResult)}><Copy /></Button></div></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Fingerprint className="size-4" />标识符与随机内容生成</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
              <select className={inputClass} value={generator} onChange={(event) => setGenerator(event.target.value)}>
                <option value="uuid">UUID</option><option value="guid">GUID</option><option value="ulid">ULID</option><option value="snowflake">雪花 ID</option><option value="string">随机字符串</option><option value="number">随机数字</option><option value="password">密码</option>
              </select>
              <input className={inputClass} type="number" min="1" max="4096" value={length} disabled={["uuid", "guid", "ulid", "snowflake"].includes(generator)} onChange={(event) => setLength(Number(event.target.value))} />
              <Button onClick={runGenerator}><RefreshCw />生成</Button>
            </div>
            <div className="mt-3 flex items-start gap-2"><div className={`${outputClass} min-w-0 flex-1`}>{generated || "点击生成"}</div><Button variant="outline" size="icon" disabled={!generated} onClick={() => copy(generated)}><Copy /></Button></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><TimerReset className="size-4" />Cron 表达式</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem_auto]">
              <input className={inputClass} value={cron} onChange={(event) => setCron(event.target.value)} placeholder="*/15 * * * *" />
              <select className={inputClass} value={cronZone} onChange={(event) => setCronZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
              <Button onClick={parseCron}><Play />解析</Button>
            </div>
            {cronError && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{cronError}</div>}
            <div className="mt-3 space-y-1 rounded-lg border bg-muted/30 p-3 font-mono text-xs">
              {cronResults.length ? cronResults.map((value, index) => <div key={value}>{index + 1}. {value}</div>) : <span className="text-muted-foreground">解析后显示接下来 6 次执行时间</span>}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

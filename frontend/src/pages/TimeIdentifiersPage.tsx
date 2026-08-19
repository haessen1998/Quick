import { useMemo, useState } from "react"
import { CalendarClock, Clock3, Copy, Fingerprint, Play, RefreshCw, Sparkles, TimerReset } from "lucide-react"
import { CronExpressionParser } from "cron-parser"
import { DateTime } from "luxon"
import { ulid } from "ulid"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const inputClass = "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const outputClass = "min-h-10 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all"
const timeZones = ["UTC", "Asia/Shanghai", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney"]

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

export default function TimeIdentifiersPage() {
  const [timestamp, setTimestamp] = useState(() => Math.floor(Date.now() / 1000).toString())
  const [timestampUnit, setTimestampUnit] = useState<"seconds" | "milliseconds">("seconds")
  const [dateInput, setDateInput] = useState(() => DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm:ss"))
  const [sourceZone, setSourceZone] = useState("Asia/Shanghai")
  const [targetZone, setTargetZone] = useState("UTC")
  const [diffStart, setDiffStart] = useState(() => DateTime.local().startOf("day").toFormat("yyyy-LL-dd'T'HH:mm"))
  const [diffEnd, setDiffEnd] = useState(() => DateTime.local().plus({ days: 1, hours: 2 }).startOf("hour").toFormat("yyyy-LL-dd'T'HH:mm"))
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

  const runGenerator = () => {
    try {
      const value = generator === "uuid" || generator === "guid" ? crypto.randomUUID()
        : generator === "ulid" ? ulid()
        : generator === "snowflake" ? generateSnowflake()
        : generator === "number" ? secureRandom(length, "0123456789")
        : generator === "password" ? secureRandom(length, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=")
        : secureRandom(length, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
      setGenerated(value)
    } catch (error) {
      toast.error("生成失败", { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const parseCron = () => {
    try {
      const expression = CronExpressionParser.parse(cron, { tz: cronZone })
      setCronResults(Array.from({ length: 6 }, () => DateTime.fromJSDate(expression.next().toDate()).setZone(cronZone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ")))
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

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div>
          <h1 className="text-3xl font-semibold tracking-tight">时间与标识符</h1>
          <p className="mt-2 text-sm text-muted-foreground">处理时间戳、时区、日期差值、Cron，并生成常用唯一标识符与安全随机内容。</p>
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
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">开始<input className={inputClass} type="datetime-local" value={diffStart} onChange={(event) => setDiffStart(event.target.value)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">结束<input className={inputClass} type="datetime-local" value={diffEnd} onChange={(event) => setDiffEnd(event.target.value)} /></label>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{difference}</pre>
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

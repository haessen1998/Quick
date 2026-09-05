import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { DurationUnit,inputClass,outputClass,timeZones,useTimeIdentifiersPageViewModel } from "@/models/TimeIdentifiersPageModel"
import { CalendarClock,Clock3,Copy,Fingerprint,Hourglass,Play,RefreshCw,Sparkles,TimerReset } from "lucide-react"

export default function TimeIdentifiersPage() {
 const { t, timestamp, setTimestamp, timestampUnit, setTimestampUnit, dateInput, setDateInput, sourceZone, setSourceZone, targetZone, setTargetZone, diffStart, setDiffStart, diffEnd, setDiffEnd, durationValue, setDurationValue, durationUnit, setDurationUnit, durationText, setDurationText, setComparisonZones, generator, setGenerator, length, setLength, generated, cron, setCron, cronZone, setCronZone, cronResults, cronError, timestampResult, dateToTimestamp, timezoneResult, difference, durationResult, parsedDurationResult, timezoneComparisons, runGenerator, parseCron, copy } = useTimeIdentifiersPageViewModel()
return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("开发工具")}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{uiText("时间与标识符")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiText("处理时间戳、时区、日期差值、时间段、Cron，并生成常用唯一标识符与安全随机内容。")}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Clock3 className="size-4" />{uiText("Unix 时间戳 ↔ 日期时间")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
              <input className={inputClass} value={timestamp} onChange={(event) => setTimestamp(event.target.value)} />
              <select className={inputClass} value={timestampUnit} onChange={(event) => setTimestampUnit(event.target.value as typeof timestampUnit)}><option value="seconds">{uiText("秒")}</option><option value="milliseconds">{uiText("毫秒")}</option></select>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{timestampResult}</pre>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input className={inputClass} type="datetime-local" step="1" value={dateInput} onChange={(event) => setDateInput(event.target.value)} />
              <select className={inputClass} value={sourceZone} onChange={(event) => setSourceZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{dateToTimestamp}</pre>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><CalendarClock className="size-4" />{uiText("时区转换与日期差值")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select className={inputClass} value={sourceZone} onChange={(event) => setSourceZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
              <select className={inputClass} value={targetZone} onChange={(event) => setTargetZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
            </div>
            <div className={`${outputClass} mt-3`}>{timezoneResult}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{timezoneComparisons.map((item, index) => <label key={index} className="rounded-lg border bg-muted/20 p-2"><select className="app-interactive w-full bg-transparent text-xs font-medium outline-none" value={item.zone} onChange={(event) => setComparisonZones((zones) => zones.map((zone, itemIndex) => itemIndex === index ? event.target.value : zone))}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select><div className="mt-1 text-xs text-muted-foreground">{item.value}</div></label>)}</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">{uiText("开始")}<input className={inputClass} type="datetime-local" value={diffStart} onChange={(event) => setDiffStart(event.target.value)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">{uiText("结束")}<input className={inputClass} type="datetime-local" value={diffEnd} onChange={(event) => setDiffEnd(event.target.value)} /></label>
            </div>
            <pre className={`${outputClass} mt-3 whitespace-pre-wrap`}>{difference}</pre>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex items-center gap-2 font-medium"><Hourglass className="size-4" />{uiText("时间段转换")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{uiText("将秒、毫秒或分钟转换为小时、分钟、秒，结果精确到毫秒。")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1.4fr)_auto]">
              <input className={inputClass} type="number" step="any" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} aria-label={uiText("时长数值")} placeholder={uiText("例如 3661")} />
              <select className={inputClass} value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as DurationUnit)} aria-label={uiText("时长单位")}><option value="seconds">{uiText("秒")}</option><option value="milliseconds">{uiText("毫秒")}</option><option value="minutes">{uiText("分钟")}</option></select>
              <pre className={`${outputClass} whitespace-pre-wrap`}>{durationResult}</pre>
              <Button variant="outline" size="icon" onClick={() => copy(durationResult)} aria-label={uiText("复制时间段结果")}><Copy /></Button>
            </div>
            <div className="mt-4 border-t pt-4"><div className="mb-2 text-xs font-medium text-muted-foreground">{uiText("可读时间段 → 数值")}</div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"><input className={inputClass} value={durationText} onChange={(event) => setDurationText(event.target.value)} placeholder={uiText("1d 2h 3m 4.5s 500ms 或 01:02:03")} /><pre className={`${outputClass} whitespace-pre-wrap`}>{parsedDurationResult}</pre><Button variant="outline" size="icon" onClick={() => copy(parsedDurationResult)}><Copy /></Button></div></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Fingerprint className="size-4" />{uiText("标识符与随机内容生成")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
              <select className={inputClass} value={generator} onChange={(event) => setGenerator(event.target.value)}>
                <option value="uuid">UUID</option><option value="guid">GUID</option><option value="ulid">ULID</option><option value="snowflake">{uiText("雪花 ID")}</option><option value="string">{uiText("随机字符串")}</option><option value="number">{uiText("随机数字")}</option><option value="password">{uiText("密码")}</option>
              </select>
              <input className={inputClass} type="number" min="1" max="4096" value={length} disabled={["uuid", "guid", "ulid", "snowflake"].includes(generator)} onChange={(event) => setLength(Number(event.target.value))} />
              <Button onClick={runGenerator}><RefreshCw />{uiText("生成")}</Button>
            </div>
            <div className="mt-3 flex items-start gap-2"><div className={`${outputClass} min-w-0 flex-1`}>{generated || t("点击生成")}</div><Button variant="outline" size="icon" disabled={!generated} onClick={() => copy(generated)}><Copy /></Button></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><TimerReset className="size-4" />{uiText("Cron 表达式")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem_auto]">
              <input className={inputClass} value={cron} onChange={(event) => setCron(event.target.value)} placeholder="*/15 * * * *" />
              <select className={inputClass} value={cronZone} onChange={(event) => setCronZone(event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select>
              <Button onClick={parseCron}><Play />{uiText("解析")}</Button>
            </div>
            {cronError && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{cronError}</div>}
            <div className="mt-3 space-y-1 rounded-lg border bg-muted/30 p-3 font-mono text-xs">
              {cronResults.length ? cronResults.map((value, index) => <div key={value}>{index + 1}. {value}</div>) : <span className="text-muted-foreground">{uiText("解析后显示接下来 6 次执行时间")}</span>}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

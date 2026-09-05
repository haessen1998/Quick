import { recordManualOperation } from "@/lib/tool-results"
import { CryptoService } from "@/../bindings/github.com/haessen1998/Quick/internal/crypto"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage, type AppLanguage } from "@/lib/i18n"
import { useSmartInput } from "@/lib/smart-input"
import { useDraftState } from "@/lib/workspace-store"
import { CronExpressionParser } from "cron-parser"
import { DateTime } from "luxon"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"

export const inputClass =
  "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

export const outputClass = "min-h-10 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all"

export const timeZones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
]

export type DurationUnit = "milliseconds" | "seconds" | "minutes"

export function convertDuration(value: string, unit: DurationUnit, language: AppLanguage = "zh-CN") {
  if (!value.trim()) throw new Error(language === "en-US" ? "Enter a duration" : "请输入时长")
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(language === "en-US" ? "Enter a valid duration" : "请输入有效时长")
  const multiplier = unit === "minutes" ? 60_000 : unit === "seconds" ? 1_000 : 1
  const converted = numeric * multiplier
  if (!Number.isFinite(converted) || Math.abs(converted) > Number.MAX_SAFE_INTEGER)
    throw new Error(language === "en-US" ? "Duration exceeds the safe calculation range" : "时长超出安全计算范围")
  const totalMilliseconds = Math.round(converted)
  let remainder = Math.abs(totalMilliseconds)
  const hours = Math.floor(remainder / 3_600_000)
  remainder %= 3_600_000
  const minutes = Math.floor(remainder / 60_000)
  remainder %= 60_000
  const seconds = Math.floor(remainder / 1_000)
  const milliseconds = remainder % 1_000
  const sign = totalMilliseconds < 0 ? "-" : ""
  const formatted =
    language === "en-US"
      ? `${sign}${hours} hr ${minutes} min ${seconds} sec${milliseconds ? ` ${milliseconds} ms` : ""}`
      : `${sign}${hours} 小时 ${minutes} 分钟 ${seconds} 秒${milliseconds ? ` ${milliseconds} 毫秒` : ""}`
  return { formatted, totalMilliseconds, hours, minutes, seconds, milliseconds }
}

export function parseDuration(value: string, language: AppLanguage = "zh-CN") {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(language === "en-US" ? "Enter a duration, such as 1h 2m 3.5s" : "请输入时间段，例如 1h 2m 3.5s")
  let milliseconds = 0
  const colon = trimmed.match(/^([+-])?(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/)
  if (colon) milliseconds = (Number(colon[2]) * 3600 + Number(colon[3]) * 60 + Number(colon[4] ?? 0)) * 1000 * (colon[1] === "-" ? -1 : 1)
  else {
    const normalized = trimmed
      .toLowerCase()
      .replace(/毫秒/g, "ms")
      .replace(/小时|时/g, "h")
      .replace(/分钟|分/g, "m")
      .replace(/秒/g, "s")
      .replace(/天/g, "d")
    const matches = [...normalized.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/g)]
    if (!matches.length || normalized.replace(/([+-]?\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/g, "").trim())
      throw new Error(
        language === "en-US"
          ? "Unrecognized duration; use 1d 2h 3m 4s 500ms or HH:MM:SS"
          : "无法识别时间段；支持 1d 2h 3m 4s 500ms 或 HH:MM:SS",
      )
    const factors = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }
    milliseconds = matches.reduce((total, match) => total + Number(match[1]) * factors[match[2] as keyof typeof factors], 0)
  }
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > Number.MAX_SAFE_INTEGER)
    throw new Error(language === "en-US" ? "Duration exceeds the safe calculation range" : "时间段超出安全计算范围")
  const rounded = Math.round(milliseconds)
  const readable = convertDuration(String(rounded), "milliseconds", language)
  return { ...readable, seconds: rounded / 1000, minutesTotal: rounded / 60000, hoursTotal: rounded / 3600000 }
}

export function nextCronRuns(value: string, zone: string) {
  const expression = CronExpressionParser.parse(value, { tz: zone })
  return Array.from({ length: 6 }, () => DateTime.fromJSDate(expression.next().toDate()).setZone(zone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ"))
}

function useTimeIdentifiersPageModel() {
  const { language, t } = useLanguage()
  const [timestamp, setTimestamp] = useDraftState("time-ids", "timestamp", () => Math.floor(Date.now() / 1000).toString())
  const [timestampUnit, setTimestampUnit] = useDraftState<"seconds" | "milliseconds">("time-ids", "timestampUnit", "seconds")
  const [dateInput, setDateInput] = useDraftState("time-ids", "dateInput", () => DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm:ss"))
  const [sourceZone, setSourceZone] = useDraftState("time-ids", "sourceZone", "Asia/Shanghai")
  const [targetZone, setTargetZone] = useDraftState("time-ids", "targetZone", "UTC")
  const [diffStart, setDiffStart] = useDraftState("time-ids", "diffStart", () =>
    DateTime.local().startOf("day").toFormat("yyyy-LL-dd'T'HH:mm"),
  )
  const [diffEnd, setDiffEnd] = useDraftState("time-ids", "diffEnd", () =>
    DateTime.local().plus({ days: 1, hours: 2 }).startOf("hour").toFormat("yyyy-LL-dd'T'HH:mm"),
  )
  const [durationValue, setDurationValue] = useDraftState("time-ids", "durationValue", "3661")
  const [durationUnit, setDurationUnit] = useDraftState<DurationUnit>("time-ids", "durationUnit", "seconds")
  const [durationText, setDurationText] = useDraftState("time-ids", "durationText", "1h 1m 1s")
  const [comparisonZones, setComparisonZones] = useDraftState("time-ids", "comparisonZones", [
    "Asia/Shanghai",
    "UTC",
    "America/New_York",
    "Europe/London",
  ])
  const [generator, setGenerator] = useDraftState("time-ids", "generator", "uuid")
  const [length, setLength] = useDraftState("time-ids", "length", 24)
  const [generated, setGenerated] = useDraftState("time-ids", "generated", "")
  const [cron, setCron] = useDraftState("time-ids", "cron", "*/15 * * * *")
  const [cronZone, setCronZone] = useDraftState("time-ids", "cronZone", "Asia/Shanghai")
  const [cronResults, setCronResults] = useDraftState<string[]>("time-ids", "cronResults", [])
  const [cronError, setCronError] = useDraftState("time-ids", "cronError", "")

  const timestampResult = useMemo(() => {
    const numeric = Number(timestamp)
    if (!Number.isFinite(numeric)) return t("请输入有效时间戳")
    const millis = timestampUnit === "seconds" ? numeric * 1000 : numeric
    const value = DateTime.fromMillis(millis)
    return value.isValid ? `${value.toFormat("yyyy-LL-dd HH:mm:ss.SSS ZZZZ")}\n${value.toUTC().toISO()}` : t("时间戳超出有效范围")
  }, [t, timestamp, timestampUnit])

  const dateToTimestamp = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    if (!value.isValid) return t("请输入有效日期时间")
    return language === "en-US"
      ? `Seconds: ${Math.floor(value.toMillis() / 1000)}\nMilliseconds: ${value.toMillis()}`
      : `秒：${Math.floor(value.toMillis() / 1000)}\n毫秒：${value.toMillis()}`
  }, [dateInput, language, sourceZone, t])

  const timezoneResult = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    if (!value.isValid) return t("请输入有效日期时间")
    return value.setZone(targetZone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ")
  }, [dateInput, sourceZone, t, targetZone])

  const difference = useMemo(() => {
    const start = DateTime.fromISO(diffStart)
    const end = DateTime.fromISO(diffEnd)
    if (!start.isValid || !end.isValid) return t("请输入有效起止时间")
    const milliseconds = end.toMillis() - start.toMillis()
    const sign = milliseconds < 0 ? "-" : ""
    let remainder = Math.abs(milliseconds)
    const days = Math.floor(remainder / 86_400_000)
    remainder %= 86_400_000
    const hours = Math.floor(remainder / 3_600_000)
    remainder %= 3_600_000
    const minutes = Math.floor(remainder / 60_000)
    remainder %= 60_000
    const seconds = Math.floor(remainder / 1000)
    return language === "en-US"
      ? `${sign}${days} days ${hours} hr ${minutes} min ${seconds} sec\nTotal: ${milliseconds} ms`
      : `${sign}${days} 天 ${hours} 小时 ${minutes} 分钟 ${seconds} 秒\n总计：${milliseconds} ms`
  }, [diffStart, diffEnd, language, t])

  const durationResult = useMemo(() => {
    try {
      const result = convertDuration(durationValue, durationUnit, language)
      return language === "en-US"
        ? `${result.formatted}\nTotal: ${result.totalMilliseconds} ms`
        : `${result.formatted}\n总计：${result.totalMilliseconds} 毫秒`
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [durationValue, durationUnit, language])
  const parsedDurationResult = useMemo(() => {
    try {
      const result = parseDuration(durationText, language)
      return language === "en-US"
        ? `${result.formatted}\nMilliseconds: ${result.totalMilliseconds}\nSeconds: ${result.seconds}\nMinutes: ${result.minutesTotal}`
        : `${result.formatted}\n毫秒：${result.totalMilliseconds}\n秒：${result.seconds}\n分钟：${result.minutesTotal}`
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [durationText, language])
  const timezoneComparisons = useMemo(() => {
    const value = DateTime.fromISO(dateInput, { zone: sourceZone })
    return comparisonZones.map((zone) => ({
      zone,
      value: value.isValid ? value.setZone(zone).toFormat("yyyy-LL-dd HH:mm:ss ZZZZ") : t("无效时间"),
    }))
  }, [comparisonZones, dateInput, sourceZone, t])

  useSmartInput("time-ids", (values) => {
    const operation = String(values.operation ?? "")
    if (operation === "timestamp-to-date") {
      setTimestamp(String(values.value ?? ""))
      setTimestampUnit(values.unit === "milliseconds" ? "milliseconds" : "seconds")
    }
    if (operation === "cron") {
      setCron(String(values.cron ?? ""))
      setCronZone(String(values.zone ?? "Asia/Shanghai"))
    }
    if (operation === "show-identifier") {
      setGenerator("uuid")
      setGenerated(String(values.value ?? ""))
    }
  })

  const runGenerator = async () => {
    try {
      setGenerated(await recordManualOperation("time-ids", generator, () => CryptoService.GenerateIdentifier(generator, length), { input: { operation: "generate", generator, length }, replayAction: "run" }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t("生成失败"), { description: t(message) })
    }
  }

  const parseCron = async () => {
    try {
      setCronResults(await recordManualOperation("time-ids", "cron", () => nextCronRuns(cron, cronZone), { input: { operation: "cron", cron, zone: cronZone }, replayAction: "run" }))
      setCronError("")
    } catch (error) {
      setCronResults([])
      setCronError(error instanceof Error ? error.message : String(error))
    }
  }

  const copy = async (value: string) => {
    await writeClipboard(value)
    toast.success("已复制")
  }

  useAssistantCapability({
    page: "time-ids",
    getContext: () => ({
      timestamp,
      timestampUnit,
      dateInput,
      sourceZone,
      targetZone,
      comparisonZones,
      diffStart,
      diffEnd,
      durationValue,
      durationUnit,
      durationResult,
      durationText,
      parsedDurationResult,
      generator,
      length,
      generated: generated ? "已生成（值不暴露给助手）" : "",
      cron,
      cronZone,
      cronResults,
      cronError,
    }),
    actions: {
      run: async (values) => {
        const operation = String(values.operation ?? "")
        try {
          if (operation === "timestamp-to-date") {
            const nextTimestamp = String(values.value ?? "")
            const unit = values.unit === "milliseconds" ? "milliseconds" : "seconds"
            const numeric = Number(nextTimestamp)
            if (!Number.isFinite(numeric)) throw new Error("请输入有效时间戳")
            const result = DateTime.fromMillis(unit === "seconds" ? numeric * 1000 : numeric)
            if (!result.isValid) throw new Error("时间戳超出有效范围")
            setTimestamp(nextTimestamp)
            setTimestampUnit(unit)
            return {
              success: true,
              result: `${result.toFormat("yyyy-LL-dd HH:mm:ss.SSS ZZZZ")}\n${result.toUTC().toISO()}`,
              executed: true,
            }
          }
          if (operation === "date-to-timestamp") {
            const value = String(values.value ?? "")
            const zone = String(values.sourceZone ?? "Asia/Shanghai")
            const result = DateTime.fromISO(value, { zone })
            if (!result.isValid) throw new Error(result.invalidExplanation || "请输入有效日期时间")
            setDateInput(value)
            setSourceZone(zone)
            return {
              success: true,
              result: { seconds: Math.floor(result.toMillis() / 1000), milliseconds: result.toMillis() },
              executed: true,
            }
          }
          if (operation === "timezone") {
            const value = String(values.value ?? "")
            const from = String(values.sourceZone ?? "Asia/Shanghai")
            const to = String(values.targetZone ?? "UTC")
            const parsed = DateTime.fromISO(value, { zone: from })
            if (!parsed.isValid) throw new Error(parsed.invalidExplanation || "请输入有效日期时间")
            const converted = parsed.setZone(to)
            if (!converted.isValid) throw new Error(converted.invalidExplanation || "无效时区")
            setDateInput(value)
            setSourceZone(from)
            setTargetZone(to)
            return { success: true, result: converted.toFormat("yyyy-LL-dd HH:mm:ss ZZZZ"), executed: true }
          }
          if (operation === "difference") {
            const start = String(values.start ?? "")
            const end = String(values.end ?? "")
            const startValue = DateTime.fromISO(start)
            const endValue = DateTime.fromISO(end)
            if (!startValue.isValid || !endValue.isValid) throw new Error("请输入有效起止时间")
            const milliseconds = endValue.toMillis() - startValue.toMillis()
            setDiffStart(start)
            setDiffEnd(end)
            return {
              success: true,
              result: {
                milliseconds,
                seconds: milliseconds / 1000,
                minutes: milliseconds / 60000,
                hours: milliseconds / 3600000,
                days: milliseconds / 86400000,
              },
              executed: true,
            }
          }
          if (operation === "duration") {
            const value = String(values.value ?? "")
            const unit = String(values.durationUnit ?? values.unit ?? "seconds") as DurationUnit
            if (!(["milliseconds", "seconds", "minutes"] as string[]).includes(unit)) throw new Error("时长单位必须是毫秒、秒或分钟")
            const result = convertDuration(value, unit, language)
            setDurationValue(value)
            setDurationUnit(unit)
            return { success: true, result, executed: true }
          }
          if (operation === "parse-duration") {
            const value = String(values.value ?? "")
            const result = parseDuration(value, language)
            setDurationText(value)
            return { success: true, result, executed: true }
          }
          if (operation === "generate") {
            const kind = String(values.generator ?? "uuid")
            const nextLength = Number(values.length ?? 24)
            const result = await CryptoService.GenerateIdentifier(kind, nextLength)
            setGenerator(kind)
            setLength(nextLength)
            setGenerated(result)
            toast.success(`小Q已生成${kind === "password" ? "密码" : "标识符"}`)
            return kind === "password"
              ? { success: true, result: "密码已生成，仅显示在 Quick 页面", sensitive: true, executed: true }
              : { success: true, result, executed: true }
          }
          if (operation === "cron") {
            const value = String(values.cron ?? "")
            const zone = String(values.zone ?? "Asia/Shanghai")
            const result = nextCronRuns(value, zone)
            setCron(value)
            setCronZone(zone)
            setCronResults(result)
            setCronError("")
            return { success: true, result, executed: true }
          }
          throw new Error(`不支持的时间操作：${operation}`)
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          if (operation === "cron") {
            setCronResults([])
            setCronError(message)
          }
          return { success: false, error: message, executed: true }
        }
      },
    },
  })

  return {
    t,
    timestamp,
    setTimestamp,
    timestampUnit,
    setTimestampUnit,
    dateInput,
    setDateInput,
    sourceZone,
    setSourceZone,
    targetZone,
    setTargetZone,
    diffStart,
    setDiffStart,
    diffEnd,
    setDiffEnd,
    durationValue,
    setDurationValue,
    durationUnit,
    setDurationUnit,
    durationText,
    setDurationText,
    setComparisonZones,
    generator,
    setGenerator,
    length,
    setLength,
    generated,
    cron,
    setCron,
    cronZone,
    setCronZone,
    cronResults,
    cronError,
    timestampResult,
    dateToTimestamp,
    timezoneResult,
    difference,
    durationResult,
    parsedDurationResult,
    timezoneComparisons,
    runGenerator,
    parseCron,
    copy,
  }
}

const ModelContext = createContext<ReturnType<typeof useTimeIdentifiersPageModel> | null>(null)
export function TimeIdentifiersPageModelProvider(props: { children: ReactNode }) {
  const model = useTimeIdentifiersPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useTimeIdentifiersPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("TimeIdentifiersPageModelProvider missing")
  return value
}

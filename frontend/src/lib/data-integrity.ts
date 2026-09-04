import { isLosslessNumber, parse, stringify } from "lossless-json"

/** Formatting must never round an identifier or decimal. */
export function formatJSON(input: string, indent: number = 2, expand = false): string {
  const expandValue = (value: unknown): unknown => {
    if (isLosslessNumber(value)) return value
    if (Array.isArray(value)) return value.map(expandValue)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandValue(item)]))
    if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
      try {
        return expandValue(parse(value))
      } catch {
        /* Ordinary strings remain strings. */
      }
    }
    return value
  }
  const value = parse(input)
  return stringify(expand ? expandValue(value) : value, undefined, indent) ?? "null"
}

/** Conversion may not silently round values when a target cannot represent them. */
export function parseJSONForConversion(input: string): unknown {
  return parse(input, undefined, {
    parseNumber: (raw: string) => {
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) throw new Error(`数字超出目标格式范围：${raw}`)
      if (/^-?\d+$/.test(raw) && !Number.isSafeInteger(numeric)) throw new Error(`转换会丢失整数精度：${raw}。请显式将该字段改为字符串。`)
      // A decimal must round-trip without changing its mathematical value.
      if (decimalCanonical(raw) !== decimalCanonical(String(numeric)))
        throw new Error(`转换会丢失小数精度：${raw}。请显式将该字段改为字符串。`)
      return numeric
    },
  })
}

function decimalCanonical(raw: string): string {
  const [mantissa, exponent = "0"] = raw.toLowerCase().split("e")
  const negative = mantissa.startsWith("-")
  const unsigned = mantissa.replace(/^[+-]/, "")
  const [whole, fraction = ""] = unsigned.split(".")
  const digits = (whole + fraction).replace(/^0+/, "").replace(/0+$/, "")
  if (!digits) return "0"
  const trailing = (whole + fraction).match(/0+$/)?.[0].length ?? 0
  return `${negative ? "-" : ""}${digits}e${Number(exponent) - fraction.length + trailing}`
}

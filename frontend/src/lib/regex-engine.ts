export type RegexCase = { input: string; expected: boolean; label?: string }
export type RegexJob = { kind: "matches" | "preview" | "tests" | "replace"; expression: string; flags: string; input: string; replacement?: string; cases?: RegexCase[] }
export function runRegexJob(job: RegexJob): unknown {
  if (job.input.length > 1_000_000 || job.expression.length > 10_000 || (job.cases?.length ?? 0) > 100) throw new Error("正则输入超过限制")
  const flags = [...new Set(job.flags.replace(/[^dgimsuvy]/g, ""))].join("")
  if (job.kind === "replace") return job.input.replace(new RegExp(job.expression, flags), job.replacement ?? "")
  if (job.kind === "tests") {
    const regex = new RegExp(job.expression, flags.replace(/[gy]/g, ""))
    return (job.cases ?? []).map(item => {
      if (item.input.length > 100_000) throw new Error("测试样例过长")
      const actual = regex.test(item.input)
      return { ...item, actual, passed: actual === item.expected }
    })
  }
  if (job.kind === "matches") {
    const regex = new RegExp(job.expression, flags)
    const matches = flags.includes("g") ? job.input.matchAll(regex) : [regex.exec(job.input)].filter((m): m is RegExpExecArray => m !== null)
    const result: { value: string; index: number; groups: Record<string, string>; captures: string[] }[] = []
    for (const match of matches) {
      if (result.length >= 10000) throw new Error("匹配结果超过 10000 项，请缩小输入范围")
      result.push({ value: match[0], index: match.index, groups: match.groups ?? {}, captures: match.slice(1) })
    }
    return JSON.stringify(result, null, 2)
  }
  const regex = new RegExp(job.expression, flags.replace(/[gy]/g, "") + "g")
  const segments: { value: string; match: boolean }[] = []
  let index = 0
  for (const match of job.input.matchAll(regex)) {
    if (segments.length > 20000) throw new Error("高亮结果过多，请缩小输入范围")
    const start = match.index ?? 0
    if (start > index) segments.push({ value: job.input.slice(index, start), match: false })
    if (match[0]) segments.push({ value: match[0], match: true })
    index = start + match[0].length
  }
  if (index < job.input.length) segments.push({ value: job.input.slice(index), match: false })
  return { segments, replacement: job.input.replace(new RegExp(job.expression, flags), job.replacement ?? "") }
}

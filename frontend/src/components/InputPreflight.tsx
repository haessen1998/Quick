import { useEffect, useRef, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"
import { checkInput, type PreflightInput } from "@/lib/input-preflight"
import { useLanguage } from "@/lib/i18n"

export function InputPreflight({ identity, ...value }: PreflightInput & { identity: string }) {
  const { t } = useLanguage()
  const signature = JSON.stringify([value.input, value.expression, value.flags])
  const previous = useRef({ identity, signature })
  const [retained, setRetained] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; message: string | null } | null>(null)
  const key = identity + signature
  useEffect(() => {
    if (previous.current.identity !== identity && previous.current.signature === signature) {
      setRetained(signature)
    } else if (previous.current.signature !== signature) {
      setRetained(null)
    }
    previous.current = { identity, signature }
    const timer = setTimeout(() => setResult({ key, message: checkInput(value) }), 250)
    return () => clearTimeout(timer)
  }, [identity, signature, key])
  const issue = result?.key === key ? result.message : null
  const switched = retained === signature && Boolean(value.input || value.expression)
  if (!issue && !switched) return null
  const Icon = issue ? TriangleAlert : Info
  return (
    <div role="status" data-slot="input-preflight" className="m-4 flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{t("输入格式提醒")}</p>
        {switched && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t("已切换工具，原有输入仍保留。请确认数据和表达式适用于当前工具，或点击载入示例。")}
          </p>
        )}
        {issue && <p className="break-all text-xs leading-5 text-muted-foreground">{t(issue)}</p>}
      </div>
    </div>
  )
}

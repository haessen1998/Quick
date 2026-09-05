import { Popover } from "radix-ui"
import { Button } from "@/components/ui/button"
import { useEffect, useRef, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"
import { checkInput, type PreflightInput } from "@/lib/input-preflight"
import { useLanguage } from "@/lib/i18n"

export function InputPreflight({ identity, compact = false, resetKey = 0, ...value }: PreflightInput & { identity: string; compact?: boolean; resetKey?: number }) {
  const { t } = useLanguage()
  const signature = JSON.stringify([value.input, value.expression, value.flags])
  const previous = useRef({ identity, signature, resetKey })
  const [retained, setRetained] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; message: string | null } | null>(null)
  const key = identity + signature
  useEffect(() => {
    if (previous.current.resetKey !== resetKey) {
      setRetained(null)
    } else if (previous.current.identity !== identity && previous.current.signature === signature) {
      setRetained(signature)
    } else if (previous.current.signature !== signature) {
      setRetained(null)
    }
    previous.current = { identity, signature, resetKey }
    const timer = setTimeout(() => setResult({ key, message: checkInput(value) }), 250)
    return () => clearTimeout(timer)
  }, [identity, signature, key, resetKey])
  const issue = result?.key === key ? result.message : null
  const switched = retained === signature && Boolean(value.input || value.expression)
  if (compact)
    return (
      <div className="flex h-10 items-center border-b px-4 text-xs text-muted-foreground" data-slot="preflight-bar">
        {issue || switched ? (
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="xs" className="-ml-2" data-slot="input-preflight">
                <TriangleAlert />
                {t("输入格式提醒")}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                sideOffset={8}
                align="start"
                className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md"
              >
                <div role="status" className="space-y-2">
                  <p className="font-medium">{t("输入格式提醒")}</p>
                  {switched && (
                    <p className="text-xs leading-5">
                      {t("已切换工具，原有输入仍保留。请确认数据和表达式适用于当前工具，或点击载入示例。")}
                    </p>
                  )}
                  {issue && <p className="break-all text-xs leading-5">{t(issue)}</p>}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : (
          <span>{t(value.input ? "输入格式检查" : "等待输入内容")}</span>
        )}
      </div>
    )
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

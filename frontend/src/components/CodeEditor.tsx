import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useMemo, useRef, type TextareaHTMLAttributes } from "react"

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }
export function CodeEditor({ className, value = "", error, ...props }: Props) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const text = String(value)
  const lines = useMemo(() => Math.min(text.split("\n").length, 10000), [text])
  const location = useMemo(() => {
    if (!error) return null
    const line = error.match(/(?:line|第)\s*(\d+)/i)
    if (line) return Math.max(1, Number(line[1]))
    const position = error.match(/position\s+(\d+)/i)
    return position ? text.slice(0, Number(position[1])).split("\n").length : null
  }, [error, text])
  const revealError = () => {
    if (!location || !editor.current) return
    const before = text
      .split("\n")
      .slice(0, location - 1)
      .join("\n")
    const start = before.length + (location > 1 ? 1 : 0)
    editor.current.focus()
    editor.current.setSelectionRange(start, text.indexOf("\n", start) < 0 ? text.length : text.indexOf("\n", start))
    editor.current.scrollTop = Math.max(0, (location - 3) * 24)
  }
  return (
    <div className="min-w-0">
      {location && (
        <Button type="button" variant="ghost" size="sm" className="m-2 text-destructive" onClick={revealError}>
          {uiText("定位错误：第")}
          {location} {uiText("行")}
        </Button>
      )}
      <div className="relative flex min-w-0 overflow-hidden bg-background focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/50">
        <div
          ref={gutter}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-12 overflow-hidden border-r bg-muted/30 py-4 pr-2 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className={i + 1 === location ? "bg-destructive/15 text-destructive" : ""}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          {...props}
          ref={editor}
          value={value}
          wrap="off"
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full min-w-0 resize-y bg-transparent py-4 pr-4 pl-14 font-mono text-sm leading-6 outline-none",
            className,
            "pl-14!",
          )}
          onScroll={(event) => {
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
            props.onScroll?.(event)
          }}
        />
      </div>
    </div>
  )
}

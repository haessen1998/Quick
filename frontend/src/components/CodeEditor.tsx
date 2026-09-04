import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useLineNumbers } from "@/lib/editor-settings"
import { useLayoutEffect, useMemo, useRef, type TextareaHTMLAttributes } from "react"

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }
export function CodeEditor({ className, value = "", error, ...props }: Props) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const showLineNumbers = useLineNumbers()
  const gutter = useRef<HTMLDivElement>(null)
  const text = String(value)
  const lines = useMemo(() => Math.min(text.split("\n").length, 10000), [text])
  useLayoutEffect(() => {
    if (gutter.current && editor.current) gutter.current.style.transform = `translateY(${-editor.current.scrollTop}px)`
  }, [text, showLineNumbers])
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
      <div className="relative flex min-w-0 overflow-hidden bg-background focus-within:outline-1 focus-within:-outline-offset-1 focus-within:outline-ring/50">
        {showLineNumbers && (
          <div data-slot="editor-gutter" className="relative w-12 shrink-0 overflow-hidden border-r bg-muted/40" aria-hidden>
            <div
              ref={gutter}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 py-4 pr-2 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
            >
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className={i + 1 === location ? "bg-destructive/15 text-destructive" : ""}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
        <textarea
          {...props}
          ref={editor}
          value={value}
          wrap="off"
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full min-w-0 resize-y bg-transparent py-4 pr-4 pl-14 font-mono text-sm leading-6 outline-none",
            className,
            "w-0! flex-1 rounded-none! border-0! px-3! py-4! shadow-none! focus-visible:ring-0!",
          )}
          onScroll={(event) => {
            if (gutter.current) gutter.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`
            props.onScroll?.(event)
          }}
        />
      </div>
    </div>
  )
}

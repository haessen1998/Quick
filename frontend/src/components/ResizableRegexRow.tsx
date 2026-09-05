import { useRef, useLayoutEffect, useState, type CSSProperties, type ReactNode, type PointerEvent } from "react"
import { useDraftState } from "@/lib/workspace-store"
import { uiText } from "@/lib/i18n"

export function ResizableRegexRow({ children, row }: { children: ReactNode; row: "match" | "replace" }) {
  const defaultHeight = row === "match" ? 280 : 364
  const minHeight = row === "match" ? 180 : 300
  const drag = useRef<{ y: number; height: number } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useDraftState("validation", `row-${row}-left`, 50)
  const [height, setHeight] = useDraftState("validation", `row-${row}-height`, defaultHeight)
  const [size, setSize] = useState({ width: 0, height: 660 })
  useLayoutEffect(() => {
    if (!grid.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(grid.current)
    return () => observer.disconnect()
  }, [])
  const clamp = (value: number, axis: "x" | "y") => {
    const min = axis === "x" ? Math.min(50, size.width ? (220 / size.width) * 100 : 30) : minHeight
    const max = axis === "x" ? Math.max(50, size.width ? 100 - (220 / size.width) * 100 : 70) : 900
    return Math.max(min, Math.min(max, value))
  }
  const shownLeft = clamp(left, "x")
  const shownHeight = clamp(height, "y")
  const move = (event: PointerEvent<HTMLDivElement>, axis: "x" | "y") => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !grid.current) return
    const box = grid.current.getBoundingClientRect()
    const value =
      axis === "x"
        ? ((event.clientX - box.left) / box.width) * 100
        : drag.current
          ? drag.current.height + event.pageY - drag.current.y
          : shownHeight
    ;(axis === "x" ? setLeft : setHeight)(clamp(value, axis))
  }
  return (
    <div
      ref={grid}
      data-slot="regex-row"
      data-row={row}
      className="relative grid overflow-hidden rounded-lg border pb-2 md:h-[var(--regex-height)] md:grid-cols-[var(--regex-columns)]"
      style={{ "--regex-columns": `${shownLeft}fr ${100 - shownLeft}fr`, "--regex-height": `${shownHeight}px` } as CSSProperties}
    >
      {children}
      {(["x", "y"] as const).map((axis) => (
        <div
          key={axis}
          role="separator"
          tabIndex={0}
          aria-label={uiText(
            axis === "x" ? (row === "match" ? "调整匹配行列宽" : "调整替换行列宽") : row === "match" ? "调整匹配行高度" : "调整替换行高度",
          )}
          aria-orientation={axis === "x" ? "vertical" : "horizontal"}
          aria-valuemin={Math.round(clamp(0, axis))}
          aria-valuemax={Math.round(clamp(axis === "x" ? 100 : 900, axis))}
          aria-valuenow={Math.round(axis === "x" ? shownLeft : shownHeight)}
          className={`absolute z-10 hidden touch-none items-center justify-center outline-none hover:bg-primary/15 focus-visible:bg-primary/15 md:flex ${axis === "x" ? "top-0 bottom-2 w-2 -translate-x-1/2 cursor-col-resize" : "inset-x-0 bottom-0 h-2 cursor-row-resize border-t bg-muted/30"}`}
          style={axis === "x" ? { left: `${shownLeft}%` } : undefined}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            drag.current = { y: event.pageY, height: shownHeight }
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => move(event, axis)}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onLostPointerCapture={() => {
            drag.current = null
          }}
          onDoubleClick={() => (axis === "x" ? setLeft : setHeight)(axis === "x" ? 50 : defaultHeight)}
          onKeyDown={(event) => {
            const previous = axis === "x" ? "ArrowLeft" : "ArrowUp"
            const next = axis === "x" ? "ArrowRight" : "ArrowDown"
            if (![previous, next, "Home"].includes(event.key)) return
            event.preventDefault()
            const reset = axis === "x" ? 50 : defaultHeight
            const value =
              event.key === "Home"
                ? reset
                : (axis === "x" ? shownLeft : shownHeight) + (event.key === previous ? -1 : 1) * (axis === "x" ? 2 : 16)
            ;(axis === "x" ? setLeft : setHeight)(clamp(value, axis))
          }}
        >
          <span className={axis === "x" ? "h-7 w-1 rounded-full bg-border" : "h-1 w-7 rounded-full bg-border"} />
        </div>
      ))}
    </div>
  )
}

import { useRef, useLayoutEffect, useState, type CSSProperties, type ReactNode, type PointerEvent } from "react"
import { useDraftState } from "@/lib/workspace-store"
import { uiText } from "@/lib/i18n"

export function ResizableRegexGrid({ children }: { children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useDraftState("validation", "gridLeft", 50)
  const [top, setTop] = useDraftState("validation", "gridTop", 44)
  const [size, setSize] = useState({width: 0, height: 660})
  useLayoutEffect(() => {
    if (!grid.current) return
    const observer = new ResizeObserver(([entry]) => setSize({width: entry.contentRect.width, height: entry.contentRect.height}))
    observer.observe(grid.current)
    return () => observer.disconnect()
  }, [])
  const clamp = (value: number, axis: "x" | "y") => {
    const min = axis === "x" ? Math.min(50, size.width ? 220 / size.width * 100 : 30) : 180 / size.height * 100
    const max = axis === "x" ? Math.max(50, size.width ? 100 - 220 / size.width * 100 : 70) : 100 - 300 / size.height * 100
    return Math.max(min, Math.min(max, value))
  }
  const shownLeft = clamp(left, "x")
  const shownTop = clamp(top, "y")
  const move = (event: PointerEvent<HTMLDivElement>, axis: "x" | "y") => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !grid.current) return
    const box = grid.current.getBoundingClientRect()
    const value = axis === "x" ? ((event.clientX - box.left) / box.width) * 100 : ((event.clientY - box.top) / box.height) * 100
    ;(axis === "x" ? setLeft : setTop)(clamp(value, axis))
  }
  return (
    <div
      ref={grid}
      data-slot="regex-grid"
      className="relative grid md:h-[660px] md:grid-cols-[var(--regex-columns)] md:grid-rows-[var(--regex-rows)]"
      style={{ "--regex-columns": `${shownLeft}fr ${100 - shownLeft}fr`, "--regex-rows": `${shownTop}fr ${100 - shownTop}fr` } as CSSProperties}
    >
      {children}
      {(["x", "y"] as const).map((axis) => (
        <div
          key={axis}
          role="separator"
          tabIndex={0}
          aria-label={uiText(axis === "x" ? "调整左右区域" : "调整上下区域")}
          aria-orientation={axis === "x" ? "vertical" : "horizontal"}
          aria-valuemin={Math.round(clamp(0, axis))}
          aria-valuemax={Math.round(clamp(100, axis))}
          aria-valuenow={Math.round(axis === "x" ? shownLeft : shownTop)}
          className={`absolute z-10 hidden touch-none items-center justify-center outline-none hover:bg-primary/15 focus-visible:bg-primary/15 md:flex ${axis === "x" ? "inset-y-0 w-2 -translate-x-1/2 cursor-col-resize" : "inset-x-0 h-2 -translate-y-1/2 cursor-row-resize"}`}
          style={axis === "x" ? { left: `${shownLeft}%` } : { top: `${shownTop}%` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => move(event, axis)}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onDoubleClick={() => (axis === "x" ? setLeft : setTop)(axis === "x" ? 50 : 44)}
          onKeyDown={(event) => {
            const previous = axis === "x" ? "ArrowLeft" : "ArrowUp"
            const next = axis === "x" ? "ArrowRight" : "ArrowDown"
            if (![previous, next, "Home"].includes(event.key)) return
            event.preventDefault()
            const reset = axis === "x" ? 50 : 44
            const value = event.key === "Home" ? reset : (axis === "x" ? shownLeft : shownTop) + (event.key === previous ? -2 : 2)
            ;(axis === "x" ? setLeft : setTop)(clamp(value, axis))
          }}
        >
          <span className={axis === "x" ? "h-7 w-1 rounded-full bg-border" : "h-1 w-7 rounded-full bg-border"} />
        </div>
      ))}
    </div>
  )
}

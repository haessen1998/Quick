import { MarkdownClient } from "@comark/react"
import mermaid from "@comark/react/plugins/mermaid"
import { Check, Copy, Maximize2, Minus, Plus, RotateCcw } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import type { MermaidProps } from "@comark/react/components/Mermaid"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const markdownPlugins = [mermaid({ theme: "github-light", themeDark: "github-dark" })]
const Mermaid = lazy(() => import("@comark/react/components/Mermaid").then((module) => ({ default: module.Mermaid })))

function MermaidPreview({ content, ...props }: MermaidProps) {
  const [zoom, setZoom] = useState(1)
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [panning, setPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])

  const copySVG = async () => {
    const svg = containerRef.current?.querySelector("svg")
    try {
      await navigator.clipboard.writeText(svg?.outerHTML ?? content)
      setCopied(true)
      toast.success(svg ? "Mermaid SVG 已复制" : "Mermaid 源码已复制")
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      toast.error("复制失败", { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await containerRef.current?.requestFullscreen()
    } catch (error) {
      toast.error("无法进入全屏", { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const resetView = () => {
    setZoom(1)
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" })
  }

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !viewportRef.current) return
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewportRef.current.scrollLeft, top: viewportRef.current.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanning(true)
    event.preventDefault()
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = panRef.current
    if (!start || start.pointerId !== event.pointerId || !viewportRef.current) return
    viewportRef.current.scrollLeft = start.left - (event.clientX - start.x)
    viewportRef.current.scrollTop = start.top - (event.clientY - start.y)
  }

  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setPanning(false)
  }

  return (
    <div ref={containerRef} className="mermaid-preview my-4 w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-background/95 shadow-sm fullscreen:m-0 fullscreen:h-screen fullscreen:w-screen fullscreen:max-w-none fullscreen:rounded-none fullscreen:border-0">
      <div className="flex h-11 min-w-0 items-center justify-end gap-1 border-b bg-muted/25 px-2 sm:px-3">
        <span className="mr-auto hidden text-xs font-medium text-muted-foreground sm:block">Mermaid 预览</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-xs" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="缩小图表"><Minus /></Button>
          <button type="button" className="app-interactive min-w-12 rounded px-1 text-center text-[11px] text-muted-foreground hover:text-foreground" onClick={resetView} title="恢复 100%">{Math.round(zoom * 100)}%</button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} aria-label="放大图表"><Plus /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={resetView} aria-label="重置缩放与位置"><RotateCcw /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => void copySVG()} aria-label="复制 Mermaid SVG">{copied ? <Check /> : <Copy />}</Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "退出全屏" : "全屏预览"}><Maximize2 /></Button>
        </div>
      </div>
      <div ref={viewportRef} className={cn("mermaid-canvas h-[28rem] overflow-auto p-5 sm:p-7", panning ? "cursor-grabbing select-none" : "cursor-grab")} style={{ touchAction: "none" }} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan} aria-label="Mermaid 可拖动画布" title="按住并拖动查看画布，滚动条仍可使用">
        <div className="mx-auto transition-[width] duration-150" style={{ width: `${zoom * 100}%`, minWidth: zoom >= 1 ? "32rem" : "20rem" }}>
          <Suspense fallback={<div className="py-16 text-center text-xs text-muted-foreground">正在渲染 Mermaid 图表…</div>}>
            <Mermaid key={content} content={content} {...props} className="quick-mermaid w-full" />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

const markdownComponents = {
  mermaid: MermaidPreview,
}

export function MarkdownRenderer({
  value,
  streaming = false,
  className,
}: {
  value: string
  streaming?: boolean
  className?: string
}) {
  // CoMark 0.6 appends its caret node to a shallow copy of the parsed tree. The
  // nested node can therefore survive the final non-streaming render and leave a
  // pulsing <span> behind. Quick already exposes streaming state around messages,
  // so keep live parsing but disable that mutating caret implementation.
  return <MarkdownClient value={value} plugins={markdownPlugins} components={markdownComponents} streaming={streaming} caret={false} className={cn("ai-markdown text-sm", className)} />
}

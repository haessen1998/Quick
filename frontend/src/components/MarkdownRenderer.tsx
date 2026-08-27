import { MarkdownClient } from "@comark/react"
import mermaid from "@comark/react/plugins/mermaid"
import { Check, Copy, Maximize2, Minus, Plus, RotateCcw } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
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
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={containerRef} className="my-4 w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-background/95 shadow-sm fullscreen:m-0 fullscreen:h-screen fullscreen:w-screen fullscreen:max-w-none fullscreen:rounded-none fullscreen:border-0">
      <div className="flex h-11 min-w-0 items-center justify-end gap-1 border-b bg-muted/25 px-2 sm:px-3">
        <span className="mr-auto hidden text-xs font-medium text-muted-foreground sm:block">Mermaid 预览</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-xs" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="缩小图表"><Minus /></Button>
          <button type="button" className="app-interactive min-w-12 rounded px-1 text-center text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setZoom(1)} title="恢复 100%">{Math.round(zoom * 100)}%</button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} aria-label="放大图表"><Plus /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setZoom(1)} aria-label="重置缩放"><RotateCcw /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => void copySVG()} aria-label="复制 Mermaid SVG">{copied ? <Check /> : <Copy />}</Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "退出全屏" : "全屏预览"}><Maximize2 /></Button>
        </div>
      </div>
      <div className="h-[28rem] overflow-auto p-5 sm:p-7 fullscreen:h-[calc(100vh-2.75rem)]">
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

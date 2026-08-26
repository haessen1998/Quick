import { MarkdownClient } from "@comark/react"
import mermaid from "@comark/react/plugins/mermaid"
import { lazy, Suspense } from "react"
import type { MermaidProps } from "@comark/react/components/Mermaid"

import { cn } from "@/lib/utils"

const markdownPlugins = [mermaid({ theme: "github-light", themeDark: "github-dark" })]
const Mermaid = lazy(() => import("@comark/react/components/Mermaid").then((module) => ({ default: module.Mermaid })))
const markdownComponents = {
  mermaid: ({ content, ...props }: MermaidProps) => (
    <div className="my-4 overflow-auto rounded-xl border bg-background/70 p-4">
      <Suspense fallback={<div className="py-8 text-center text-xs text-muted-foreground">正在渲染 Mermaid 图表…</div>}>
        <Mermaid key={content} content={content} {...props} className="quick-mermaid min-w-[28rem]" />
      </Suspense>
    </div>
  ),
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

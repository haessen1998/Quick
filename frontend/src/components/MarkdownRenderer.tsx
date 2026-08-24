import { MarkdownClient } from "@comark/react"

import { cn } from "@/lib/utils"

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
  return <MarkdownClient value={value} streaming={streaming} caret={false} className={cn("ai-markdown text-sm", className)} />
}

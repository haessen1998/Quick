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
  return <MarkdownClient value={value} streaming={streaming} caret={streaming} className={cn("ai-markdown text-sm", className)} />
}

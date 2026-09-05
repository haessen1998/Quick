import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Empty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex min-w-0 flex-col items-center justify-center gap-4 rounded-xl p-6 text-center", className)}
      {...props}
    />
  )
}
export function EmptyMedia({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  )
}
export function EmptyDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="empty-description" className={cn("max-w-sm text-sm leading-relaxed text-muted-foreground", className)} {...props} />
}

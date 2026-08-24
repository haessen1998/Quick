import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "default" | "compact"
}

function Switch({ checked, onCheckedChange, size = "default", className, disabled, ...props }: SwitchProps) {
  const compact = size === "compact"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      {...props}
      className={cn(
        "app-interactive relative shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        compact ? "h-5 w-9" : "h-6 w-11",
        checked ? "border-primary bg-primary" : "border-input bg-muted",
        className,
      )}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) onCheckedChange?.(!checked)
      }}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform",
          compact ? "size-4" : "size-5",
          checked && (compact ? "translate-x-4" : "translate-x-5"),
        )}
      />
    </button>
  )
}

export { Switch }

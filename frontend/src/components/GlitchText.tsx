import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

type GlitchTextProps = {
  children: string
  speed?: number
  enableShadows?: boolean
  enableOnHover?: boolean
  className?: string
}

type GlitchStyle = CSSProperties & {
  "--glitch-after-duration": string
  "--glitch-before-duration": string
  "--glitch-after-shadow": string
  "--glitch-before-shadow": string
}

export function GlitchText({ children, speed = 0.5, enableShadows = true, enableOnHover = false, className }: GlitchTextProps) {
  const style: GlitchStyle = {
    "--glitch-after-duration": `${speed * 3}s`,
    "--glitch-before-duration": `${speed * 2}s`,
    "--glitch-after-shadow": enableShadows ? "-5px 0 #ff3b57" : "none",
    "--glitch-before-shadow": enableShadows ? "5px 0 #22d3ee" : "none",
  }

  return <span className={cn("glitch-text", enableOnHover && "glitch-text--hover", className)} style={style} data-text={children} aria-label={children}>{children}</span>
}

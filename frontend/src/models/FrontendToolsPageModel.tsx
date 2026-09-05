import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage } from "@/lib/i18n"
import { useDraftState } from "@/lib/workspace-store"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"

export const inputClass =
  "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

export function parseHex(value: string) {
  const match = value.trim().match(/^#?([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)
  if (!match) throw new Error("请输入 #RGB、#RRGGBB 或 #RRGGBBAA")
  let hex = match[1]
  if (hex.length === 3) hex = Array.from(hex, (item) => item + item).join("")
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: alpha,
  }
}

export function rgbToHsl(r: number, g: number, b: number) {
  const values = [r / 255, g / 255, b / 255]
  const max = Math.max(...values),
    min = Math.min(...values),
    lightness = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: lightness * 100 }
  const delta = max - min
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === values[0]
      ? 60 * (((values[1] - values[2]) / delta) % 6)
      : max === values[1]
        ? 60 * ((values[2] - values[0]) / delta + 2)
        : 60 * ((values[0] - values[1]) / delta + 4)
  return { h: (hue + 360) % 360, s: saturation * 100, l: lightness * 100 }
}

export function rgbToOklch(r: number, g: number, b: number) {
  const linear = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const red = linear(r),
    green = linear(g),
    blue = linear(b)
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bValue = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: lightness * 100, c: Math.hypot(a, bValue), h: ((Math.atan2(bValue, a) * 180) / Math.PI + 360) % 360 }
}

export function colorDetails(value: string) {
  const rgb = parseHex(value)
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b)
  return {
    hex: `#${[rgb.r, rgb.g, rgb.b].map((item) => item.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    rgb: `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${rgb.a.toFixed(2)})`,
    hsl: `hsl(${hsl.h.toFixed(1)} ${hsl.s.toFixed(1)}% ${hsl.l.toFixed(1)}% / ${rgb.a.toFixed(2)})`,
    oklch: `oklch(${oklch.l.toFixed(2)}% ${oklch.c.toFixed(4)} ${oklch.h.toFixed(1)} / ${rgb.a.toFixed(2)})`,
    ...rgb,
  }
}

export function contrastRatio(first: string, second: string) {
  const luminance = (value: string) => {
    const { r, g, b } = parseHex(value)
    const channels = [r, g, b].map((item) => {
      const v = item / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function useFrontendToolsPageModel() {
  const { language } = useLanguage()
  const [foreground, setForeground] = useDraftState("frontend", "foreground", "#111827")
  const [background, setBackground] = useDraftState("frontend", "background", "#F9FAFB")
  const [angle, setAngle] = useDraftState("frontend", "angle", 135)
  const [baseSize, setBaseSize] = useDraftState("frontend", "baseSize", 16)
  const [viewportWidth, setViewportWidth] = useDraftState("frontend", "viewportWidth", 1440)
  const [pixelValue, setPixelValue] = useDraftState("frontend", "pixelValue", 24)
  const [shadow, setShadow] = useDraftState("frontend", "shadow", { x: 0, y: 12, blur: 30, spread: -8 })
  const [svg, setSVG] = useDraftState(
    "frontend",
    "svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb"/></svg>',
  )
  const details = useMemo(() => {
    try {
      return { value: colorDetails(foreground), error: "" }
    } catch (caught) {
      return { value: null, error: caught instanceof Error ? caught.message : String(caught) }
    }
  }, [foreground])
  const contrast = useMemo(() => {
    try {
      return contrastRatio(foreground, background)
    } catch {
      return 0
    }
  }, [background, foreground])
  const gradient = `linear-gradient(${angle}deg, ${foreground}, ${background})`
  const shadowCSS = `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${foreground}40`
  const svgDataURL = `data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, " ")}`
  const copy = async (value: string) => {
    await writeClipboard(value)
    toast.success("已复制")
  }

  useAssistantCapability({
    page: "frontend",
    getContext: () => ({
      foreground,
      background,
      contrast,
      gradient,
      shadow: shadowCSS,
      units: { pixelValue, baseSize, viewportWidth, rem: pixelValue / baseSize, vw: (pixelValue / viewportWidth) * 100 },
    }),
    actions: {
      run: (values) => {
        const operation = String(values.operation ?? "color")
        if (values.foreground) setForeground(String(values.foreground))
        if (values.background) setBackground(String(values.background))
        if (operation === "color") return { success: true, result: colorDetails(String(values.foreground ?? foreground)), executed: true }
        if (operation === "contrast")
          return {
            success: true,
            ratio: contrastRatio(String(values.foreground ?? foreground), String(values.background ?? background)),
            executed: true,
          }
        if (operation === "gradient") {
          const nextAngle = Number(values.angle ?? angle)
          setAngle(nextAngle)
          return {
            success: true,
            css: `linear-gradient(${nextAngle}deg, ${String(values.foreground ?? foreground)}, ${String(values.background ?? background)})`,
            executed: true,
          }
        }
        if (operation === "units") {
          const px = Number(values.pixels ?? pixelValue),
            base = Number(values.baseSize ?? baseSize),
            viewport = Number(values.viewportWidth ?? viewportWidth)
          setPixelValue(px)
          setBaseSize(base)
          setViewportWidth(viewport)
          return { success: true, pixels: px, rem: px / base, vw: (px / viewport) * 100, executed: true }
        }
        if (operation === "svg-data-url") {
          const value = String(values.svg ?? svg)
          setSVG(value)
          return { success: true, result: `data:image/svg+xml,${encodeURIComponent(value).replace(/%20/g, " ")}`, executed: true }
        }
        throw new Error(`不支持的前端工具操作：${operation}`)
      },
    },
  })

  return {
    language,
    foreground,
    setForeground,
    background,
    setBackground,
    angle,
    setAngle,
    baseSize,
    setBaseSize,
    viewportWidth,
    setViewportWidth,
    pixelValue,
    setPixelValue,
    shadow,
    setShadow,
    svg,
    setSVG,
    details,
    contrast,
    gradient,
    shadowCSS,
    svgDataURL,
    copy,
  }
}

const ModelContext = createContext<ReturnType<typeof useFrontendToolsPageModel> | null>(null)
export function FrontendToolsPageModelProvider(props: { children: ReactNode }) {
  const model = useFrontendToolsPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useFrontendToolsPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("FrontendToolsPageModelProvider missing")
  return value
}

import { useMemo, useState } from "react"
import { Code2, Copy, Palette, Ruler, Sparkles, SunMedium } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useLanguage } from "@/lib/i18n"

const inputClass = "app-interactive h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

function parseHex(value: string) {
  const match = value.trim().match(/^#?([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)
  if (!match) throw new Error("请输入 #RGB、#RRGGBB 或 #RRGGBBAA")
  let hex = match[1]
  if (hex.length === 3) hex = Array.from(hex, (item) => item + item).join("")
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1
  return { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16), a: alpha }
}

function rgbToHsl(r: number, g: number, b: number) {
  const values = [r / 255, g / 255, b / 255]
  const max = Math.max(...values), min = Math.min(...values), lightness = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: lightness * 100 }
  const delta = max - min
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue = max === values[0] ? 60 * (((values[1] - values[2]) / delta) % 6) : max === values[1] ? 60 * ((values[2] - values[0]) / delta + 2) : 60 * ((values[0] - values[1]) / delta + 4)
  return { h: (hue + 360) % 360, s: saturation * 100, l: lightness * 100 }
}

function rgbToOklch(r: number, g: number, b: number) {
  const linear = (value: number) => { const normalized = value / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4 }
  const red = linear(r), green = linear(g), blue = linear(b)
  const l = Math.cbrt(.4122214708 * red + .5363325363 * green + .0514459929 * blue)
  const m = Math.cbrt(.2119034982 * red + .6806995451 * green + .1073969566 * blue)
  const s = Math.cbrt(.0883024619 * red + .2817188376 * green + .6299787005 * blue)
  const lightness = .2104542553 * l + .793617785 * m - .0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s
  const bValue = .0259040371 * l + .7827717662 * m - .808675766 * s
  return { l: lightness * 100, c: Math.hypot(a, bValue), h: (Math.atan2(bValue, a) * 180 / Math.PI + 360) % 360 }
}

function colorDetails(value: string) {
  const rgb = parseHex(value)
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b)
  return { hex: `#${[rgb.r, rgb.g, rgb.b].map((item) => item.toString(16).padStart(2, "0")).join("")}`.toUpperCase(), rgb: `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${rgb.a.toFixed(2)})`, hsl: `hsl(${hsl.h.toFixed(1)} ${hsl.s.toFixed(1)}% ${hsl.l.toFixed(1)}% / ${rgb.a.toFixed(2)})`, oklch: `oklch(${oklch.l.toFixed(2)}% ${oklch.c.toFixed(4)} ${oklch.h.toFixed(1)} / ${rgb.a.toFixed(2)})`, ...rgb }
}

function contrastRatio(first: string, second: string) {
  const luminance = (value: string) => { const { r, g, b } = parseHex(value); const channels = [r, g, b].map((item) => { const v = item / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] }
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

export default function FrontendToolsPage() {
  const { language } = useLanguage()
  const [foreground, setForeground] = useState("#111827")
  const [background, setBackground] = useState("#F9FAFB")
  const [angle, setAngle] = useState(135)
  const [baseSize, setBaseSize] = useState(16)
  const [viewportWidth, setViewportWidth] = useState(1440)
  const [pixelValue, setPixelValue] = useState(24)
  const [shadow, setShadow] = useState({ x: 0, y: 12, blur: 30, spread: -8 })
  const [svg, setSVG] = useState('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb"/></svg>')
  const details = useMemo(() => { try { return { value: colorDetails(foreground), error: "" } } catch (caught) { return { value: null, error: caught instanceof Error ? caught.message : String(caught) } } }, [foreground])
  const contrast = useMemo(() => { try { return contrastRatio(foreground, background) } catch { return 0 } }, [background, foreground])
  const gradient = `linear-gradient(${angle}deg, ${foreground}, ${background})`
  const shadowCSS = `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${foreground}40`
  const svgDataURL = `data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, " ")}`
  const copy = async (value: string) => { await writeClipboard(value); toast.success("已复制") }

  useAssistantCapability({ page: "frontend", getContext: () => ({ foreground, background, contrast, gradient, shadow: shadowCSS, units: { pixelValue, baseSize, viewportWidth, rem: pixelValue / baseSize, vw: pixelValue / viewportWidth * 100 } }), actions: { run: (values) => {
    const operation = String(values.operation ?? "color")
    if (values.foreground) setForeground(String(values.foreground)); if (values.background) setBackground(String(values.background))
    if (operation === "color") return { success: true, result: colorDetails(String(values.foreground ?? foreground)), executed: true }
    if (operation === "contrast") return { success: true, ratio: contrastRatio(String(values.foreground ?? foreground), String(values.background ?? background)), executed: true }
    if (operation === "gradient") { const nextAngle = Number(values.angle ?? angle); setAngle(nextAngle); return { success: true, css: `linear-gradient(${nextAngle}deg, ${String(values.foreground ?? foreground)}, ${String(values.background ?? background)})`, executed: true } }
    if (operation === "units") { const px = Number(values.pixels ?? pixelValue), base = Number(values.baseSize ?? baseSize), viewport = Number(values.viewportWidth ?? viewportWidth); setPixelValue(px); setBaseSize(base); setViewportWidth(viewport); return { success: true, pixels: px, rem: px / base, vw: px / viewport * 100, executed: true } }
    if (operation === "svg-data-url") { const value = String(values.svg ?? svg); setSVG(value); return { success: true, result: `data:image/svg+xml,${encodeURIComponent(value).replace(/%20/g, " ")}`, executed: true } }
    throw new Error(`不支持的前端工具操作：${operation}`)
  } } })

  return <section className="page-shell"><div className="mx-auto w-full max-w-7xl"><div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">颜色与前端</h1><p className="mt-2 text-sm text-muted-foreground">颜色格式、对比度、渐变、阴影、CSS 单位与 SVG Data URL，全部在本地计算。</p></div><div className="grid gap-4 xl:grid-cols-2">
    <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-medium"><Palette className="size-4" />颜色转换</div><div className="mt-4 grid gap-3 sm:grid-cols-[4rem_1fr]"><input type="color" className="app-interactive h-10 w-16 rounded border bg-transparent" value={details.value?.hex ?? "#000000"} onChange={(event) => setForeground(event.target.value)} /><input className={inputClass} value={foreground} onChange={(event) => setForeground(event.target.value)} /></div>{details.error ? <div className="mt-3 text-sm text-destructive">{details.error}</div> : details.value && <div className="mt-3 space-y-2">{[details.value.hex, details.value.rgb, details.value.hsl, details.value.oklch].map((value) => <button key={value} className="app-interactive block w-full rounded-lg border bg-muted/20 px-3 py-2 text-left font-mono text-xs" onClick={() => copy(value)}>{value}</button>)}</div>}</article>
    <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-medium"><SunMedium className="size-4" />对比度与渐变</div><div className="mt-4 grid grid-cols-2 gap-3"><input className={inputClass} value={foreground} onChange={(event) => setForeground(event.target.value)} /><input className={inputClass} value={background} onChange={(event) => setBackground(event.target.value)} /></div><div className="mt-3 rounded-lg border p-6 text-center font-medium" style={{ color: foreground, background }}>Quick Contrast · {contrast.toFixed(2)}:1</div><div className="mt-2 text-xs text-muted-foreground">{language === "en-US" ? `Normal text AA: ${contrast >= 4.5 ? "Passed" : "Failed"} · Large text AA: ${contrast >= 3 ? "Passed" : "Failed"}` : `普通文本 AA：${contrast >= 4.5 ? "通过" : "未通过"} · 大文本 AA：${contrast >= 3 ? "通过" : "未通过"}`}</div><div className="mt-4 h-20 rounded-lg border" style={{ background: gradient }} /><div className="mt-2 flex items-center gap-2"><input className={inputClass} type="number" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /><Button variant="outline" onClick={() => copy(`background: ${gradient};`)}><Copy />CSS</Button></div></article>
    <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-medium"><Ruler className="size-4" />CSS 单位与阴影</div><div className="mt-4 grid grid-cols-3 gap-2"><label className="text-xs text-muted-foreground">px<input className={inputClass} type="number" value={pixelValue} onChange={(event) => setPixelValue(Number(event.target.value))} /></label><label className="text-xs text-muted-foreground">根字号<input className={inputClass} type="number" value={baseSize} onChange={(event) => setBaseSize(Number(event.target.value))} /></label><label className="text-xs text-muted-foreground">视口宽<input className={inputClass} type="number" value={viewportWidth} onChange={(event) => setViewportWidth(Number(event.target.value))} /></label></div><div className="mt-3 rounded-lg border bg-muted/20 p-3 font-mono text-sm">{(pixelValue / baseSize).toFixed(4)} rem · {(pixelValue / viewportWidth * 100).toFixed(4)} vw</div><div className="mt-4 grid grid-cols-4 gap-2">{(["x", "y", "blur", "spread"] as const).map((key) => <label key={key} className="text-xs text-muted-foreground">{key}<input className={inputClass} type="number" value={shadow[key]} onChange={(event) => setShadow({ ...shadow, [key]: Number(event.target.value) })} /></label>)}</div><button type="button" className="app-interactive mt-5 h-20 w-full rounded-xl bg-background" style={{ boxShadow: shadowCSS }} onClick={() => copy(`box-shadow: ${shadowCSS};`)}>点击复制阴影 CSS</button></article>
    <article className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-medium"><Code2 className="size-4" />SVG Data URL</div><textarea className="app-interactive mt-4 h-36 w-full resize-none rounded-lg border bg-background p-3 font-mono text-xs outline-none" value={svg} onChange={(event) => setSVG(event.target.value)} spellCheck={false} /><textarea className="app-interactive mt-3 h-24 w-full resize-none rounded-lg border bg-muted/20 p-3 font-mono text-xs outline-none" readOnly value={svgDataURL} /><Button className="mt-3" variant="outline" onClick={() => copy(svgDataURL)}><Copy />复制 Data URL</Button></article>
  </div></div></section>
}

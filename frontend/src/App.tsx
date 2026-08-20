import { lazy, Suspense, useEffect, useState } from "react"
import {
  ArrowRight,
  ArrowLeftRight,
  Clock3,
  FileCheck2,
  Files,
  Gauge,
  GitBranch,
  Home,
  Moon,
  CaseSensitive,
  Network,
  ShieldCheck,
  Settings,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react"
import { Events, WML } from "@wailsio/runtime"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { GlitchText } from "@/components/GlitchText"
import { Toaster } from "@/components/ui/sonner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { getInitialTheme, type AppTheme } from "@/lib/theme"
import { getInitialProxySettings, saveProxySettings, type ProxySettings } from "@/lib/proxy"

const CryptoPage = lazy(() => import("@/pages/CryptoPage"))
const DataConversionPage = lazy(() => import("@/pages/DataConversionPage"))
const NetworkPage = lazy(() => import("@/pages/NetworkPage"))
const StringToolsPage = lazy(() => import("@/pages/StringToolsPage"))
const TextWorkbenchPage = lazy(() => import("@/pages/TextWorkbenchPage"))
const TimeIdentifiersPage = lazy(() => import("@/pages/TimeIdentifiersPage"))
const ValidationPage = lazy(() => import("@/pages/ValidationPage"))

type PageId = "home" | "formatter" | "converter" | "time-ids" | "validation" | "crypto" | "network" | "text-workbench" | "settings"

type PageDefinition = {
  id: PageId
  label: string
  description: string
  icon: LucideIcon
}

const pages: PageDefinition[] = [
  { id: "home", label: "首页", description: "Quick 开发者工具箱", icon: Home },
  { id: "formatter", label: "字符串格式化", description: "JSON、YAML、XML、HTML、CSS 与 JavaScript", icon: CaseSensitive },
  { id: "converter", label: "数据转换", description: "格式、编码、代码模型与进制互转", icon: ArrowLeftRight },
  { id: "time-ids", label: "时间与标识符", description: "时间戳、时区、Cron 与 ID 生成", icon: Clock3 },
  { id: "validation", label: "校验工具", description: "JSONPath、XPath 与正则表达式", icon: FileCheck2 },
  { id: "crypto", label: "加密与验证", description: "哈希、AES、RSA 与 JWT", icon: ShieldCheck },
  { id: "network", label: "网络工具", description: "网络诊断、HTTP/cURL 与本地进程", icon: Network },
  { id: "text-workbench", label: "文本工作台", description: "Markdown 预览与智能文本差异", icon: Files },
  { id: "settings", label: "设置", description: "应用偏好选项", icon: Settings },
]

const appVersion = "v0.0.1"

function AppSidebar({ activePage, onNavigate }: { activePage: PageId; onNavigate: (page: PageId) => void }) {
  const { open } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader className="h-14 border-b border-sidebar-border px-2 py-0">
        <div className={cn("flex h-full items-center gap-3 overflow-hidden px-1", !open && "md:justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            Q
          </div>
          <div className={cn("min-w-0 leading-tight", !open && "md:hidden")}>
            <div className="truncate text-sm font-semibold">Quick</div>
            <div className="truncate text-xs text-sidebar-foreground/55">开发工具箱</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>应用导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pages.map((page) => {
                const Icon = page.icon
                return (
                  <SidebarMenuItem key={page.id}>
                    <SidebarMenuButton
                      isActive={activePage === page.id}
                      title={!open ? page.label : undefined}
                      onClick={() => onNavigate(page.id)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className={cn("truncate", !open && "md:hidden")}>{page.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <a
          className={cn(
            "app-interactive flex h-9 items-center gap-3 overflow-hidden rounded-lg px-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            !open && "md:justify-center md:px-0",
          )}
          data-wml-openurl="https://github.com/haessen1998/Quick"
          aria-label="Quick GitHub 仓库"
        >
          <GitBranch className="size-4 shrink-0" />
          <span className={cn("truncate", !open && "md:hidden")}>GitHub 仓库</span>
        </a>
        <div className={cn("flex items-center gap-3 overflow-hidden px-2 py-1", !open && "md:justify-center md:px-0")}>
          <img src="/icon.png" alt="Quick" className="size-7 shrink-0 rounded-full border border-sidebar-border object-cover" />
          <div className={cn("min-w-0", !open && "md:hidden")}>
            <div className="truncate text-xs font-medium">Haessen</div>
            <div className="truncate text-[11px] text-sidebar-foreground/50">simple work, simple life</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function HomePage({ time, onNavigate }: { time: string; onNavigate: (page: PageId) => void }) {
  return (
    <section className="home-page">
      <main className="home-container quick-hero">
        <div className="quick-hero-kicker"><Sparkles aria-hidden="true" />LOCAL-FIRST DEVELOPER TOOLKIT</div>
        <h1 className="quick-hero-heading"><GlitchText speed={0.8} enableShadows className="quick-hero-title">QUICK</GlitchText></h1>
        <p className="quick-hero-subtitle">一个持续生长的跨平台开发者工具箱。把格式化、转换、校验、网络与加密操作集中在一个轻量桌面应用中。</p>
        <div className="quick-hero-tags" aria-label="主要功能"><span>FORMAT</span><span>CONVERT</span><span>VALIDATE</span><span>NETWORK</span><span>CRYPTO</span></div>
        <div className="quick-hero-actions">
          <Button className="app-interactive" onClick={() => onNavigate("formatter")}>开始使用<ArrowRight aria-hidden="true" /></Button>
          <Button className="app-interactive" variant="outline" asChild><a data-wml-openurl="https://github.com/haessen1998/Quick">查看 GitHub</a></Button>
        </div>
      </main>

      <hr className="footer-divider" />
      <footer className="footer">
        <span className="footer-version">Quick {appVersion}</span>
        <span className="footer-time">
          <Gauge aria-hidden="true" />
          <span>{time}</span>
        </span>
        <a className="footer-docs" data-wml-openurl="https://github.com/haessen1998/Quick" aria-label="Quick GitHub 仓库">
          源码
          <ArrowRight aria-hidden="true" />
        </a>
      </footer>

    </section>
  )
}

function PageShell({ page, children }: { page: PageDefinition; children: React.ReactNode }) {
  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            开发工具
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{page.label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function SettingsPage({
  page,
  theme,
  onThemeChange,
  proxy,
  onProxyChange,
}: {
  page: PageDefinition
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  proxy: ProxySettings
  onProxyChange: (proxy: ProxySettings) => void
}) {
  return (
    <PageShell page={page}>
      <div className="max-w-3xl space-y-4">
      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="border-b p-6">
          <h2 className="font-medium">外观</h2>
          <p className="mt-1 text-sm text-muted-foreground">选择应用界面的颜色主题。</p>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          <button
            type="button"
            className={cn(
              "app-interactive flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted",
              theme === "light" && "border-primary bg-muted ring-1 ring-primary",
            )}
            onClick={() => onThemeChange("light")}
          >
            <span className="flex size-9 items-center justify-center rounded-lg border bg-white text-zinc-900">
              <Sun className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">浅色</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">明亮的应用界面</span>
            </span>
          </button>
          <button
            type="button"
            className={cn(
              "app-interactive flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted",
              theme === "dark" && "border-primary bg-muted ring-1 ring-primary",
            )}
            onClick={() => onThemeChange("dark")}
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100">
              <Moon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">深色</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">适合低光环境</span>
            </span>
          </button>
        </div>
      </article>

      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="border-b p-6">
          <h2 className="font-medium">网络代理</h2>
          <p className="mt-1 text-sm text-muted-foreground">应用于网络工具中的 HTTP 请求；Ping、DNS 与 TCP 检测不经过 HTTP 代理。</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { mode: "system", label: "系统/环境代理", description: "跟随 HTTP_PROXY 等系统环境" },
              { mode: "custom", label: "指定代理", description: "使用自定义代理 URL" },
              { mode: "none", label: "不使用代理", description: "HTTP 请求直接连接" },
            ] as const).map((option) => (
              <button key={option.mode} type="button" className={cn("app-interactive rounded-xl border p-4 text-left transition-colors hover:bg-muted", proxy.mode === option.mode && "border-primary bg-muted ring-1 ring-primary")} onClick={() => onProxyChange({ ...proxy, mode: option.mode })}>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
          <label className="block space-y-2 text-sm">
            <span>代理地址</span>
            <input className="h-10 w-full rounded-lg border border-input bg-transparent px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50" disabled={proxy.mode !== "custom"} value={proxy.url} onChange={(event) => onProxyChange({ ...proxy, url: event.target.value })} placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080" />
          </label>
        </div>
      </article>

      </div>
    </PageShell>
  )
}

function App() {
  const [activePage, setActivePage] = useState<PageId>("home")
  const [time, setTime] = useState("正在同步本地时间…")
  const [theme, setTheme] = useState<AppTheme>(() => {
    const initialTheme = getInitialTheme()
    document.documentElement.classList.toggle("dark", initialTheme === "dark")
    return initialTheme
  })
  const [proxy, setProxy] = useState<ProxySettings>(() => getInitialProxySettings())
  const currentPage = pages.find((page) => page.id === activePage) ?? pages[0]

  useEffect(() => {
    return Events.On("time", (timeValue: any) => {
      const full = String(timeValue.data ?? "")
      const compact = (full.match(/\d{1,2}:\d{2}:\d{2}/) || [full])[0]
      setTime(window.matchMedia("(max-width: 640px)").matches ? compact : full)
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => WML.Reload(), 0)
    return () => window.clearTimeout(timer)
  }, [activePage])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    window.localStorage.setItem("quick-theme", theme)
  }, [theme])

  useEffect(() => {
    saveProxySettings(proxy)
  }, [proxy])

  const changeTheme = (nextTheme: AppTheme) => {
    setTheme(nextTheme)
    toast.success(nextTheme === "dark" ? "已切换到深色主题" : "已切换到浅色主题")
  }

  return (
    <SidebarProvider className="bg-transparent">
      <div className="bg" aria-hidden="true" />
      <AppSidebar activePage={activePage} onNavigate={setActivePage} />
      <SidebarInset className={activePage === "home" ? "bg-transparent" : "bg-background"}>
        <header className="app-topbar">
          <SidebarTrigger className="app-interactive" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{currentPage.label}</div>
            <div className="truncate text-xs text-muted-foreground">{currentPage.description}</div>
          </div>
        </header>

        <Suspense fallback={<div className="page-shell text-sm text-muted-foreground">正在加载工具…</div>}>
          {activePage === "home" && <HomePage time={time} onNavigate={setActivePage} />}
          {activePage === "formatter" && <StringToolsPage />}
          {activePage === "converter" && <DataConversionPage />}
          {activePage === "time-ids" && <TimeIdentifiersPage />}
          {activePage === "validation" && <ValidationPage />}
          {activePage === "crypto" && <CryptoPage />}
          {activePage === "network" && <NetworkPage proxy={proxy} />}
          {activePage === "text-workbench" && <TextWorkbenchPage />}
          {activePage === "settings" && <SettingsPage page={currentPage} theme={theme} onThemeChange={changeTheme} proxy={proxy} onProxyChange={setProxy} />}
        </Suspense>
      </SidebarInset>
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </SidebarProvider>
  )
}

export default App

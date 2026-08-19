import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  Blocks,
  BookOpen,
  CheckCircle2,
  CircleUserRound,
  Gauge,
  Home,
  LayoutDashboard,
  Moon,
  CaseSensitive,
  Settings,
  Sparkles,
  Sun,
  User,
  type LucideIcon,
} from "lucide-react"
import { Events, WML } from "@wailsio/runtime"
import { toast } from "sonner"

import { GreetService } from "../bindings/changeme"
import { Button } from "@/components/ui/button"
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
import StringToolsPage from "@/pages/StringToolsPage"

type PageId = "home" | "dashboard" | "strings" | "components" | "settings"

type PageDefinition = {
  id: PageId
  label: string
  description: string
  icon: LucideIcon
}

const pages: PageDefinition[] = [
  { id: "home", label: "首页", description: "Wails 欢迎页", icon: Home },
  { id: "dashboard", label: "概览", description: "运行状态与数据", icon: LayoutDashboard },
  { id: "strings", label: "字符串处理", description: "格式化、压缩与编码", icon: CaseSensitive },
  { id: "components", label: "组件测试", description: "交互组件预览", icon: Blocks },
  { id: "settings", label: "设置", description: "应用偏好选项", icon: Settings },
]

const wailsVersion = "v3.0.0-beta.9"

function AppSidebar({ activePage, onNavigate }: { activePage: PageId; onNavigate: (page: PageId) => void }) {
  const { open } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn("flex h-10 items-center gap-3 overflow-hidden px-1", !open && "md:justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            Q
          </div>
          <div className={cn("min-w-0 leading-tight", !open && "md:hidden")}>
            <div className="truncate text-sm font-semibold">Quick</div>
            <div className="truncate text-xs text-sidebar-foreground/55">Wails + shadcn/ui</div>
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
          data-wml-openURL="https://ui.shadcn.com/docs/components/sidebar"
          aria-label="Sidebar 文档"
        >
          <BookOpen className="size-4 shrink-0" />
          <span className={cn("truncate", !open && "md:hidden")}>Sidebar 文档</span>
        </a>
        <div className={cn("flex items-center gap-3 overflow-hidden px-2 py-1", !open && "md:justify-center md:px-0")}>
          <CircleUserRound className="size-7 shrink-0 text-sidebar-foreground/65" />
          <div className={cn("min-w-0", !open && "md:hidden")}>
            <div className="truncate text-xs font-medium">本地开发</div>
            <div className="truncate text-[11px] text-sidebar-foreground/50">localhost</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function HomePage({ time }: { time: string }) {
  const [name, setName] = useState("")
  const titleNameRef = useRef<HTMLSpanElement | null>(null)

  const swapTitleName = (nextName: string) => {
    const titleNameElement = titleNameRef.current
    if (!titleNameElement) return

    const current = titleNameElement.querySelector(".title-name-text:not(.is-outgoing)")
    if (!current || current.textContent === nextName) return

    const incoming = document.createElement("span")
    incoming.className = "title-name-text is-entering"
    incoming.textContent = nextName
    current.classList.add("is-outgoing")
    titleNameElement.appendChild(incoming)
    void incoming.offsetWidth
    incoming.classList.remove("is-entering")
    current.classList.add("is-leaving")
    current.addEventListener("transitionend", () => current.remove(), { once: true })
  }

  const showToast = (message: string) => {
    toast.success("来自 Go", { description: message })
  }

  const doGreet = () => {
    const nextName = name || "anonymous"
    swapTitleName(nextName)
    GreetService.Greet(nextName).then(showToast).catch(console.error)
  }

  return (
    <section className="home-page">
      <main className="home-container">
        <header className="brand">
          <a className="brand-mark" data-wml-openURL="https://v3.wails.io" aria-label="Wails website">
            <img src="/wails.png" className="brand-logo" alt="Wails logo" />
          </a>
          <a className="brand-badge" data-wml-openURL="https://reactjs.org" aria-label="React">
            <img src="/react.svg" alt="React logo" />
          </a>
        </header>

        <h1 className="title">
          <span className="title-accent">Wails +</span>{" "}
          <span className="title-name" ref={titleNameRef}>
            <span className="title-name-text">React</span>
          </span>
        </h1>
        <p className="subtitle">Build beautiful cross-platform apps with Go and React.</p>

        <div className="greet">
          <div className="input-box">
            <User className="input-icon" aria-hidden="true" />
            <input
              aria-label="input"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && doGreet()}
              type="text"
              placeholder="Your name"
              autoComplete="off"
            />
            <Button aria-label="greet-btn" className="btn h-auto" onClick={doGreet}>
              Greet
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </main>

      <hr className="footer-divider" />
      <footer className="footer">
        <span className="footer-version">{wailsVersion}</span>
        <span className="footer-time">
          <Gauge aria-hidden="true" />
          <span>{time}</span>
        </span>
        <a className="footer-docs" data-wml-openURL="https://v3.wails.io" aria-label="Wails documentation">
          Docs
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
            测试页面
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{page.label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function DashboardPage({ page }: { page: PageDefinition }) {
  const metrics = [
    { label: "前端状态", value: "运行中", detail: "Vite · 9345", icon: CheckCircle2 },
    { label: "页面数量", value: "4", detail: "1 个首页，3 个测试页", icon: LayoutDashboard },
    { label: "组件数量", value: "2", detail: "Button · Sidebar", icon: Blocks },
  ]

  return (
    <PageShell page={page}>
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
              <div className="flex items-start justify-between">
                <div className="text-sm text-muted-foreground">{metric.label}</div>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-4 text-2xl font-semibold">{metric.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
            </article>
          )
        })}
      </div>

      <article className="mt-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="font-medium">最近活动</h2>
        <div className="mt-4 space-y-4">
          {["Sidebar 已接入应用布局", "shadcn/ui 主题变量已加载", "Wails 前端服务已连接"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 text-sm">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {index + 1}
              </div>
              <span>{item}</span>
              <span className="ml-auto text-xs text-muted-foreground">刚刚</span>
            </div>
          ))}
        </div>
      </article>
    </PageShell>
  )
}

function ComponentsPage({ page }: { page: PageDefinition }) {
  const [count, setCount] = useState(0)

  return (
    <PageShell page={page}>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-medium">Button variants</h2>
          <p className="mt-1 text-sm text-muted-foreground">测试 shadcn Button 的常用样式。</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => setCount((value) => value + 1)}>默认按钮</Button>
            <Button variant="secondary">次要按钮</Button>
            <Button variant="outline">描边按钮</Button>
            <Button variant="ghost">幽灵按钮</Button>
            <Button variant="destructive">危险操作</Button>
          </div>
          <div className="mt-5 rounded-lg bg-muted p-3 text-sm">
            默认按钮已点击 <span className="font-semibold">{count}</span> 次
          </div>
        </article>

        <article className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-medium">表单控件</h2>
          <p className="mt-1 text-sm text-muted-foreground">验证主题颜色、焦点和禁用状态。</p>
          <div className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm">
              <span>项目名称</span>
              <input
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Quick Desktop"
              />
            </label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" />
              输入组件状态正常
            </div>
          </div>
        </article>
      </div>
    </PageShell>
  )
}

function SettingsPage({
  page,
  theme,
  onThemeChange,
}: {
  page: PageDefinition
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
}) {
  const [autoStart, setAutoStart] = useState(true)
  const [notifications, setNotifications] = useState(false)

  const settingRows = [
    { label: "启动时恢复页面", description: "下次启动时打开最后访问的页面。", value: autoStart, setValue: setAutoStart },
    { label: "桌面通知", description: "允许应用显示本地状态通知。", value: notifications, setValue: setNotifications },
  ]

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
          <h2 className="font-medium">通用设置</h2>
          <p className="mt-1 text-sm text-muted-foreground">这些选项仅用于演示页面交互。</p>
        </div>
        <div className="divide-y">
          {settingRows.map((setting) => (
            <div key={setting.label} className="flex items-center gap-5 p-6">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{setting.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{setting.description}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={setting.value}
                className={cn(
                  "app-interactive relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  setting.value ? "bg-primary" : "bg-input",
                )}
                onClick={() => setting.setValue(!setting.value)}
              >
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow-sm transition-transform",
                    setting.value ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </article>
      </div>
    </PageShell>
  )
}

function App() {
  const [activePage, setActivePage] = useState<PageId>("home")
  const [time, setTime] = useState("Listening for Time event...")
  const [theme, setTheme] = useState<AppTheme>(() => {
    const initialTheme = getInitialTheme()
    document.documentElement.classList.toggle("dark", initialTheme === "dark")
    return initialTheme
  })
  const currentPage = pages.find((page) => page.id === activePage) ?? pages[0]

  useEffect(() => {
    return Events.On("time", (timeValue: any) => {
      const full = timeValue.data
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
          <div className="ml-auto hidden items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Wails connected
          </div>
        </header>

        {activePage === "home" && <HomePage time={time} />}
        {activePage === "dashboard" && <DashboardPage page={currentPage} />}
        {activePage === "strings" && <StringToolsPage />}
        {activePage === "components" && <ComponentsPage page={currentPage} />}
        {activePage === "settings" && <SettingsPage page={currentPage} theme={theme} onThemeChange={changeTheme} />}
      </SidebarInset>
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </SidebarProvider>
  )
}

export default App

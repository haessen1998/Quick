import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import {
  ArrowRight,
  ArrowLeftRight,
  Bot,
  Blocks,
  Clock3,
  FileCheck2,
  Files,
  Gauge,
  GitBranch,
  Home,
  KeyRound,
  Moon,
  CaseSensitive,
  Network,
  Pencil,
  Plus,
  ShieldCheck,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react"
import { Events, WML } from "@wailsio/runtime"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { GlobalAssistant } from "@/components/GlobalAssistant"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { AssistantCapabilityProvider } from "@/lib/assistant-capabilities"
import { AssistantConversationProvider } from "@/lib/assistant-conversation"
import { getInitialAssistantSettings, saveAssistantSettings, type AssistantSettings } from "@/lib/assistant-settings"
import type { PageId } from "@/lib/pages"
import { getInitialTheme, type AppTheme } from "@/lib/theme"
import { getInitialProxySettings, saveProxySettings, type ProxySettings } from "@/lib/proxy"
import {
  createAIProfile,
  createMCPServerProfile,
  getInitialAIProfiles,
  getInitialMCPServers,
  saveAIProfiles,
  saveMCPServers,
  type AIProfile,
  type MCPServerProfile,
} from "@/lib/saved-connections"

const CryptoPage = lazy(() => import("@/pages/CryptoPage"))
const AIChatPage = lazy(() => import("@/pages/AIChatPage"))
const MCPInspectorPage = lazy(() => import("@/pages/MCPInspectorPage"))
const DataConversionPage = lazy(() => import("@/pages/DataConversionPage"))
const NetworkPage = lazy(() => import("@/pages/NetworkPage"))
const StringToolsPage = lazy(() => import("@/pages/StringToolsPage"))
const TextWorkbenchPage = lazy(() => import("@/pages/TextWorkbenchPage"))
const TimeIdentifiersPage = lazy(() => import("@/pages/TimeIdentifiersPage"))
const ValidationPage = lazy(() => import("@/pages/ValidationPage"))

type PageDefinition = {
  id: PageId
  label: string
  description: string
  icon: LucideIcon
}

function PageSlot({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>
}

const pages: PageDefinition[] = [
  { id: "home", label: "首页", description: "Quick 开发者工具箱", icon: Home },
  { id: "ai-chat", label: "AI 对话", description: "多 Provider 流式对话与 Markdown 渲染", icon: Bot },
  { id: "mcp-inspector", label: "MCP 测试", description: "连接、检查并调用 MCP Tools", icon: Blocks },
  { id: "formatter", label: "字符串格式化", description: "JSON、YAML、XML、HTML、CSS 与 JavaScript", icon: CaseSensitive },
  { id: "converter", label: "数据转换", description: "格式、编码、代码模型与进制互转", icon: ArrowLeftRight },
  { id: "time-ids", label: "时间与标识符", description: "时间戳、时区、Cron 与 ID 生成", icon: Clock3 },
  { id: "validation", label: "校验工具", description: "JSONPath、XPath 与正则表达式", icon: FileCheck2 },
  { id: "crypto", label: "加密与验证", description: "哈希、AES、RSA 与 JWT", icon: ShieldCheck },
  { id: "network", label: "网络工具", description: "网络诊断、HTTP/cURL 与本地进程", icon: Network },
  { id: "text-workbench", label: "文本工作台", description: "Markdown 预览与智能文本差异", icon: Files },
  { id: "settings", label: "设置", description: "应用偏好选项", icon: Settings },
]

const appVersion = "v0.1.0"

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

const SETTINGS_INPUT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
const SETTINGS_TEXTAREA_CLASS = "h-24 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"

function AIProfileEditor({ profile, isNew, onChange, onSave, onClose }: { profile: AIProfile; isNew: boolean; onChange: (profile: AIProfile) => void; onSave: () => void; onClose: () => void }) {
  const [showKey, setShowKey] = useState(false)
  const patch = (changes: Partial<AIProfile>) => onChange({ ...profile, ...changes })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isNew ? "新增 AI 配置" : "修改 AI 配置"}</DialogTitle><DialogDescription>保存后可在 AI 对话页直接选择。</DialogDescription></DialogHeader>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium"><span>名称</span><input autoFocus className={SETTINGS_INPUT_CLASS} value={profile.name} onChange={(event) => patch({ name: event.target.value })} /></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Provider</span><select className={SETTINGS_INPUT_CLASS} value={profile.provider} onChange={(event) => patch({ provider: event.target.value as AIProfile["provider"] })}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google Gemini</option><option value="compatible">OpenAI Compatible</option></select></label>
          <label className="space-y-1.5 text-xs font-medium"><span>模型</span><input className={SETTINGS_INPUT_CLASS} value={profile.model} onChange={(event) => patch({ model: event.target.value })} /></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Base URL</span><input className={SETTINGS_INPUT_CLASS} value={profile.baseURL} onChange={(event) => patch({ baseURL: event.target.value })} placeholder="官方 Provider 可留空" /></label>
          <label className="space-y-1.5 text-xs font-medium sm:col-span-2"><span>API Key</span><span className="relative block"><input type={showKey ? "text" : "password"} className={`${SETTINGS_INPUT_CLASS} pr-10`} value={profile.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} autoComplete="off" /><button type="button" className="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
          <label className="space-y-1.5 text-xs font-medium sm:col-span-2"><span>系统提示词</span><textarea className={SETTINGS_TEXTAREA_CLASS} value={profile.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} /></label>
        </div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="button" disabled={!profile.name.trim() || !profile.model.trim()} onClick={onSave}>保存配置</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MCPProfileEditor({ profile, isNew, onChange, onSave, onClose }: { profile: MCPServerProfile; isNew: boolean; onChange: (profile: MCPServerProfile) => void; onSave: () => void; onClose: () => void }) {
  const patch = (changes: Partial<MCPServerProfile>) => onChange({ ...profile, ...changes })
  const invalid = !profile.name.trim() || (profile.transport === "stdio" ? !profile.command.trim() : !profile.url.trim())
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isNew ? "新增 MCP Server" : "修改 MCP Server"}</DialogTitle><DialogDescription>配置远程 Transport 或本地 STDIO 启动参数。</DialogDescription></DialogHeader>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium"><span>名称</span><input autoFocus className={SETTINGS_INPUT_CLASS} value={profile.name} onChange={(event) => patch({ name: event.target.value })} /></label>
          <label className="space-y-1.5 text-xs font-medium"><span>Transport</span><select className={SETTINGS_INPUT_CLASS} value={profile.transport} onChange={(event) => patch({ transport: event.target.value as MCPServerProfile["transport"] })}><option value="streamable-http">Streamable HTTP</option><option value="sse">SSE（旧版兼容）</option><option value="stdio">STDIO</option></select></label>
          {profile.transport === "stdio" ? <>
            <label className="space-y-1.5 text-xs font-medium"><span>命令</span><input className={`${SETTINGS_INPUT_CLASS} font-mono`} value={profile.command} onChange={(event) => patch({ command: event.target.value })} placeholder="npx、uvx 或可执行文件路径" /></label>
            <label className="space-y-1.5 text-xs font-medium"><span>参数（JSON 数组）</span><input className={`${SETTINGS_INPUT_CLASS} font-mono`} value={profile.argsJSON} onChange={(event) => patch({ argsJSON: event.target.value })} placeholder={'["server.js"]'} /></label>
            <label className="space-y-1.5 text-xs font-medium sm:col-span-2"><span>工作目录（可选）</span><input className={`${SETTINGS_INPUT_CLASS} font-mono`} value={profile.cwd} onChange={(event) => patch({ cwd: event.target.value })} /></label>
            <label className="space-y-1.5 text-xs font-medium sm:col-span-2"><span>环境变量（每行 KEY=value）</span><textarea className={`${SETTINGS_TEXTAREA_CLASS} font-mono text-xs`} value={profile.env} onChange={(event) => patch({ env: event.target.value })} /></label>
          </> : <>
            <label className="space-y-1.5 text-xs font-medium"><span>Server URL</span><input className={`${SETTINGS_INPUT_CLASS} font-mono`} value={profile.url} onChange={(event) => patch({ url: event.target.value })} /></label>
            <label className="space-y-1.5 text-xs font-medium"><span>连接方式</span><select className={SETTINGS_INPUT_CLASS} value={profile.connectionMode} onChange={(event) => patch({ connectionMode: event.target.value as MCPServerProfile["connectionMode"] })}><option value="quick-proxy">Quick 本地代理</option><option value="direct">直接连接</option></select></label>
            <label className="space-y-1.5 text-xs font-medium sm:col-span-2"><span>请求头</span><textarea className={`${SETTINGS_TEXTAREA_CLASS} font-mono text-xs`} value={profile.headers} onChange={(event) => patch({ headers: event.target.value })} placeholder="Authorization: Bearer …" /></label>
          </>}
        </div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="button" disabled={invalid} onClick={onSave}>保存配置</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfigDialog({ kind, name, onConfirm, onClose }: { kind: "AI" | "MCP"; name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>删除{kind}配置</DialogTitle><DialogDescription>确定删除“{name}”吗？删除后将立即从本地长期配置中移除。</DialogDescription></DialogHeader>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="button" variant="destructive" onClick={onConfirm}><Trash2 />确认删除</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettingsPage({
  page,
  theme,
  onThemeChange,
  proxy,
  onProxyChange,
  aiProfiles,
  onAIProfilesChange,
  mcpServers,
  onMCPServersChange,
  assistantSettings,
  onAssistantSettingsChange,
}: {
  page: PageDefinition
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  proxy: ProxySettings
  onProxyChange: (proxy: ProxySettings) => void
  aiProfiles: AIProfile[]
  onAIProfilesChange: (profiles: AIProfile[]) => void
  mcpServers: MCPServerProfile[]
  onMCPServersChange: (profiles: MCPServerProfile[]) => void
  assistantSettings: AssistantSettings
  onAssistantSettingsChange: (settings: AssistantSettings) => void
}) {
  const [aiEditor, setAIEditor] = useState<{ value: AIProfile; isNew: boolean } | null>(null)
  const [mcpEditor, setMCPEditor] = useState<{ value: MCPServerProfile; isNew: boolean } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ kind: "AI" | "MCP"; id: string; name: string } | null>(null)
  const saveAIEditor = () => {
    if (!aiEditor) return
    onAIProfilesChange(aiEditor.isNew ? [...aiProfiles, aiEditor.value] : aiProfiles.map((profile) => profile.id === aiEditor.value.id ? aiEditor.value : profile))
    setAIEditor(null)
    toast.success(aiEditor.isNew ? "AI 配置已新增" : "AI 配置已更新")
  }
  const saveMCPEditor = () => {
    if (!mcpEditor) return
    onMCPServersChange(mcpEditor.isNew ? [...mcpServers, mcpEditor.value] : mcpServers.map((profile) => profile.id === mcpEditor.value.id ? mcpEditor.value : profile))
    setMCPEditor(null)
    toast.success(mcpEditor.isNew ? "MCP 配置已新增" : "MCP 配置已更新")
  }
  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === "AI") onAIProfilesChange(aiProfiles.filter((profile) => profile.id !== pendingDelete.id))
    else onMCPServersChange(mcpServers.filter((profile) => profile.id !== pendingDelete.id))
    toast.success(`${pendingDelete.kind} 配置已删除`)
    setPendingDelete(null)
  }

  return (
    <PageShell page={page}>
      <div className="max-w-5xl space-y-4">
      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="border-b p-6">
          <h2 className="font-medium">数据保存方式</h2>
          <p className="mt-1 text-sm text-muted-foreground">Quick 将长期偏好与临时工作状态分开处理。</p>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4" />临时工作状态</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">页面输入、输出、AI 对话、MCP 连接和调用历史仅保留在本次运行的内存中。切换页面不会清空，关闭应用后释放。</p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Settings className="size-4" />长期配置</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">主题、网络代理、AI/MCP 列表和页面助手偏好保存在当前设备的 WebView localStorage 中，重新启动 Quick 后仍可使用。</p>
          </div>
        </div>
      </article>

      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="border-b p-6">
          <h2 className="font-medium">页面助手</h2>
          <p className="mt-1 text-sm text-muted-foreground">配置跨页面助手调用 Quick 和 MCP 扩展能力时的行为。</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 rounded-xl border bg-background p-4">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border", assistantSettings.autoApproveMCP ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200" : "bg-muted/30 text-muted-foreground")}><ShieldCheck className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">自动审核 MCP 调用</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">开启后，页面助手调用已保存 MCP 的 Tool 时不再显示逐次确认框。</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={assistantSettings.autoApproveMCP}
              aria-label="自动审核 MCP 调用"
              className={cn("app-interactive relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40", assistantSettings.autoApproveMCP ? "border-primary bg-primary" : "border-input bg-muted")}
              onClick={() => {
                const enabled = !assistantSettings.autoApproveMCP
                onAssistantSettingsChange({ ...assistantSettings, autoApproveMCP: enabled })
                if (enabled) toast.warning("已开启 MCP 自动审核", { description: "页面助手调用 MCP Tool 时将不再逐次确认。" })
                else toast.success("已关闭 MCP 自动审核")
              }}
            >
              <span className={cn("pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow-sm transition-transform", assistantSettings.autoApproveMCP && "translate-x-5")} />
            </button>
          </div>
          {assistantSettings.autoApproveMCP && <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">风险提示：MCP Tool 可能写入文件、发送网络请求或执行系统命令。自动审核只建议用于你完全信任的 Server。</div>}
        </div>
      </article>

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

      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">AI 配置列表</h2>
            <p className="mt-1 text-sm text-muted-foreground">保存常用 Provider，AI 对话页可直接选择。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAIEditor({ value: createAIProfile(), isNew: true })}><Plus />新增 AI</Button>
        </div>
        <div className="space-y-3 p-4 sm:p-6">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <KeyRound className="mt-0.5 size-4 shrink-0" />API Key 会保存在当前设备的 WebView localStorage 中，未做系统密钥链加密。请只在可信设备上使用。
          </div>
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b bg-muted/45 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">名称</th><th className="px-4 py-3 font-medium">Provider</th><th className="px-4 py-3 font-medium">模型</th><th className="px-4 py-3 font-medium">Base URL</th><th className="px-4 py-3 font-medium">凭据</th><th className="w-32 px-4 py-3 text-right font-medium">操作</th></tr></thead>
              <tbody>{aiProfiles.length ? aiProfiles.map((profile) => <tr key={profile.id} className="border-b last:border-b-0 hover:bg-muted/25"><td className="px-4 py-3 font-medium">{profile.name}</td><td className="px-4 py-3 text-muted-foreground">{profile.provider}</td><td className="px-4 py-3"><code className="text-xs">{profile.model}</code></td><td className="max-w-52 truncate px-4 py-3 text-xs text-muted-foreground" title={profile.baseURL}>{profile.baseURL || "官方默认"}</td><td className="px-4 py-3"><span className={cn("rounded-full px-2 py-1 text-[10px]", profile.apiKey ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{profile.apiKey ? "已配置" : "未配置"}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon-xs" onClick={() => setAIEditor({ value: { ...profile }, isNew: false })} aria-label={`修改 ${profile.name}`}><Pencil className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-xs" onClick={() => setPendingDelete({ kind: "AI", id: profile.id, name: profile.name })} aria-label={`删除 ${profile.name}`}><Trash2 className="size-3.5" /></Button></div></td></tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">暂无 AI 配置，可点击右上角新增。</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </article>

      <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">MCP Server 列表</h2>
            <p className="mt-1 text-sm text-muted-foreground">保存远程地址或本地 STDIO 命令，MCP 测试页可直接选择。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setMCPEditor({ value: createMCPServerProfile(), isNew: true })}><Plus />新增 MCP</Button>
        </div>
        <div className="space-y-3 p-4 sm:p-6">
          <p className="rounded-lg bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">请求头和环境变量同样保存在当前设备的 localStorage。STDIO 命令由 Quick 直接启动，不经过 Shell。</p>
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="border-b bg-muted/45 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">名称</th><th className="px-4 py-3 font-medium">Transport</th><th className="px-4 py-3 font-medium">地址 / 命令</th><th className="px-4 py-3 font-medium">连接方式</th><th className="w-32 px-4 py-3 text-right font-medium">操作</th></tr></thead>
              <tbody>{mcpServers.length ? mcpServers.map((profile) => <tr key={profile.id} className="border-b last:border-b-0 hover:bg-muted/25"><td className="px-4 py-3 font-medium">{profile.name}</td><td className="px-4 py-3 text-muted-foreground">{profile.transport === "streamable-http" ? "Streamable HTTP" : profile.transport === "sse" ? "SSE" : "STDIO"}</td><td className="max-w-80 truncate px-4 py-3 font-mono text-xs" title={profile.transport === "stdio" ? `${profile.command} ${profile.argsJSON}` : profile.url}>{profile.transport === "stdio" ? profile.command || "—" : profile.url || "—"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{profile.transport === "stdio" ? "本地进程" : profile.connectionMode === "quick-proxy" ? "Quick 代理" : "直接连接"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon-xs" onClick={() => setMCPEditor({ value: { ...profile }, isNew: false })} aria-label={`修改 ${profile.name}`}><Pencil className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-xs" onClick={() => setPendingDelete({ kind: "MCP", id: profile.id, name: profile.name })} aria-label={`删除 ${profile.name}`}><Trash2 className="size-3.5" /></Button></div></td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">暂无 MCP 配置，可点击右上角新增。</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </article>

      {aiEditor && <AIProfileEditor profile={aiEditor.value} isNew={aiEditor.isNew} onChange={(value) => setAIEditor({ ...aiEditor, value })} onSave={saveAIEditor} onClose={() => setAIEditor(null)} />}
      {mcpEditor && <MCPProfileEditor profile={mcpEditor.value} isNew={mcpEditor.isNew} onChange={(value) => setMCPEditor({ ...mcpEditor, value })} onSave={saveMCPEditor} onClose={() => setMCPEditor(null)} />}
      {pendingDelete && <DeleteConfigDialog kind={pendingDelete.kind} name={pendingDelete.name} onConfirm={confirmDelete} onClose={() => setPendingDelete(null)} />}

      </div>
    </PageShell>
  )
}

function App() {
  const [activePage, setActivePage] = useState<PageId>("home")
  const [visitedPages, setVisitedPages] = useState<Set<PageId>>(() => new Set(["home"]))
  const [time, setTime] = useState("正在同步本地时间…")
  const [theme, setTheme] = useState<AppTheme>(() => {
    const initialTheme = getInitialTheme()
    document.documentElement.classList.toggle("dark", initialTheme === "dark")
    return initialTheme
  })
  const [proxy, setProxy] = useState<ProxySettings>(() => getInitialProxySettings())
  const [assistantSettings, setAssistantSettings] = useState<AssistantSettings>(() => getInitialAssistantSettings())
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [aiChatMode, setAIChatMode] = useState<"chat" | "assistant">("chat")
  const [aiProfiles, setAIProfiles] = useState<AIProfile[]>(() => getInitialAIProfiles())
  const [mcpServers, setMCPServers] = useState<MCPServerProfile[]>(() => getInitialMCPServers())
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

  useEffect(() => {
    saveAssistantSettings(assistantSettings)
  }, [assistantSettings])

  useEffect(() => {
    saveAIProfiles(aiProfiles)
  }, [aiProfiles])

  useEffect(() => {
    saveMCPServers(mcpServers)
  }, [mcpServers])

  const changeTheme = (nextTheme: AppTheme) => {
    setTheme(nextTheme)
    toast.success(nextTheme === "dark" ? "已切换到深色主题" : "已切换到浅色主题")
  }

  const navigateTo = (page: PageId) => {
    setVisitedPages((visited) => {
      if (visited.has(page)) return visited
      const next = new Set(visited)
      next.add(page)
      return next
    })
    setActivePage(page)
  }

  const openAssistantInAIChat = () => {
    setAssistantOpen(false)
    setAIChatMode("assistant")
    navigateTo("ai-chat")
  }

  return (
    <AssistantCapabilityProvider>
      <AssistantConversationProvider>
      <SidebarProvider className="bg-transparent">
        <div className="bg" aria-hidden="true" />
        <AppSidebar activePage={activePage} onNavigate={navigateTo} />
        <SidebarInset className={activePage === "home" ? "bg-transparent" : "bg-background"}>
        <header className="app-topbar">
          <SidebarTrigger className="app-interactive" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{currentPage.label}</div>
            <div className="truncate text-xs text-muted-foreground">{currentPage.description}</div>
          </div>
        </header>

        <Suspense fallback={<div className="page-shell text-sm text-muted-foreground">正在加载工具…</div>}>
          {visitedPages.has("home") && <PageSlot active={activePage === "home"}><HomePage time={time} onNavigate={navigateTo} /></PageSlot>}
          {visitedPages.has("ai-chat") && <PageSlot active={activePage === "ai-chat"}><AIChatPage profiles={aiProfiles} mode={aiChatMode} onModeChange={setAIChatMode} /></PageSlot>}
          {visitedPages.has("mcp-inspector") && <PageSlot active={activePage === "mcp-inspector"}><MCPInspectorPage proxy={proxy} profiles={mcpServers} /></PageSlot>}
          {visitedPages.has("formatter") && <PageSlot active={activePage === "formatter"}><StringToolsPage /></PageSlot>}
          {visitedPages.has("converter") && <PageSlot active={activePage === "converter"}><DataConversionPage /></PageSlot>}
          {visitedPages.has("time-ids") && <PageSlot active={activePage === "time-ids"}><TimeIdentifiersPage /></PageSlot>}
          {visitedPages.has("validation") && <PageSlot active={activePage === "validation"}><ValidationPage /></PageSlot>}
          {visitedPages.has("crypto") && <PageSlot active={activePage === "crypto"}><CryptoPage /></PageSlot>}
          {visitedPages.has("network") && <PageSlot active={activePage === "network"}><NetworkPage proxy={proxy} /></PageSlot>}
          {visitedPages.has("text-workbench") && <PageSlot active={activePage === "text-workbench"}><TextWorkbenchPage /></PageSlot>}
          {visitedPages.has("settings") && <PageSlot active={activePage === "settings"}><SettingsPage page={currentPage} theme={theme} onThemeChange={changeTheme} proxy={proxy} onProxyChange={setProxy} aiProfiles={aiProfiles} onAIProfilesChange={setAIProfiles} mcpServers={mcpServers} onMCPServersChange={setMCPServers} assistantSettings={assistantSettings} onAssistantSettingsChange={setAssistantSettings} /></PageSlot>}
        </Suspense>
        </SidebarInset>
        <GlobalAssistant profiles={aiProfiles} mcpServers={mcpServers} proxy={proxy} autoApproveMCP={assistantSettings.autoApproveMCP} activePage={activePage} onNavigate={navigateTo} open={assistantOpen} onOpenChange={setAssistantOpen} onOpenInAIChat={openAssistantInAIChat} />
        <Toaster theme={theme} position="top-right" richColors closeButton />
      </SidebarProvider>
      </AssistantConversationProvider>
    </AssistantCapabilityProvider>
  )
}

export default App

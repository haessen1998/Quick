import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DirectChatTransport, ToolLoopAgent, type UIMessage } from "ai"
import {
  Bot,
  ArrowDown,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { AssistantMessageFlow } from "@/components/AssistantMessageFlow"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { AI_PROVIDER_OPTIONS, createLanguageModel, getAIProviderOption, settingsFromProfile, validateChatSettings, type AIProviderOption, type ChatSettings } from "@/lib/ai-provider"
import { createNativeAIFetch } from "@/lib/ai-native-proxy"
import { writeClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { createAIProfile, type AIProfile } from "@/lib/saved-connections"
import { useLanguage } from "@/lib/i18n"
import type { ProxySettings } from "@/lib/proxy"
import { useStickToBottom } from "@/lib/use-stick-to-bottom"

const QUICK_PROMPTS = [
  "用简洁的步骤解释这段代码的执行过程",
  "帮我设计一个 REST API 的错误响应结构",
  "把我的需求整理成一份技术实现清单",
]

const INITIAL_SETTINGS: ChatSettings = {
  provider: "openai",
  model: AI_PROVIDER_OPTIONS[0].model,
  apiKey: "",
  baseURL: "",
  resourceName: "",
  apiVersion: "",
  useDeploymentBasedUrls: false,
  systemPrompt: "你是 Quick 开发者工具箱中的 AI 助手。回答应准确、清晰，并优先给出可执行的建议。",
}

function getText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function MessageActions({ text, onRegenerate }: { text: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await writeClipboard(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
      <Button type="button" size="icon-sm" variant="ghost" className="size-7" onClick={copy} aria-label="复制消息">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      {onRegenerate && (
        <Button type="button" size="icon-sm" variant="ghost" className="size-7" onClick={onRegenerate} aria-label="重新生成">
          <RefreshCw className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function ChatMessage({
  message,
  isStreaming,
  onRegenerate,
}: {
  message: UIMessage
  isStreaming: boolean
  onRegenerate?: () => void
}) {
  const isUser = message.role === "user"
  const text = getText(message)
  const hasFlow = message.parts.some((part) => part.type === "reasoning" || part.type.startsWith("tool-") || part.type === "dynamic-tool" || part.type === "source-url" || part.type === "source-document")

  return (
    <article className={cn("group/message flex gap-3 px-4 py-5 sm:px-6", isUser ? "justify-end" : "border-b border-border/55")}>
      {!isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-sm">
          <Bot className="size-4" />
        </div>
      )}
      <div className={cn("min-w-0", isUser ? "max-w-[82%]" : "max-w-[min(100%,52rem)] flex-1")}>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {isUser ? "你" : "AI 助手"}
          {isStreaming && !isUser && <span className="inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500" />}
        </div>
        {!isUser && <AssistantMessageFlow message={message} streaming={isStreaming} />}
        {isUser ? (
          <div data-i18n-skip className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm">{text}</div>
        ) : text ? (
          <div data-i18n-skip><MarkdownRenderer value={text} streaming={isStreaming} /></div>
        ) : !hasFlow ? (
          <div className="flex h-7 items-center gap-1.5 text-muted-foreground" aria-label="正在生成回答">
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </div>
        ) : null}
        {text && <MessageActions text={text} onRegenerate={onRegenerate} />}
      </div>
      {isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm">
          <User className="size-4" />
        </div>
      )}
    </article>
  )
}

function ChatSession({ settings, proxy }: { settings: ChatSettings; proxy: ProxySettings }) {
  const { language, t } = useLanguage()
  const [input, setInput] = useState("")
  const network = useMemo(() => createNativeAIFetch(proxy), [proxy.mode, proxy.url])
  useEffect(() => () => { void network.close() }, [network])
  const transport = useMemo(() => {
    const agent = new ToolLoopAgent({
      model: createLanguageModel(settings, network.fetch),
      instructions: [settings.systemPrompt.trim(), language === "en-US" ? "Respond in English unless the user explicitly requests another language." : "除非用户明确指定其他语言，否则使用简体中文回答。"].filter(Boolean).join("\n\n"),
      maxOutputTokens: 4096,
    })
    return new DirectChatTransport({ agent })
  }, [settings, language, network])
  const { messages, sendMessage, status, stop, regenerate, setMessages, error, clearError } = useChat({
    transport,
    throttle: 40,
  })
  const isBusy = status === "submitted" || status === "streaming"
  const { scrollRef, atBottom, handleScroll, scrollToBottom } = useStickToBottom(messages, isBusy)

  const send = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || isBusy) return
    clearError()
    setInput("")
    scrollToBottom("auto")
    await sendMessage({ text: prompt })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void send(input)
    }
  }

  const clearConversation = () => {
    stop()
    setMessages([])
    clearError()
    scrollToBottom("auto")
  }

  return (
    <section className="flex min-h-[30rem] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm lg:h-[calc(100svh-13.5rem)]">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("size-2 shrink-0 rounded-full", isBusy ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{settings.model}</div>
            <div className="truncate text-[11px] text-muted-foreground">{getAIProviderOption(settings.provider).label} · {getAIProviderOption(settings.provider).protocol}</div>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clearConversation} disabled={!messages.length}>
          <Trash2 className="size-4" />
          清空
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain">
        {messages.length ? (
          messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={status === "streaming" && index === messages.length - 1 && message.role === "assistant"}
              onRegenerate={message.role === "assistant" && index === messages.length - 1 && !isBusy ? () => { scrollToBottom("auto"); void regenerate() } : undefined}
            />
          ))
        ) : (
          <div className="flex h-full min-h-[23rem] flex-col items-center justify-center px-5 py-10 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-muted/55 shadow-sm">
              <MessageSquareText className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">开始一次新对话</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">当前会话由 AI SDK 驱动，回复会通过 Comark 实时渲染 Markdown。</p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-3">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="app-interactive rounded-xl border bg-background p-3 text-left text-xs leading-5 transition-colors hover:bg-muted" onClick={() => void send(t(prompt))}>
                  <Sparkles className="mb-2 size-3.5 text-muted-foreground" />
                  {t(prompt)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {!atBottom && <Button type="button" variant="secondary" size="icon-lg" className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background shadow-lg" onClick={() => scrollToBottom()} aria-label="回到对话底部" title="回到底部并继续跟随"><ArrowDown className="size-4" /></Button>}
      </div>

      <div className="shrink-0 border-t bg-card p-3 sm:p-4">
        {error && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            <span className="leading-5">{error.message || "请求失败，请检查 Provider 配置和网络连接。"}</span>
            <button type="button" className="shrink-0 underline underline-offset-2" onClick={clearError}>关闭</button>
          </div>
        )}
        <form onSubmit={submit} className="rounded-xl border bg-background p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/25">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            className="block max-h-40 min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground"
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            disabled={isBusy}
          />
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <span className="text-[11px] text-muted-foreground">AI 生成内容可能不准确，请核实重要信息</span>
            {isBusy ? (
              <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label="停止生成">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="发送消息">
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}

export default function AIChatPage({ profiles, onSaveProfile, proxy }: { profiles: AIProfile[]; onSaveProfile: (profile: AIProfile) => void; proxy: ProxySettings }) {
  const [selectedProfileID, setSelectedProfileID] = useState(profiles[0]?.id ?? "")
  const [draft, setDraft] = useState<ChatSettings>(() => settingsFromProfile(profiles[0], INITIAL_SETTINGS))
  const [activeSettings, setActiveSettings] = useState<ChatSettings | null>(null)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [showKey, setShowKey] = useState(false)
  const currentProvider = getAIProviderOption(draft.provider)

  useEffect(() => {
    if (!selectedProfileID) return
    const selected = profiles.find((profile) => profile.id === selectedProfileID)
    if (selected) {
      setDraft(settingsFromProfile(selected, INITIAL_SETTINGS))
      return
    }
    if (profiles[0]) {
      setSelectedProfileID(profiles[0].id)
      setDraft(settingsFromProfile(profiles[0], INITIAL_SETTINGS))
    }
  }, [profiles, selectedProfileID])

  const selectSavedProfile = (id: string) => {
    setSelectedProfileID(id)
    setDraft(settingsFromProfile(profiles.find((profile) => profile.id === id), INITIAL_SETTINGS))
  }

  const selectProvider = (provider: AIProviderOption) => {
    setSelectedProfileID("")
    setDraft((current) => ({
      ...current,
      provider: provider.id,
      model: provider.model,
      apiKey: "",
      baseURL: "",
      resourceName: "",
      apiVersion: "",
      useDeploymentBasedUrls: false,
    }))
  }

  const applySettings = () => {
    const validationError = validateChatSettings(draft)
    if (validationError) { toast.error(validationError); return }

    setActiveSettings({ ...draft, model: draft.model.trim(), apiKey: draft.apiKey.trim(), baseURL: draft.baseURL.trim(), resourceName: draft.resourceName.trim(), apiVersion: draft.apiVersion.trim() })
    setSessionVersion((version) => version + 1)
    toast.success(activeSettings ? "配置已应用，并已新建会话" : "AI Provider 已连接到新会话")
  }

  const saveProfile = () => {
    const model = draft.model.trim()
    if (!model) { toast.error("请先填写模型或部署名称"); return }
    const existing = profiles.find((profile) => profile.id === selectedProfileID)
    const profile = createAIProfile({
      ...draft,
      ...(existing ? { id: existing.id, name: existing.name } : { name: `${currentProvider.shortLabel} · ${model}` }),
      model,
      apiKey: draft.apiKey.trim(),
      baseURL: draft.baseURL.trim(),
      resourceName: draft.resourceName.trim(),
      apiVersion: draft.apiVersion.trim(),
    })
    onSaveProfile(profile)
    setSelectedProfileID(profile.id)
    toast.success(existing ? `已更新设置中的“${profile.name}”` : `已保存到设置：${profile.name}`)
  }

  return (
    <section className="page-shell ai-chat-page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />
              AI 工具
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">AI 对话</h1>
            <p className="mt-2 text-sm text-muted-foreground">使用统一 AI SDK 接入多个 Provider，并以 Comark 实时渲染 Markdown。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              已保存配置来自当前设备
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:max-h-[calc(100svh-13.5rem)] lg:overflow-y-auto lg:pr-1">
            <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center gap-2 border-b px-4 py-3.5">
                <Settings2 className="size-4" />
                <h2 className="text-sm font-medium">模型配置</h2>
              </div>
              <form className="space-y-4 p-4" onSubmit={(event) => { event.preventDefault(); applySettings() }}>
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>已保存的 AI</span>
                  <select className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={selectedProfileID} onChange={(event) => selectSavedProfile(event.target.value)}>
                    <option value="">临时自定义</option>
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                  </select>
                </label>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">Provider</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_PROVIDER_OPTIONS.map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        className={cn(
                          "app-interactive rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted",
                          draft.provider === provider.id && "border-primary bg-muted ring-1 ring-primary",
                        )}
                        onClick={() => selectProvider(provider)}
                        title={provider.description}
                      >
                        {provider.shortLabel}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg bg-muted/35 px-3 py-2 text-[11px] leading-5 text-muted-foreground"><p>{currentProvider.description}</p><p className="mt-0.5 font-medium text-foreground/75">协议：{currentProvider.protocol}</p></div>
                </fieldset>

                <label className="block space-y-1.5 text-xs font-medium">
                  <span>{currentProvider.modelLabel}</span>
                  <input
                    value={draft.model}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    placeholder={currentProvider.modelPlaceholder}
                    spellCheck={false}
                  />
                </label>

                <label className="block space-y-1.5 text-xs font-medium">
                  <span className="flex items-center gap-1.5"><KeyRound className="size-3.5" />API Key{currentProvider.apiKeyOptional && <span className="font-normal text-muted-foreground">（可选）</span>}</span>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={draft.apiKey}
                      onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 pr-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                      placeholder={draft.provider === "openai" ? "sk-..." : "Provider API Key"}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="button" className="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>
                      {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </label>

                <label className="block space-y-1.5 text-xs font-medium">
                  <span>{currentProvider.endpointLabel} <span className="font-normal text-muted-foreground">{currentProvider.endpointRequired ? "（必填）" : "（可选）"}</span></span>
                  <input
                    value={draft.baseURL}
                    onChange={(event) => setDraft({ ...draft, baseURL: event.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    placeholder={currentProvider.endpointPlaceholder}
                    spellCheck={false}
                  />
                </label>

                {draft.provider === "azure" && <>
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>Resource Name <span className="font-normal text-muted-foreground">（与 Base URL 二选一）</span></span>
                    <input value={draft.resourceName} onChange={(event) => setDraft({ ...draft, resourceName: event.target.value })} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" placeholder="your-resource-name" spellCheck={false} />
                  </label>
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>API Version <span className="font-normal text-muted-foreground">（可选）</span></span>
                    <input value={draft.apiVersion} onChange={(event) => setDraft({ ...draft, apiVersion: event.target.value })} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" placeholder={draft.useDeploymentBasedUrls ? "例如 2025-04-01-preview" : "默认 v1"} spellCheck={false} />
                  </label>
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                    <div className="min-w-0 flex-1"><div className="text-xs font-medium">部署路径兼容模式</div><p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">旧版 /deployments/ URL，需要匹配的 API Version。</p></div>
                    <Switch checked={Boolean(draft.useDeploymentBasedUrls)} onCheckedChange={(checked) => setDraft({ ...draft, useDeploymentBasedUrls: checked })} aria-label="Azure 部署路径兼容模式" />
                  </div>
                </>}

                <label className="block space-y-1.5 text-xs font-medium">
                  <span>系统提示词 <span className="font-normal text-muted-foreground">（可选）</span></span>
                  <textarea
                    value={draft.systemPrompt}
                    onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
                    className="max-h-36 min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-normal leading-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    placeholder="定义助手的角色和回答方式"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={saveProfile}>
                    <Save className="size-4" />保存配置
                  </Button>
                  <Button type="submit">
                    {activeSettings ? <RotateCcw className="size-4" /> : <Bot className="size-4" />}
                    {activeSettings ? "应用配置" : "开始对话"}
                  </Button>
                </div>
              </form>
            </article>

            <div className="rounded-xl border bg-muted/35 p-3 text-[11px] leading-5 text-muted-foreground">
              <p className="font-medium text-foreground">连接提示</p>
              <p className="mt-1">请求由 Quick 的本机 Go 网络代理转发到所选 Provider，并遵循设置页代理策略。Azure 的模型字段填写部署名称；Open Responses 地址必须包含完整的 `/responses` POST 端点。</p>
            </div>
          </aside>

          {activeSettings ? (
            <ChatSession key={sessionVersion} settings={activeSettings} proxy={proxy} />
          ) : (
            <section className="flex min-h-[30rem] flex-col items-center justify-center rounded-xl border bg-card px-6 text-center text-card-foreground shadow-sm lg:h-[calc(100svh-13.5rem)]">
              <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border bg-muted/55">
                <Bot className="size-7" />
              </div>
              <h2 className="text-xl font-semibold">配置你的 AI Provider</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">选择 Provider，填写模型和连接信息后即可开始流式对话。Open Responses 与 OpenAI Compatible 均支持不需要 API Key 的本地服务。</p>
              <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-4" />
                等待连接
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

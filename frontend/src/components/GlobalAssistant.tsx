import { appStorage, DEVELOPMENT_PROFILE } from "@/lib/app-storage"
import { shouldSendOnEnter } from "@/lib/chat-input"
import { useAINetwork,useConversationChat } from "@/lib/chat-session"
import { uiText } from "@/lib/i18n"
import { CONVERSION_MODULES,CRYPTO_OPERATIONS,FILE_RENAME_ACTIONS,FILE_RENAME_OPERATIONS,FORMATTER_OPERATIONS,FRONTEND_OPERATIONS,HTTP_METHODS,NAVIGATION_ACTIONS,NETWORK_OPERATIONS,SIDEBAR_ACTIONS,TIME_OPERATIONS,TOOL_INPUT_SCHEMAS,VALIDATION_ACTIONS,VALIDATION_MODES } from "@/lib/tool-catalog"
import { redactToolData } from "@/lib/tool-policy"
import { findToolRun } from "@/lib/tool-results"
import { runWorkflow,type WorkflowStep } from "@/lib/workflow"
import { useDraftState } from "@/lib/workspace-store"
import { DirectChatTransport,ToolLoopAgent,isToolUIPart,jsonSchema,stepCountIs,tool,type UIMessage } from "ai"
import { ArrowDown,Bot,LoaderCircle,RefreshCw,Send,Settings,Square,Trash2,Wrench } from "lucide-react"
import { useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type FormEvent,type KeyboardEvent,type PointerEvent as ReactPointerEvent } from "react"

import { AssistantMessageFlow } from "@/components/AssistantMessageFlow"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { createLanguageModel,isAIProfileReady,type ChatSettings } from "@/lib/ai-provider"
import { useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { buildQuickAssistantInstructions,buildQuickAssistantStarters } from "@/lib/assistant-manifest"
import { useLanguage } from "@/lib/i18n"
import { PAGE_IDS,PAGE_LABELS,type PageId } from "@/lib/pages"
import type { ProxySettings } from "@/lib/proxy"
import { QUICK_APP_MCP_ID,QUICK_APP_MCP_URL,type AIProfile,type MCPServerProfile } from "@/lib/saved-connections"
import { DEFAULT_SIDEBAR_ORDER,isSidebarMovablePage,moveSidebarPage,normalizeSidebarOrder } from "@/lib/sidebar-order"
import { useStickToBottom } from "@/lib/use-stick-to-bottom"
import { cn } from "@/lib/utils"

const ASSISTANT_PANEL_WIDTH_KEY = "quick-assistant-panel-width"
const DEFAULT_ASSISTANT_PANEL_WIDTH = 336
const MIN_ASSISTANT_PANEL_WIDTH = 288

function maxAssistantPanelWidth() {
  if (typeof window === "undefined") return 560
  return Math.max(MIN_ASSISTANT_PANEL_WIDTH, Math.min(560, window.innerWidth - 520))
}

function clampAssistantPanelWidth(width: number) {
  return Math.round(Math.max(MIN_ASSISTANT_PANEL_WIDTH, Math.min(maxAssistantPanelWidth(), width)))
}

function getInitialAssistantPanelWidth() {
  if (typeof window === "undefined") return DEFAULT_ASSISTANT_PANEL_WIDTH
  const savedWidth = Number(appStorage.getItem(ASSISTANT_PANEL_WIDTH_KEY))
  return clampAssistantPanelWidth(Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : DEFAULT_ASSISTANT_PANEL_WIDTH)
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function isQuickAppMCP(server: MCPServerProfile) {
  return DEVELOPMENT_PROFILE && server.id === QUICK_APP_MCP_ID && server.url === QUICK_APP_MCP_URL && server.transport !== "stdio"
}

function isAutomaticMCPCall(server: MCPServerProfile, toolName: string, args: Record<string, unknown>) {
  if (!isQuickAppMCP(server)) return false
  if (["app_info", "windows_list"].includes(toolName)) return true
  if (toolName !== "call_bound_method" || typeof args.name !== "string") return false
  return [
    "github.com/haessen1998/Quick/internal/network.NetworkService.FindProcesses",
    "github.com/haessen1998/Quick/internal/network.NetworkService.Ping",
    "github.com/haessen1998/Quick/internal/network.NetworkService.CheckPort",
    "github.com/haessen1998/Quick/internal/network.NetworkService.DNSQuery",
    "github.com/haessen1998/Quick/internal/navigation.NavigationService.GetNavigationGroups",
  ].includes(args.name)
}

function AssistantSession({ profile, activePage, onNavigate, sidebarOrder, onSidebarOrderChange, mcpServers, proxy, autoApproveOperations, open }: { profile: AIProfile; activePage: PageId; onNavigate: (page: PageId) => void; sidebarOrder: PageId[]; onSidebarOrderChange: (order: PageId[]) => void; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveOperations: boolean; open: boolean }) {
  const { language } = useLanguage()
  const registry = useAssistantCapabilityRegistry()
  const executionAbort = useRef(new AbortController())
  const activePageRef = useRef(activePage)
  const navigateRef = useRef(onNavigate)
  activePageRef.current = activePage
  navigateRef.current = onNavigate
  const settings: ChatSettings = profile
  const aiNetwork = useAINetwork(proxy)

  const transport = useMemo(() => {
    const navigate = (page: PageId) => {
      navigateRef.current(page)
      return { success: true, page, label: PAGE_LABELS[page] }
    }
    const usePage = (page: PageId, action: string, input: Record<string, unknown>) => {
      return registry.execute(page, action, input, {signal: executionAbort.current.signal})
    }
    const findMCPServer = (name: string) => {
      const normalized = name.trim().toLocaleLowerCase()
      const matches = mcpServers.filter((item) => item.name.toLocaleLowerCase() === normalized || item.id.toLocaleLowerCase() === normalized)
      if (!matches.length) throw new Error(`没有名为“${name}”的已保存 MCP Server`)
      if (matches.length > 1) throw new Error(`存在多个名为“${name}”的 MCP Server，请先在设置页使用不同名称区分`)
      return matches[0]
    }
    const useTextWorkbench = (input: { mode: "markdown" | "diff"; markdown?: string; left?: string; right?: string; granularity?: "line" | "word" | "char"; ignoreWhitespace?: boolean }) => usePage("text-workbench", "fill", input)
    const useSidebarOrder = (input: { action: typeof SIDEBAR_ACTIONS[number]; page?: PageId; before?: PageId; after?: PageId; position?: number }) => {
      const current = normalizeSidebarOrder(sidebarOrder)
      const describe = (order: PageId[]) => ["home" as PageId, ...order, "settings" as PageId].map((page, index) => ({ position: index + 1, page, label: PAGE_LABELS[page], fixed: page === "home" || page === "settings" }))
      if (input.action === "list") return { success: true, order: describe(current) }
      if (!input.page || !isSidebarMovablePage(input.page)) return { success: false, executed: false, message: "首页和设置固定；请提供一个可移动的工具页面" }
      if ([input.before, input.after, input.position].filter((value) => value !== undefined).length !== 1) return { success: false, executed: false, message: "请只使用 before、after 或 position 中的一种定位方式" }
      const remaining = current.filter((page) => page !== input.page)
      let targetIndex = -1
      if (input.before) {
        if (input.before === "home") return { success: false, executed: false, message: "首页必须固定在最上方" }
        targetIndex = input.before === "settings" ? remaining.length : remaining.indexOf(input.before)
      } else if (input.after) {
        if (input.after === "settings") return { success: false, executed: false, message: "设置必须固定在最下方" }
        targetIndex = input.after === "home" ? 0 : remaining.indexOf(input.after) + 1
      } else if (typeof input.position === "number" && Number.isInteger(input.position)) {
        targetIndex = input.position - 2
      }
      if (targetIndex < 0 || targetIndex > remaining.length) return { success: false, executed: false, message: `目标页面或位置无效；position 使用包含固定首页在内的 2 到 ${DEFAULT_SIDEBAR_ORDER.length + 1}` }
      const next = moveSidebarPage(current, input.page, targetIndex)
      onSidebarOrderChange(next)
      return { success: true, executed: true, moved: input.page, order: describe(next) }
    }
    const useNavigationService = (action: typeof NAVIGATION_ACTIONS[number], input: Record<string, unknown>) => usePage("navigation", action, input)
    const tools = {
      list_quick_tools: tool({
        description: "列出 Quick 注册的全部工具动作；这些动作无需打开对应页面即可执行。",
        inputSchema: jsonSchema<Record<string, never>>({type: "object", properties: {}, additionalProperties: false}),
        execute: async () => ({tools: registry.catalog().map(({id,page,action,label}) => ({id,page,action,label})), hint: "用 describe_quick_tool 获取单个动作的参数 Schema。"}),
      }),
      describe_quick_tool: tool({
        description: "读取一个已注册动作的完整参数 Schema 和权限说明，用于构造工作流步骤。",
        inputSchema: jsonSchema<{page: PageId; action: string}>({type: "object", properties: {page: {type: "string", enum: PAGE_IDS}, action: {type: "string"}}, required: ["page", "action"], additionalProperties: false}),
        execute: async ({page, action}) => registry.catalog().find(item => item.page === page && item.action === action) ?? {success: false, error: "未注册的工具动作"},
      }),
      run_quick_workflow: tool({
        description: "按顺序执行 1–12 个 Quick 工具步骤，每步仍检查权限。先 list_quick_tools 获取 page/action。fromPrevious 将上一步完整结果在本地传给当前步骤 input，避免经模型转抄或截断。失败或取消立即停止后续步骤。",
        inputSchema: jsonSchema<{steps: WorkflowStep[]}>({type: "object", properties: {steps: {type: "array", minItems: 1, maxItems: 12, items: {type: "object", properties: {page: {type: "string", enum: PAGE_IDS}, action: {type: "string"}, input: {type: "object", additionalProperties: true}, fromPrevious: {type: "boolean"}}, required: ["page", "action", "input"], additionalProperties: false}}}, required: ["steps"], additionalProperties: false}),
        execute: async ({steps}) => runWorkflow(steps, registry.execute, executionAbort.current.signal),
      }),
      read_quick_result: tool({
        description: "读取本次应用会话的工具结果。默认返回脱敏摘要；可用 offset 分段读取。后续工具直接引用 sourceResultId，无需重新输出全文。",
        inputSchema: jsonSchema<{artifactId: string; offset?: number}>({type: "object", properties: {artifactId: {type: "string"}, offset: {type: "integer", minimum: 0}}, required: ["artifactId"], additionalProperties: false}),
        execute: async ({artifactId, offset = 0}) => {
          const result = findToolRun(artifactId)
          if (!result) return {success: false, error: "结果已过期"}
          const safe = JSON.stringify(redactToolData(result.result) ?? null)
          return {success: true, artifactId, text: safe.slice(offset, offset + 12000), totalCharacters: safe.length, truncated: offset + 12000 < safe.length}
        },
      }),
      navigate_to_page: tool({
        description: "切换 Quick 当前页面。只切换页面，不修改页面内容。",
        inputSchema: jsonSchema<{ page: PageId }>({ type: "object", properties: { page: { type: "string", enum: PAGE_IDS, description: "目标页面 ID" } }, required: ["page"], additionalProperties: false }),
        execute: async ({ page }) => navigate(page),
      }),
      sidebar_navigation: tool({
        description: "读取或调整 Quick 侧栏页面顺序。首页固定最上，设置固定最下，其余工具页可以按目标页面前后或最终位置移动；用户拖拽或修改后的顺序会自动长期保存。",
        inputSchema: jsonSchema<{ action: typeof SIDEBAR_ACTIONS[number]; page?: PageId; before?: PageId; after?: PageId; position?: number }>({
          type: "object", properties: {
            action: { type: "string", enum: [...SIDEBAR_ACTIONS] },
            page: { type: "string", enum: [...DEFAULT_SIDEBAR_ORDER], description: "move 时要移动的工具页面" },
            before: { type: "string", enum: PAGE_IDS, description: "移动到此页面之前" },
            after: { type: "string", enum: PAGE_IDS, description: "移动到此页面之后" },
            position: { type: "number", minimum: 2, maximum: DEFAULT_SIDEBAR_ORDER.length + 1, description: "最终侧栏位置；首页固定为 1，设置固定为最后" },
          }, required: ["action"], additionalProperties: false,
        }),
        execute: async (input) => useSidebarOrder(input),
      }),
      get_current_page_context: tool({
        description: "读取 Quick 当前页面及该页面愿意提供给助手的非敏感表单上下文。",
        inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {}, additionalProperties: false }),
        execute: async () => {
          const page = activePageRef.current
          return { page, label: PAGE_LABELS[page], context: registry.getPageContext(page) }
        },
      }),
      format_text: tool({
        description: "在字符串格式化页面执行 JSON/YAML/XML/HTML/CSS/JavaScript 格式化或压缩，并把输入与结果同步到页面。",
        inputSchema: jsonSchema<{ operation: typeof FORMATTER_OPERATIONS[number]; input: string }>(TOOL_INPUT_SCHEMAS["formatter"]),
        execute: async (input) => usePage("formatter", "run", input),
      }),
      convert_data: tool({
        description: "执行 Quick 数据转换：文本与行清理、命名风格、标准数据格式、字符串编码、文本与字节、JSON 代码模型或整数进制转换。文本模块 target 支持 trim-lines/remove-empty/dedupe/sort-asc/sort-desc/reverse/number-lines/lf/crlf/tabs-to-spaces/nfc/nfd/visible/stats。",
        inputSchema: jsonSchema<{ module: typeof CONVERSION_MODULES[number]; source: string; target: string; input: string }>(TOOL_INPUT_SCHEMAS["converter"]),
        execute: async (input) => usePage("converter", "convert", input),
      }),
      time_and_identifiers: tool({
        description: "执行时间戳/日期、时区、日期差值、数值到可读时间段或可读时间段反向解析、Cron 解析，或通过 Quick Go 安全随机源生成 UUID/GUID/ULID/雪花 ID/随机内容。parse-duration 支持 1d 2h 3m 4s 500ms 和 HH:MM:SS。密码只显示在 Quick 页面。",
        inputSchema: jsonSchema<{ operation: typeof TIME_OPERATIONS[number]; value?: string; unit?: string; durationUnit?: string; sourceZone?: string; targetZone?: string; start?: string; end?: string; generator?: string; length?: number; cron?: string; zone?: string }>(TOOL_INPUT_SCHEMAS["time-ids"]),
        execute: async (input) => usePage("time-ids", "run", input),
      }),
      validate_content: tool({
        description: "校验工作台。run 可实际执行 JSONPath、JSON Schema、XPath、CSS Selector、Glob 或 JavaScript 正则；生成规则时应先根据用户约束自行生成 expression/flags，再调用 run。JSON Schema 的 expression 是完整 Schema JSON。test-cases 用正例、反例、边界、空值、Unicode 和近似错误输入验证正则逻辑。show-code 把你根据当前表达式生成的 JavaScript/TypeScript/Python/C#/Java/Go/Rust/PHP 使用代码同步到页面；注意目标语言正则方言差异并在 explanation 说明。",
        inputSchema: jsonSchema<{ action?: typeof VALIDATION_ACTIONS[number]; mode: typeof VALIDATION_MODES[number]; expression?: string; input?: string; flags?: string; replacement?: string; testCases?: Array<{ label?: string; input: string; expected: boolean }>; language?: string; code?: string; explanation?: string }>(TOOL_INPUT_SCHEMAS["validation"]),
        execute: async (input) => usePage("validation", "run", input),
      }),
      frontend_utilities: tool({
        description: "使用颜色与前端工具转换颜色、检查 WCAG 对比度、生成渐变、换算 px/rem/vw，或编码 SVG Data URL。",
        inputSchema: jsonSchema<{ operation: typeof FRONTEND_OPERATIONS[number]; foreground?: string; background?: string; angle?: number; pixels?: number; baseSize?: number; viewportWidth?: number; svg?: string }>(TOOL_INPUT_SCHEMAS["frontend"]),
        execute: async (input) => usePage("frontend", "run", input),
      }),
      crypto_operation: tool({
        description: "使用 Quick 加密页，由绑定的 Go Service 执行实际密码学操作并把结果同步回页面。普通 Hash 和 JWT 解析可直接执行；HMAC、AES、RSA、JWT 签名/验证只填写非敏感字段，密钥或密码必须由用户在页面输入并确认。RSA 密钥可在页面生成但不会返回给助手。",
        inputSchema: jsonSchema<{ operation: typeof CRYPTO_OPERATIONS[number]; input?: string; algorithm?: string; signature?: string; publicKey?: string }>(TOOL_INPUT_SCHEMAS["crypto"]),
        execute: async (input) => usePage("crypto", "run", input),
      }),
      network_operation: tool({
        description: `使用网络工具。Ping、DNS、TCP 端口、CIDR、URL 拆解、cURL/HTTP 互转和带条件进程搜索均可自动执行；url-inspect 只解析 URL，不发请求。${autoApproveOperations ? "操作自动审核已开启：用户明确要求时可发送 HTTP 请求；关闭进程前必须先按端口、PID 或程序名搜索，并且只能关闭该搜索结果中的 PID。" : "HTTP 发送和关闭进程会按类型权限审核；默认逐次确认，确认后执行。"}`,
        inputSchema: jsonSchema<{ operation: typeof NETWORK_OPERATIONS[number]; host?: string; count?: number; timeoutMS?: number; packetSize?: number; port?: number; recordType?: string; cidr?: string; method?: typeof HTTP_METHODS[number]; url?: string; headers?: string; body?: string; curl?: string; searchType?: string; query?: string; pid?: number }>(TOOL_INPUT_SCHEMAS["network"]),
        execute: async (input) => usePage("network", "run", { ...input, operationAutoApproved: autoApproveOperations }),
      }),
      open_text_workbench: tool({
        description: "打开文本工作台并填写 Markdown/Mermaid 预览，或准备行/单词/字符级文本对比。Mermaid 使用 fenced code block：```mermaid。",
        inputSchema: jsonSchema<{ mode: "markdown" | "diff"; markdown?: string; left?: string; right?: string; granularity?: "line" | "word" | "char"; ignoreWhitespace?: boolean }>(TOOL_INPUT_SCHEMAS["text-workbench"]),
        execute: useTextWorkbench,
      }),
      file_rename: tool({
        description: `使用文件工具准备和预览批量重命名规则，或对用户已经选择的文件执行只读摘要/元信息检查。文件范围必须由用户在页面选择或拖入，助手不能填写绝对路径。${autoApproveOperations ? "操作自动审核已开启：用户明确要求且当前预览无冲突时，可以执行重命名或撤销。" : "执行或撤销会请求用户确认，确认后可执行。"}`,
        inputSchema: jsonSchema<{ action: typeof FILE_RENAME_ACTIONS[number]; algorithm?: string; matchMode?: "all" | "wildcard" | "regex"; matchPattern?: string; matchFullName?: boolean; operation?: typeof FILE_RENAME_OPERATIONS[number]; find?: string; replacement?: string; useRegex?: boolean; prefix?: string; suffix?: string; start?: number; step?: number; width?: number; includeExtension?: boolean; sortBy?: "name" | "modified" | "size" }>(TOOL_INPUT_SCHEMAS["file-tools"]),
        execute: async ({ action, ...input }) => usePage("file-tools", action, { ...input, operationAutoApproved: autoApproveOperations }),
      }),
      navigation_sites: tool({
        description: `通过 Quick Go Service 管理持久化站点导航，不依赖导航页面是否已打开。update/move 操作一个准确名称；batch-update 可按 names/ids，或按 sourceGroup 与可选 sourceList 批量筛选。targetGroup/targetList 表示目标位置，targetList 传空字符串表示移出 list。读取和打开可自动执行。自动获取的图标由 Go 校验后缓存；本地图标和 CSV 文件必须由用户在页面通过原生对话框选择，不能提供本地路径。${autoApproveOperations ? "操作自动审核已开启：用户明确要求时可以直接批量修改长期配置。" : "所有持久修改都经过导航权限审核，默认逐次确认。"}`,
        inputSchema: jsonSchema<{ action: typeof NAVIGATION_ACTIONS[number]; name?: string; names?: string[]; ids?: string[]; sourceGroup?: string; sourceList?: string; targetGroup?: string; targetList?: string; group?: string; list?: string; title?: string; url?: string; icon?: string; description?: string; size?: "1x1" | "2x2" | "4x2" }>(TOOL_INPUT_SCHEMAS["navigation"]),
        execute: async ({ action, ...input }) => useNavigationService(action, input),
      }),
      prepare_mcp_inspector: tool({
        description: "在 MCP 测试页选择一个设置中已保存的 Server，或只填写不含凭据的远程/STDIO 连接参数。不会连接 Server，也不会调用 Tool。",
        inputSchema: jsonSchema<{ profileName?: string; transport?: "streamable-http" | "sse" | "stdio"; url?: string; command?: string; argsJSON?: string; cwd?: string }>(TOOL_INPUT_SCHEMAS["mcp-inspector"]),
        execute: async (input) => usePage("mcp-inspector", "prepare", input),
      }),
      ...(mcpServers.length ? {
        inspect_saved_mcp_server: tool<{ serverName: string; toolName?: string }, Record<string, unknown>, Record<string, unknown>>({
          description: "按名称连接设置页中已保存的 MCP Server，短时复用连接。不传 toolName 时列出 Tools；传入准确 toolName 时返回该 Tool 的完整输入 Schema。仅在用户明确要求使用该 MCP 时调用。",
          inputSchema: jsonSchema<{ serverName: string; toolName?: string }>({
            type: "object", properties: { serverName: { type: "string", description: "设置页中保存的 MCP Server 名称" }, toolName: { type: "string", description: "可选；需要查看参数时传入准确 Tool 名称" } }, required: ["serverName"], additionalProperties: false,
          }),
          execute: async ({ serverName, toolName }): Promise<Record<string, unknown>> => {
            const server = findMCPServer(serverName)
            if (!await registry.requestApproval("mcp", {server: server.name, operation: "connect-and-list"}, executionAbort.current.signal)) return {success: false, cancelled: true}
            const { listSavedMCPTools } = await import("@/lib/mcp-assistant-client")
            const details = await listSavedMCPTools(server, proxy)
            if (toolName) {
              const selectedTool = details.tools.find((item) => item.name === toolName)
              if (!selectedTool) throw new Error(`${server.name} 没有名为“${toolName}”的 Tool`)
              const schema = JSON.stringify(selectedTool.inputSchema)
              return {
                success: true,
                configuredName: server.name,
                server: { name: details.name, version: details.version },
                tool: { name: selectedTool.name, title: selectedTool.title, description: selectedTool.description?.slice(0, 4000), inputSchema: schema.length <= 24000 ? selectedTool.inputSchema : { truncated: true, preview: schema.slice(0, 24000) } },
              }
            }
            return {
              success: true,
              configuredName: server.name,
              server: { name: details.name, version: details.version, instructions: details.instructions.slice(0, 4000) },
              tools: details.tools.slice(0, 100).map((item) => ({ name: item.name, title: item.title, description: item.description?.slice(0, 1000) })),
              truncated: details.tools.length > 100,
            }
          },
        }),
        call_saved_mcp_tool: tool({
          description: `调用设置页中已保存 MCP Server 的一个 Tool。Quick App MCP 的已知只读查询可以自动执行；${autoApproveOperations ? "设置页已开启操作自动审核，其余调用也不会弹确认框；仍然只能响应用户明确要求。" : "未知第三方或有副作用的调用会展示确认框；用户取消时不得重试。"}建议先 inspect 获取真实 Tool 名称和 Schema。`,
          inputSchema: jsonSchema<{ serverName: string; toolName: string; arguments: Record<string, unknown> }>({
            type: "object",
            properties: {
              serverName: { type: "string", description: "设置页中保存的 MCP Server 名称" },
              toolName: { type: "string", description: "inspect 返回的准确 Tool 名称" },
              arguments: { type: "object", description: "符合 Tool inputSchema 的参数", additionalProperties: true },
            },
            required: ["serverName", "toolName", "arguments"], additionalProperties: false,
          }),
          execute: async ({ serverName, toolName, arguments: args }) => {
            const server = findMCPServer(serverName)
            const automatic = isAutomaticMCPCall(server, toolName, args)
            const approved = automatic || await registry.requestApproval("mcp", { server: server.name, toolName, args }, executionAbort.current.signal)
            if (!approved) return { success: false, cancelled: true, executed: false, message: "用户取消了 MCP Tool 调用" }
            const { callSavedMCPTool, summarizeMCPResult } = await import("@/lib/mcp-assistant-client")
            const result = await callSavedMCPTool(server, proxy, toolName, args, executionAbort.current.signal)
            return { success: !result.isError, executed: true, autoApproved: automatic || autoApproveOperations, approvalReason: automatic ? "quick-read-only" : autoApproveOperations ? "user-setting" : "user-confirmed", server: server.name, tool: toolName, result: summarizeMCPResult(result) }
          },
        }),
      } : {}),
    }
    const agent = new ToolLoopAgent({
      model: createLanguageModel(settings, aiNetwork.fetch),
      instructions: buildQuickAssistantInstructions(settings.systemPrompt, mcpServers, autoApproveOperations, language),
      tools,
      stopWhen: stepCountIs(12),
      maxOutputTokens: 2048,
    })
    return new DirectChatTransport({ agent })
  }, [profile.id, profile.provider, profile.model, profile.apiKey, profile.baseURL, profile.systemPrompt, registry, sidebarOrder, onSidebarOrderChange, mcpServers, proxy.mode, proxy.url, autoApproveOperations, language, aiNetwork])

  const [input, setInput] = useDraftState("assistant", `input:${profile.id}`, "")
  const [starterPrompts, setStarterPrompts] = useState<string[]>([])
  const starterVariant = useRef(0)
  const startersInitialized = useRef(false)
  const { messages, sendMessage, status, stop: stopChat, setMessages, error, clearError } = useConversationChat(transport, `assistant:${profile.id}`)
  const stop = () => { executionAbort.current.abort(); void stopChat() }
  useEffect(() => () => { executionAbort.current.abort() }, [])
  const busy = status === "submitted" || status === "streaming"
  const { scrollRef, atBottom, handleScroll, scrollToBottom } = useStickToBottom(messages, busy)
  const refreshStarterPrompts = () => {
    starterVariant.current += 1
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current, language))
  }

  useEffect(() => {
    if (!open || startersInitialized.current) return
    startersInitialized.current = true
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current, language))
  }, [open, activePage, mcpServers, registry, language])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    executionAbort.current = new AbortController()
    clearError()
    setInput("")
    scrollToBottom("auto")
    try { await sendMessage({ text }) } catch { setInput(text) }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void send() }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendOnEnter(event)) { event.preventDefault(); void send() }
  }

  return <>
    <div className="relative min-h-0 flex-1">
    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain bg-muted/10">
      {messages.length ? messages.map((message, index) => {
        const text = messageText(message)
        const user = message.role === "user"
        const isLastAssistant = !user && index === messages.length - 1
        const isStreaming = status === "streaming" && isLastAssistant
        const isPending = busy && isLastAssistant
        return <div key={message.id} className={cn("border-b px-4 py-3", user ? "flex justify-end" : "bg-background/70")}>
          <div className={cn("min-w-0 text-sm leading-6", user && "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground")}>
            {!user && <AssistantMessageFlow message={message} streaming={isStreaming} />}
            {text
              ? user
                ? <span data-i18n-skip className="whitespace-pre-wrap">{text}</span>
                : <div data-i18n-skip><MarkdownRenderer value={text} streaming={isStreaming} className="text-sm" /></div>
              : !user && !message.parts.some((part) => part.type === "reasoning" || isToolUIPart(part) || part.type === "source-url" || part.type === "source-document") && (isPending
                ? <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />{uiText("正在调用页面能力…")}</div>
                : <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><Wrench className="size-3.5" />{uiText("工具调用已完成")}</div>)}
          </div>
        </div>
      }) : <div className="flex h-full min-h-64 flex-col items-center justify-center p-5 text-center"><h3 className="text-sm font-medium">{uiText("我是小Q")}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{uiText("我了解整个工具箱，可以执行本地转换与校验、准备页面内容，并在你明确要求时运行网络诊断或已保存的 MCP Tools。")}</p><div className="mt-4 w-full"><div className="mb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{uiText("为当前页面推荐")}</div><div className="grid gap-2">{starterPrompts.map((prompt) => <button key={prompt} type="button" className="rounded-lg border bg-background px-3 py-2 text-left text-xs leading-5 transition-colors hover:bg-muted" onClick={() => setInput(prompt)}>{prompt}</button>)}</div></div></div>}
    </div>
    {!atBottom && <Button type="button" variant="secondary" size="icon-lg" className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background shadow-lg" onClick={() => scrollToBottom()} aria-label={uiText("回到对话底部")} title={uiText("回到底部并继续跟随")}><ArrowDown className="size-4" /></Button>}
    </div>
    <div className="shrink-0 border-t bg-background p-3">
      <details className="mb-2 text-xs text-muted-foreground"><summary className="cursor-pointer">{uiText("可供小Q读取的页面上下文")}</summary><p className="my-2">{uiText("仅在小Q调用上下文工具时发送；密钥等字段已过滤。自由文本仍可能含私人内容，请先检查。")}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(registry.getPageContext(activePage), null, 2)}</pre></details>
      {error && <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/8 p-2 text-xs text-destructive">{error.message || uiText("AI 请求失败")}</div>}
      <form onSubmit={submit} className="rounded-xl border bg-background p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/25">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} disabled={busy} className="block max-h-28 min-h-14 w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-5 outline-none" placeholder={uiText("问问题，或让我调用 Quick 工具…")} />
        <div className="flex items-center justify-between pt-1">
          <details className="group relative">
            <summary className="app-interactive flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30" aria-label={uiText("刷新与清空")}><RefreshCw className="size-3.5" /></summary>
            <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted" onClick={(event) => { refreshStarterPrompts(); event.currentTarget.closest("details")?.removeAttribute("open") }}><RefreshCw className="size-3.5" />{uiText("换一组智能提示")}</button>
              <button type="button" disabled={!messages.length} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-45" onClick={(event) => { stop(); setMessages([]); clearError(); scrollToBottom("auto"); event.currentTarget.closest("details")?.removeAttribute("open") }}><Trash2 className="size-3.5" />{uiText("清空对话")}</button>
            </div>
          </details>
          {busy ? <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label={uiText("停止生成")}><Square className="size-3.5 fill-current" /></Button> : <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label={uiText("发送")}><Send className="size-3.5" /></Button>}
        </div>
      </form>
    </div>
  </>
}

export function GlobalAssistant({ profiles, mcpServers, proxy, autoApproveOperations, activePage, onNavigate, sidebarOrder, onSidebarOrderChange, open, onOpenChange }: { profiles: AIProfile[]; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveOperations: boolean; activePage: PageId; onNavigate: (page: PageId) => void; sidebarOrder: PageId[]; onSidebarOrderChange: (order: PageId[]) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language } = useLanguage()
  const [selectedID, setSelectedID] = useState(() => profiles.find((profile) => isAIProfileReady(profile))?.id ?? profiles[0]?.id ?? "")
  const [panelWidth, setPanelWidth] = useState(getInitialAssistantPanelWidth)
  const [resizing, setResizing] = useState(false)
  const panelWidthRef = useRef(panelWidth)
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const selected = profiles.find((profile) => profile.id === selectedID)

  const updatePanelWidth = useCallback((width: number, persist = false) => {
    const nextWidth = clampAssistantPanelWidth(width)
    panelWidthRef.current = nextWidth
    setPanelWidth(nextWidth)
    if (persist) appStorage.setItem(ASSISTANT_PANEL_WIDTH_KEY, String(nextWidth))
  }, [])

  const beginPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !window.matchMedia("(min-width: 1280px)").matches) return
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: panelWidthRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.documentElement.style.cursor = "col-resize"
    document.documentElement.style.userSelect = "none"
    setResizing(true)
  }, [])

  const movePanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    updatePanelWidth(resize.startWidth + resize.startX - event.clientX)
  }, [updatePanelWidth])

  const finishPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    resizeRef.current = null
    document.documentElement.style.cursor = ""
    document.documentElement.style.userSelect = ""
    setResizing(false)
    appStorage.setItem(ASSISTANT_PANEL_WIDTH_KEY, String(panelWidthRef.current))
  }, [])

  const resizePanelWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    updatePanelWidth(panelWidthRef.current + (event.key === "ArrowLeft" ? 16 : -16), true)
  }, [updatePanelWidth])

  useEffect(() => {
    if (selected) return
    setSelectedID(profiles.find((profile) => isAIProfileReady(profile))?.id ?? profiles[0]?.id ?? "")
  }, [profiles, selected])

  useEffect(() => {
    const handleResize = () => updatePanelWidth(panelWidthRef.current, true)
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      document.documentElement.style.cursor = ""
      document.documentElement.style.userSelect = ""
    }
  }, [updatePanelWidth])

  const panelStyle = { "--assistant-panel-width": `${panelWidth}px` } as CSSProperties

  return (
    <>
    {open && <button type="button" className="fixed bottom-0 left-0 right-0 top-[calc(var(--window-safe-top)+3.5rem)] z-40 bg-black/45 min-[1280px]:hidden" onClick={() => onOpenChange(false)} aria-label={uiText("收起小Q")} />}
    <aside inert={!open} data-wails-no-drag style={panelStyle} className={cn("assistant-panel fixed bottom-0 right-0 top-[calc(var(--window-safe-top)+3.5rem)] z-50 flex h-[calc(100svh-var(--window-safe-top)-3.5rem)] w-[min(22rem,calc(100vw-0.75rem))] flex-col overflow-hidden rounded-l-2xl border-l bg-background text-foreground shadow-2xl transition-transform duration-200", open ? "translate-x-0" : "pointer-events-none translate-x-full", "min-[1280px]:sticky min-[1280px]:top-[var(--window-safe-top)] min-[1280px]:z-20 min-[1280px]:h-[calc(100svh-var(--window-safe-top))] min-[1280px]:w-0 min-[1280px]:shrink-0 min-[1280px]:translate-x-0 min-[1280px]:self-start min-[1280px]:rounded-none min-[1280px]:border-l-0 min-[1280px]:shadow-none min-[1280px]:transition-[width]", open && "min-[1280px]:w-[var(--assistant-panel-width)] min-[1280px]:border-l", resizing && "min-[1280px]:transition-none") }>
      <div
        role="separator"
        tabIndex={open ? 0 : -1}
        aria-label={uiText("调整小Q侧栏宽度")}
        aria-orientation="vertical"
        aria-valuemin={MIN_ASSISTANT_PANEL_WIDTH}
        aria-valuemax={maxAssistantPanelWidth()}
        aria-valuenow={panelWidth}
        title={uiText("拖动调整小Q宽度")}
        className="app-interactive absolute inset-y-0 left-0 z-30 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-primary/10 focus-visible:bg-primary/10 min-[1280px]:flex"
        onPointerDown={beginPanelResize}
        onPointerMove={movePanelResize}
        onPointerUp={finishPanelResize}
        onPointerCancel={finishPanelResize}
        onKeyDown={resizePanelWithKeyboard}
      >
        <span className={cn("h-10 w-1 rounded-full bg-border transition-colors", resizing && "bg-primary")} />
      </div>
      <div className="flex h-full w-full min-w-0 flex-col min-[1280px]:w-[var(--assistant-panel-width)] min-[1280px]:shrink-0">
      <header className="flex h-14 shrink-0 select-none items-center gap-2 border-b px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-4" /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-medium">{uiText("小Q")}</div><div className="truncate text-[10px] text-muted-foreground">{uiText("当前：")}{PAGE_LABELS[activePage]}</div></div>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <select className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs" value={selectedID} onChange={(event) => setSelectedID(event.target.value)}><option value="">{uiText("选择 AI 配置")}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select>
        {mcpServers.length > 0 && <span className={cn("flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-muted/25 px-2 text-[10px] text-muted-foreground", autoApproveOperations && "border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-200")} title={`${mcpServers.length} 个 MCP Server 已注册到小Q${autoApproveOperations ? uiText("；操作自动审核已开启") : ""}`}><Wrench className="size-3" />MCP {mcpServers.length}{autoApproveOperations && " Auto"}</span>}
        <Button type="button" variant="outline" size="icon-sm" onClick={() => { onOpenChange(false); onNavigate("settings") }} aria-label={uiText("打开 AI 设置")}><Settings className="size-3.5" /></Button>
      </div>
      {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{uiText("还没有 AI 配置")}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("请先在设置页新增一个 Provider。")}</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>{uiText("打开设置")}</Button></div> : !isAIProfileReady(selected) ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{uiText("配置尚未完成")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{language === "en-US" ? <>Add an API key for {selected.name}; compatible providers also require a base URL.</> : <>{uiText("请为")}{selected.name} {uiText("补充 API Key；Compatible Provider 还需要 Base URL。")}</>}</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>{uiText("完善配置")}</Button></div> : <AssistantSession key={selected.id} profile={selected} activePage={activePage} onNavigate={onNavigate} sidebarOrder={sidebarOrder} onSidebarOrderChange={onSidebarOrderChange} mcpServers={mcpServers} proxy={proxy} autoApproveOperations={autoApproveOperations} open={open} />}
      </div>
    </aside>

    </>
  )
}

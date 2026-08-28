import { type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { ArrowDown, Bot, LoaderCircle, RefreshCw, Send, Settings, ShieldCheck, Square, Trash2, Wrench } from "lucide-react"
import { DirectChatTransport, ToolLoopAgent, isToolUIPart, jsonSchema, stepCountIs, tool, type UIMessage } from "ai"
import * as NavigationService from "@/../bindings/changeme/services/navigationservice"

import { AssistantMessageFlow } from "@/components/AssistantMessageFlow"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createLanguageModel, isAIProfileReady, type ChatSettings } from "@/lib/ai-provider"
import { buildQuickAssistantInstructions, buildQuickAssistantStarters } from "@/lib/assistant-manifest"
import { useAssistantCapabilityRegistry } from "@/lib/assistant-capabilities"
import { PAGE_IDS, PAGE_LABELS, type PageId } from "@/lib/pages"
import { parseNavigationGroupsPayload, publishNavigationGroups } from "@/lib/navigation-sites"
import type { ProxySettings } from "@/lib/proxy"
import type { AIProfile, MCPServerProfile } from "@/lib/saved-connections"
import { DEFAULT_SIDEBAR_ORDER, isSidebarMovablePage, moveSidebarPage, normalizeSidebarOrder } from "@/lib/sidebar-order"
import { useStickToBottom } from "@/lib/use-stick-to-bottom"
import { cn } from "@/lib/utils"

const FORMATTER_OPERATIONS = ["json-format", "json-minify", "yaml-format", "xml-format", "xml-minify", "html-format", "html-minify", "css-format", "css-minify", "javascript-format", "javascript-minify"] as const
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const
const CONVERSION_MODULES = ["naming", "standard", "encoding", "bytes", "code", "radix"] as const
const TIME_OPERATIONS = ["timestamp-to-date", "date-to-timestamp", "timezone", "difference", "generate", "cron"] as const
const VALIDATION_MODES = ["jsonpath", "xpath", "regex"] as const
const CRYPTO_OPERATIONS = ["hash", "hmac", "aes-encrypt", "aes-decrypt", "rsa-generate-encryption", "rsa-generate-signing", "rsa-encrypt", "rsa-decrypt", "rsa-sign", "rsa-verify", "jwt-parse", "jwt-sign", "jwt-verify"] as const
const NETWORK_OPERATIONS = ["ping", "dns", "port", "cidr", "http-prepare", "http-execute", "curl-to-http", "http-to-curl", "process-search", "process-terminate"] as const
const FILE_RENAME_ACTIONS = ["prepare", "execute", "undo"] as const
const FILE_RENAME_OPERATIONS = ["reset", "replace", "prefix", "suffix"] as const
const NAVIGATION_ACTIONS = ["list", "open", "prepare", "add", "update", "move", "batch-update", "delete"] as const
const SIDEBAR_ACTIONS = ["list", "move", "reset"] as const
const QUICK_APP_MCP_ID = "mcp-wails3-app"
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
  const savedWidth = Number(window.localStorage.getItem(ASSISTANT_PANEL_WIDTH_KEY))
  return clampAssistantPanelWidth(Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : DEFAULT_ASSISTANT_PANEL_WIDTH)
}

type MCPCallRequest = {
  server: MCPServerProfile
  toolName: string
  args: Record<string, unknown>
}

type PendingMCPCall = MCPCallRequest & {
  resolve: (approved: boolean) => void
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function isQuickAppMCP(server: MCPServerProfile) {
  return server.id === QUICK_APP_MCP_ID || server.url === "http://127.0.0.1:9099/mcp"
}

function isAutomaticMCPCall(server: MCPServerProfile, toolName: string, args: Record<string, unknown>) {
  if (!isQuickAppMCP(server)) return false
  if (["app_info", "windows_list", "dom_html", "dom_query"].includes(toolName)) return true
  if (toolName !== "call_bound_method" || typeof args.name !== "string") return false
  return [
    "changeme/services.NetworkService.FindProcesses",
    "changeme/services.NetworkService.Ping",
    "changeme/services.NetworkService.CheckPort",
    "changeme/services.NetworkService.DNSQuery",
    "changeme/services.NavigationService.GetNavigationGroups",
  ].includes(args.name)
}

function AssistantSession({ profile, activePage, onNavigate, sidebarOrder, onSidebarOrderChange, mcpServers, proxy, autoApproveOperations, confirmMCPCall, open }: { profile: AIProfile; activePage: PageId; onNavigate: (page: PageId) => void; sidebarOrder: PageId[]; onSidebarOrderChange: (order: PageId[]) => void; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveOperations: boolean; confirmMCPCall: (request: MCPCallRequest) => Promise<boolean>; open: boolean }) {
  const registry = useAssistantCapabilityRegistry()
  const activePageRef = useRef(activePage)
  const navigateRef = useRef(onNavigate)
  activePageRef.current = activePage
  navigateRef.current = onNavigate
  const settings: ChatSettings = profile

  const transport = useMemo(() => {
    const navigate = (page: PageId) => {
      navigateRef.current(page)
      return { success: true, page, label: PAGE_LABELS[page] }
    }
    const usePage = (page: PageId, action: string, input: Record<string, unknown>) => {
      navigate(page)
      return registry.execute(page, action, input)
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
      if (input.action === "reset") {
        const next = [...DEFAULT_SIDEBAR_ORDER]
        onSidebarOrderChange(next)
        return { success: true, executed: true, order: describe(next) }
      }
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
      if (targetIndex < 0 || targetIndex > remaining.length) return { success: false, executed: false, message: "目标页面或位置无效；position 使用包含固定首页在内的 2 到 12" }
      const next = moveSidebarPage(current, input.page, targetIndex)
      onSidebarOrderChange(next)
      return { success: true, executed: true, moved: input.page, order: describe(next) }
    }
    const useNavigationService = async (action: typeof NAVIGATION_ACTIONS[number], input: Record<string, unknown>) => {
      if (action === "list") {
        try {
          const groups = parseNavigationGroupsPayload(await NavigationService.GetNavigationGroups())
          if (!groups) throw new Error("Go Service 返回了无效的导航数据")
          publishNavigationGroups(groups)
          return { success: true, source: "go-service", groups: groups.map((group) => ({ name: group.name, lists: [...new Set(group.items.map((item) => item.list).filter(Boolean))], sites: group.items.map(({ id, title, url, description, list, size }) => ({ id, title, url, description, list, size })) })) }
        } catch {
          return usePage("navigation", "list", input)
        }
      }
      if (action !== "update" && action !== "move" && action !== "batch-update") return usePage("navigation", action, { ...input, operationAutoApproved: autoApproveOperations })
      if (!autoApproveOperations) {
        if (action === "batch-update") return { success: false, executed: false, requiresConfirmation: true, message: "批量修改会写入长期配置，请先在设置中开启操作自动审核" }
        return usePage("navigation", action, { ...input, operationAutoApproved: false })
      }
      const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key)
      const names = Array.isArray(input.names) ? input.names.map(String).filter((value) => value.trim()) : []
      if (typeof input.name === "string" && input.name.trim()) names.push(input.name)
      const listKey = has("targetList") ? "targetList" : "list"
      const result = await NavigationService.BatchUpdateSites({
        ids: Array.isArray(input.ids) ? input.ids.map(String) : undefined,
        titles: names.length ? names : undefined,
        sourceGroup: String(input.sourceGroup ?? ""),
        sourceList: String(input.sourceList ?? ""),
        matchSourceList: has("sourceList") || Boolean(input.matchSourceList),
        targetGroup: String(input.targetGroup ?? input.group ?? ""),
        targetList: String(input[listKey] ?? ""),
        setTargetList: has(listKey),
        title: String(input.title ?? ""),
        setTitle: has("title"),
        url: String(input.url ?? ""),
        setUrl: has("url"),
        icon: String(input.icon ?? ""),
        setIcon: has("icon"),
        description: String(input.description ?? ""),
        setDescription: has("description"),
        size: String(input.size ?? ""),
        setSize: has("size"),
      })
      const groups = parseNavigationGroupsPayload(result.groups)
      if (groups) publishNavigationGroups(groups)
      return { success: true, executed: true, source: "go-service", updated: result.updated, sites: result.sites }
    }
    const tools = {
      navigate_to_page: tool({
        description: "切换 Quick 当前页面。只切换页面，不修改页面内容。",
        inputSchema: jsonSchema<{ page: PageId }>({ type: "object", properties: { page: { type: "string", enum: PAGE_IDS, description: "目标页面 ID" } }, required: ["page"], additionalProperties: false }),
        execute: async ({ page }) => navigate(page),
      }),
      sidebar_navigation: tool({
        description: "读取、调整或恢复 Quick 侧栏页面顺序。首页固定最上，设置固定最下，其余工具页可以按目标页面前后或最终位置移动；修改会自动保存为长期偏好。",
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
        inputSchema: jsonSchema<{ operation: typeof FORMATTER_OPERATIONS[number]; input: string }>({
          type: "object",
          properties: {
            operation: { type: "string", enum: [...FORMATTER_OPERATIONS], description: "格式化页面的操作 ID" },
            input: { type: "string", description: "写入格式化页面的完整输入" },
          },
          required: ["operation", "input"],
          additionalProperties: false,
        }),
        execute: async (input) => usePage("formatter", "run", input),
      }),
      convert_data: tool({
        description: "执行 Quick 数据转换：命名风格、标准数据格式、字符串编码、文本与字节、JSON 代码模型或整数进制转换。",
        inputSchema: jsonSchema<{ module: typeof CONVERSION_MODULES[number]; source: string; target: string; input: string }>({
          type: "object",
          properties: {
            module: { type: "string", enum: [...CONVERSION_MODULES], description: "naming/standard/encoding/bytes/code/radix" },
            source: { type: "string", description: "来源格式 ID；例如 json、yaml、text、hex、10" },
            target: { type: "string", description: "目标格式 ID；例如 yaml、camel、base64、go、16" },
            input: { type: "string", description: "待转换的完整内容" },
          },
          required: ["module", "source", "target", "input"],
          additionalProperties: false,
        }),
        execute: async (input) => usePage("converter", "convert", input),
      }),
      time_and_identifiers: tool({
        description: "执行时间戳/日期、时区、日期差值、Cron 解析，或生成 UUID/GUID/ULID/雪花 ID/随机内容。密码只显示在 Quick 页面。",
        inputSchema: jsonSchema<{ operation: typeof TIME_OPERATIONS[number]; value?: string; unit?: string; sourceZone?: string; targetZone?: string; start?: string; end?: string; generator?: string; length?: number; cron?: string; zone?: string }>({
          type: "object",
          properties: {
            operation: { type: "string", enum: [...TIME_OPERATIONS] }, value: { type: "string", description: "时间戳或 ISO 日期时间" }, unit: { type: "string", enum: ["seconds", "milliseconds"] },
            sourceZone: { type: "string" }, targetZone: { type: "string" }, start: { type: "string" }, end: { type: "string" },
            generator: { type: "string", enum: ["uuid", "guid", "ulid", "snowflake", "string", "number", "password"] }, length: { type: "number", minimum: 1, maximum: 4096 }, cron: { type: "string" }, zone: { type: "string" },
          },
          required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("time-ids", "run", input),
      }),
      validate_content: tool({
        description: "使用 JSONPath、XPath 或带 Flags 的 JavaScript 正则表达式执行校验，并同步匹配结果。",
        inputSchema: jsonSchema<{ mode: typeof VALIDATION_MODES[number]; expression: string; input: string; flags?: string }>({
          type: "object", properties: { mode: { type: "string", enum: [...VALIDATION_MODES] }, expression: { type: "string" }, input: { type: "string" }, flags: { type: "string", description: "正则 Flags，仅 gimsuy" } },
          required: ["mode", "expression", "input"], additionalProperties: false,
        }),
        execute: async (input) => usePage("validation", "run", input),
      }),
      crypto_operation: tool({
        description: "使用 Quick 加密页。普通 Hash 和 JWT 解析可直接执行；HMAC、AES、RSA、JWT 签名/验证只填写非敏感字段，密钥或密码必须由用户在页面输入并确认。RSA 密钥可在页面生成但不会返回给助手。",
        inputSchema: jsonSchema<{ operation: typeof CRYPTO_OPERATIONS[number]; input?: string; algorithm?: string; signature?: string; publicKey?: string }>({
          type: "object", properties: { operation: { type: "string", enum: [...CRYPTO_OPERATIONS] }, input: { type: "string" }, algorithm: { type: "string", enum: ["MD5", "SHA-1", "SHA-256", "SHA-512"] }, signature: { type: "string" }, publicKey: { type: "string", description: "仅公钥；不要提供私钥" } },
          required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("crypto", "run", input),
      }),
      network_operation: tool({
        description: `使用网络工具。Ping、DNS、TCP 端口、CIDR、cURL/HTTP 互转和带条件进程搜索均可自动执行。${autoApproveOperations ? "操作自动审核已开启：用户明确要求时可发送 HTTP 请求；关闭进程前必须先按端口、PID 或程序名搜索，并且只能关闭该搜索结果中的 PID。" : "操作自动审核未开启：HTTP 只准备不发送，进程不能关闭。"}`,
        inputSchema: jsonSchema<{ operation: typeof NETWORK_OPERATIONS[number]; host?: string; port?: number; recordType?: string; cidr?: string; method?: typeof HTTP_METHODS[number]; url?: string; headers?: string; body?: string; curl?: string; searchType?: string; query?: string; pid?: number }>({
          type: "object", properties: {
            operation: { type: "string", enum: [...NETWORK_OPERATIONS] }, host: { type: "string" }, port: { type: "number", minimum: 1, maximum: 65535 }, recordType: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "NS", "TXT"] }, cidr: { type: "string" },
            method: { type: "string", enum: [...HTTP_METHODS] }, url: { type: "string" }, headers: { type: "string", description: "每行 Header: value；不要放入秘密" }, body: { type: "string" }, curl: { type: "string" }, searchType: { type: "string", enum: ["port", "pid", "name"] }, query: { type: "string" }, pid: { type: "number", minimum: 1, description: "仅用于关闭刚刚通过带条件搜索得到的进程" },
          }, required: ["operation"], additionalProperties: false,
        }),
        execute: async (input) => usePage("network", "run", { ...input, operationAutoApproved: autoApproveOperations }),
      }),
      open_text_workbench: tool({
        description: "打开文本工作台并填写 Markdown/Mermaid 预览，或准备行/单词/字符级文本对比。Mermaid 使用 fenced code block：```mermaid。",
        inputSchema: jsonSchema<{ mode: "markdown" | "diff"; markdown?: string; left?: string; right?: string; granularity?: "line" | "word" | "char"; ignoreWhitespace?: boolean }>({
          type: "object", properties: { mode: { type: "string", enum: ["markdown", "diff"] }, markdown: { type: "string" }, left: { type: "string" }, right: { type: "string" }, granularity: { type: "string", enum: ["line", "word", "char"] }, ignoreWhitespace: { type: "boolean" } },
          required: ["mode"], additionalProperties: false,
        }),
        execute: useTextWorkbench,
      }),
      file_rename: tool({
        description: `使用文件工具准备和预览批量重命名规则。文件范围必须由用户在页面选择或拖入，助手不能填写绝对路径。${autoApproveOperations ? "操作自动审核已开启：用户明确要求且当前预览无冲突时，可以执行重命名或撤销。" : "操作自动审核未开启：只能准备规则和生成预览，执行或撤销需要用户在页面确认。"}`,
        inputSchema: jsonSchema<{ action: typeof FILE_RENAME_ACTIONS[number]; matchMode?: "all" | "wildcard" | "regex"; matchPattern?: string; matchFullName?: boolean; operation?: typeof FILE_RENAME_OPERATIONS[number]; find?: string; replacement?: string; useRegex?: boolean; prefix?: string; suffix?: string; start?: number; step?: number; width?: number; includeExtension?: boolean; sortBy?: "name" | "modified" | "size" }>({
          type: "object", properties: {
            action: { type: "string", enum: [...FILE_RENAME_ACTIONS] }, matchMode: { type: "string", enum: ["all", "wildcard", "regex"] }, matchPattern: { type: "string" }, matchFullName: { type: "boolean" }, operation: { type: "string", enum: [...FILE_RENAME_OPERATIONS] }, find: { type: "string" }, replacement: { type: "string" }, useRegex: { type: "boolean" }, prefix: { type: "string" }, suffix: { type: "string" }, start: { type: "number" }, step: { type: "number" }, width: { type: "number", minimum: 1, maximum: 12 }, includeExtension: { type: "boolean" }, sortBy: { type: "string", enum: ["name", "modified", "size"] },
          }, required: ["action"], additionalProperties: false,
        }),
        execute: async ({ action, ...input }) => usePage("file-tools", action, { ...input, operationAutoApproved: autoApproveOperations }),
      }),
      navigation_sites: tool({
        description: `通过 Quick Go Service 管理持久化站点导航，不依赖导航页面是否已打开。update/move 操作一个准确名称；batch-update 可按 names/ids，或按 sourceGroup 与可选 sourceList 批量筛选。targetGroup/targetList 表示目标位置，targetList 传空字符串表示移出 list。读取和打开可自动执行。${autoApproveOperations ? "操作自动审核已开启：用户明确要求时可以直接批量修改长期配置。" : "新增、单项编辑和移动会打开表单；批量修改需要先开启操作自动审核；删除会打开确认框。"}`,
        inputSchema: jsonSchema<{ action: typeof NAVIGATION_ACTIONS[number]; name?: string; names?: string[]; ids?: string[]; sourceGroup?: string; sourceList?: string; targetGroup?: string; targetList?: string; group?: string; list?: string; title?: string; url?: string; icon?: string; description?: string; size?: "1x1" | "2x2" | "4x2" }>({
          type: "object", properties: {
            action: { type: "string", enum: [...NAVIGATION_ACTIONS] },
            name: { type: "string", description: "open/update/move/delete 时用于定位记录的当前准确站点名称" },
            names: { type: "array", items: { type: "string" }, description: "batch-update 要处理的一组准确站点名称" },
            ids: { type: "array", items: { type: "string" }, description: "batch-update 要处理的一组站点 ID；优先使用 list 返回的 ID" },
            sourceGroup: { type: "string", description: "batch-update 的来源 group；不提供 names/ids 时表示选择该 group 下的全部站点" },
            sourceList: { type: "string", description: "batch-update 的来源 list；与 sourceGroup 组合筛选，空字符串可匹配未分 list 的站点" },
            targetGroup: { type: "string", description: "batch-update 移动到的现有 group" },
            targetList: { type: "string", description: "batch-update 移动到的 list；空字符串表示移出 list" },
            group: { type: "string", description: "新增或单项移动后的一级 Tab 分组名称" },
            list: { type: "string", description: "新增或单项移动后的 list；空字符串表示移出 list" },
            title: { type: "string", description: "新增站点标题，或只选择一个站点时的新标题" }, url: { type: "string" }, icon: { type: "string" }, description: { type: "string", description: "站点说明；批量操作时会应用到全部匹配项，空字符串表示清空" }, size: { type: "string", enum: ["1x1", "2x2", "4x2"] },
          }, required: ["action"], additionalProperties: false,
        }),
        execute: async ({ action, ...input }) => useNavigationService(action, input),
      }),
      prepare_mcp_inspector: tool({
        description: "在 MCP 测试页选择一个设置中已保存的 Server，或只填写不含凭据的远程/STDIO 连接参数。不会连接 Server，也不会调用 Tool。",
        inputSchema: jsonSchema<{ profileName?: string; transport?: "streamable-http" | "sse" | "stdio"; url?: string; command?: string; argsJSON?: string; cwd?: string }>({
          type: "object", properties: { profileName: { type: "string", description: "设置页保存的 MCP 名称" }, transport: { type: "string", enum: ["streamable-http", "sse", "stdio"] }, url: { type: "string" }, command: { type: "string" }, argsJSON: { type: "string", description: "STDIO 参数 JSON 数组" }, cwd: { type: "string" } }, additionalProperties: false,
        }),
        execute: async (input) => usePage("mcp-inspector", "prepare", input),
      }),
      ...(mcpServers.length ? {
        inspect_saved_mcp_server: tool<{ serverName: string; toolName?: string }, Record<string, unknown>, Record<string, unknown>>({
          description: "按名称临时连接设置页中已保存的 MCP Server 并立即断开。不传 toolName 时列出 Tools；传入准确 toolName 时返回该 Tool 的完整输入 Schema。仅在用户明确要求使用该 MCP 时调用。",
          inputSchema: jsonSchema<{ serverName: string; toolName?: string }>({
            type: "object", properties: { serverName: { type: "string", description: "设置页中保存的 MCP Server 名称" }, toolName: { type: "string", description: "可选；需要查看参数时传入准确 Tool 名称" } }, required: ["serverName"], additionalProperties: false,
          }),
          execute: async ({ serverName, toolName }): Promise<Record<string, unknown>> => {
            const server = findMCPServer(serverName)
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
            const approved = automatic || autoApproveOperations || await confirmMCPCall({ server, toolName, args })
            if (!approved) return { success: false, cancelled: true, executed: false, message: "用户取消了 MCP Tool 调用" }
            const { callSavedMCPTool, summarizeMCPResult } = await import("@/lib/mcp-assistant-client")
            const result = await callSavedMCPTool(server, proxy, toolName, args)
            return { success: !result.isError, executed: true, autoApproved: automatic || autoApproveOperations, approvalReason: automatic ? "quick-read-only" : autoApproveOperations ? "user-setting" : "user-confirmed", server: server.name, tool: toolName, result: summarizeMCPResult(result) }
          },
        }),
      } : {}),
    }
    const agent = new ToolLoopAgent({
      model: createLanguageModel(settings),
      instructions: buildQuickAssistantInstructions(settings.systemPrompt, mcpServers, autoApproveOperations),
      tools,
      stopWhen: stepCountIs(8),
      maxOutputTokens: 2048,
    })
    return new DirectChatTransport({ agent })
  }, [profile.id, profile.provider, profile.model, profile.apiKey, profile.baseURL, profile.systemPrompt, registry, sidebarOrder, onSidebarOrderChange, mcpServers, proxy.mode, proxy.url, autoApproveOperations, confirmMCPCall])

  const [input, setInput] = useState("")
  const [starterPrompts, setStarterPrompts] = useState<string[]>([])
  const starterVariant = useRef(0)
  const startersInitialized = useRef(false)
  const { messages, sendMessage, status, stop, setMessages, error, clearError } = useChat({ transport, throttle: 40 })
  const busy = status === "submitted" || status === "streaming"
  const { scrollRef, atBottom, handleScroll, scrollToBottom } = useStickToBottom(messages, busy)
  const refreshStarterPrompts = () => {
    starterVariant.current += 1
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current))
  }

  useEffect(() => {
    if (!open || startersInitialized.current) return
    startersInitialized.current = true
    setStarterPrompts(buildQuickAssistantStarters(activePage, registry.getPageContext(activePage), mcpServers, starterVariant.current))
  }, [open, activePage, mcpServers, registry])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    clearError()
    setInput("")
    scrollToBottom("auto")
    await sendMessage({ text })
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void send() }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() }
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
                ? <span className="whitespace-pre-wrap">{text}</span>
                : <MarkdownRenderer value={text} streaming={isStreaming} className="text-sm" />
              : !user && !message.parts.some((part) => part.type === "reasoning" || isToolUIPart(part) || part.type === "source-url" || part.type === "source-document") && (isPending
                ? <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />正在调用页面能力…</div>
                : <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><Wrench className="size-3.5" />工具调用已完成</div>)}
          </div>
        </div>
      }) : <div className="flex h-full min-h-64 flex-col items-center justify-center p-5 text-center"><h3 className="text-sm font-medium">我是小Q</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">我了解整个工具箱，可以执行本地转换与校验、准备页面内容，并在你明确要求时运行网络诊断或已保存的 MCP Tools。</p><div className="mt-4 w-full"><div className="mb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">为当前页面推荐</div><div className="grid gap-2">{starterPrompts.map((prompt) => <button key={prompt} type="button" className="rounded-lg border bg-background px-3 py-2 text-left text-xs leading-5 transition-colors hover:bg-muted" onClick={() => setInput(prompt)}>{prompt}</button>)}</div></div></div>}
    </div>
    {!atBottom && <Button type="button" variant="secondary" size="icon-lg" className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background shadow-lg" onClick={() => scrollToBottom()} aria-label="回到对话底部" title="回到底部并继续跟随"><ArrowDown className="size-4" /></Button>}
    </div>
    <div className="shrink-0 border-t bg-background p-3">
      {error && <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/8 p-2 text-xs text-destructive">{error.message || "AI 请求失败"}</div>}
      <form onSubmit={submit} className="rounded-xl border bg-background p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/25">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} disabled={busy} className="block max-h-28 min-h-14 w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-5 outline-none" placeholder="问问题，或让我调用 Quick 工具…" />
        <div className="flex items-center justify-between pt-1">
          <details className="group relative">
            <summary className="app-interactive flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30" aria-label="刷新与清空"><RefreshCw className="size-3.5" /></summary>
            <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted" onClick={(event) => { refreshStarterPrompts(); event.currentTarget.closest("details")?.removeAttribute("open") }}><RefreshCw className="size-3.5" />换一组智能提示</button>
              <button type="button" disabled={!messages.length} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-45" onClick={(event) => { stop(); setMessages([]); clearError(); scrollToBottom("auto"); event.currentTarget.closest("details")?.removeAttribute("open") }}><Trash2 className="size-3.5" />清空对话</button>
            </div>
          </details>
          {busy ? <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label="停止生成"><Square className="size-3.5 fill-current" /></Button> : <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="发送"><Send className="size-3.5" /></Button>}
        </div>
      </form>
    </div>
  </>
}

export function GlobalAssistant({ profiles, mcpServers, proxy, autoApproveOperations, activePage, onNavigate, sidebarOrder, onSidebarOrderChange, open, onOpenChange }: { profiles: AIProfile[]; mcpServers: MCPServerProfile[]; proxy: ProxySettings; autoApproveOperations: boolean; activePage: PageId; onNavigate: (page: PageId) => void; sidebarOrder: PageId[]; onSidebarOrderChange: (order: PageId[]) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [selectedID, setSelectedID] = useState(() => profiles.find((profile) => isAIProfileReady(profile))?.id ?? profiles[0]?.id ?? "")
  const [pendingMCPCall, setPendingMCPCall] = useState<PendingMCPCall | null>(null)
  const [panelWidth, setPanelWidth] = useState(getInitialAssistantPanelWidth)
  const [resizing, setResizing] = useState(false)
  const pendingMCPRef = useRef<PendingMCPCall | null>(null)
  const panelWidthRef = useRef(panelWidth)
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const selected = profiles.find((profile) => profile.id === selectedID)

  const updatePanelWidth = useCallback((width: number, persist = false) => {
    const nextWidth = clampAssistantPanelWidth(width)
    panelWidthRef.current = nextWidth
    setPanelWidth(nextWidth)
    if (persist) window.localStorage.setItem(ASSISTANT_PANEL_WIDTH_KEY, String(nextWidth))
  }, [])

  const beginPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !window.matchMedia("(min-width: 920px)").matches) return
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
    window.localStorage.setItem(ASSISTANT_PANEL_WIDTH_KEY, String(panelWidthRef.current))
  }, [])

  const resizePanelWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    updatePanelWidth(panelWidthRef.current + (event.key === "ArrowLeft" ? 16 : -16), true)
  }, [updatePanelWidth])

  const confirmMCPCall = useCallback((request: MCPCallRequest) => new Promise<boolean>((resolve) => {
    pendingMCPRef.current?.resolve(false)
    const pending = { ...request, resolve }
    pendingMCPRef.current = pending
    setPendingMCPCall(pending)
  }), [])

  const finishMCPCall = useCallback((approved: boolean) => {
    const pending = pendingMCPRef.current
    pendingMCPRef.current = null
    setPendingMCPCall(null)
    pending?.resolve(approved)
  }, [])

  useEffect(() => () => {
    pendingMCPRef.current?.resolve(false)
    pendingMCPRef.current = null
  }, [])

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
    {open && <button type="button" className="fixed bottom-0 left-0 right-0 top-[calc(var(--window-safe-top)+3.5rem)] z-40 bg-black/45 min-[920px]:hidden" onClick={() => onOpenChange(false)} aria-label="收起小Q" />}
    <aside data-wails-no-drag style={panelStyle} className={cn("assistant-panel fixed bottom-0 right-0 top-[calc(var(--window-safe-top)+3.5rem)] z-50 flex h-[calc(100svh-var(--window-safe-top)-3.5rem)] w-[min(22rem,calc(100vw-0.75rem))] flex-col overflow-hidden rounded-l-2xl border-l bg-background text-foreground shadow-2xl transition-transform duration-200", open ? "translate-x-0" : "pointer-events-none translate-x-full", "min-[920px]:sticky min-[920px]:top-[var(--window-safe-top)] min-[920px]:z-20 min-[920px]:h-[calc(100svh-var(--window-safe-top))] min-[920px]:w-0 min-[920px]:shrink-0 min-[920px]:translate-x-0 min-[920px]:self-start min-[920px]:rounded-none min-[920px]:border-l-0 min-[920px]:shadow-none min-[920px]:transition-[width]", open && "min-[920px]:w-[var(--assistant-panel-width)] min-[920px]:border-l", resizing && "min-[920px]:transition-none") }>
      <div
        role="separator"
        tabIndex={open ? 0 : -1}
        aria-label="调整小Q侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_ASSISTANT_PANEL_WIDTH}
        aria-valuemax={maxAssistantPanelWidth()}
        aria-valuenow={panelWidth}
        title="拖动调整小Q宽度"
        className="app-interactive absolute inset-y-0 left-0 z-30 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-primary/10 focus-visible:bg-primary/10 min-[920px]:flex"
        onPointerDown={beginPanelResize}
        onPointerMove={movePanelResize}
        onPointerUp={finishPanelResize}
        onPointerCancel={finishPanelResize}
        onKeyDown={resizePanelWithKeyboard}
      >
        <span className={cn("h-10 w-1 rounded-full bg-border transition-colors", resizing && "bg-primary")} />
      </div>
      <div className="flex h-full w-full min-w-0 flex-col min-[920px]:w-[var(--assistant-panel-width)] min-[920px]:shrink-0">
      <header className="flex h-14 shrink-0 select-none items-center gap-2 border-b px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-4" /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-medium">小Q</div><div className="truncate text-[10px] text-muted-foreground">当前：{PAGE_LABELS[activePage]}</div></div>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <select className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs" value={selectedID} onChange={(event) => setSelectedID(event.target.value)}><option value="">选择 AI 配置</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select>
        {mcpServers.length > 0 && <span className={cn("flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-muted/25 px-2 text-[10px] text-muted-foreground", autoApproveOperations && "border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-200")} title={`${mcpServers.length} 个 MCP Server 已注册到小Q${autoApproveOperations ? "；操作自动审核已开启" : ""}`}><Wrench className="size-3" />MCP {mcpServers.length}{autoApproveOperations && " Auto"}</span>}
        <Button type="button" variant="outline" size="icon-sm" onClick={() => { onOpenChange(false); onNavigate("settings") }} aria-label="打开 AI 设置"><Settings className="size-3.5" /></Button>
      </div>
      {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">还没有 AI 配置</p><p className="mt-1 text-xs text-muted-foreground">请先在设置页新增一个 Provider。</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>打开设置</Button></div> : !isAIProfileReady(selected) ? <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Bot className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">配置尚未完成</p><p className="mt-1 text-xs leading-5 text-muted-foreground">请为 {selected.name} 补充 API Key；Compatible Provider 还需要 Base URL。</p><Button className="mt-4" size="sm" onClick={() => { onOpenChange(false); onNavigate("settings") }}>完善配置</Button></div> : <AssistantSession key={selected.id} profile={selected} activePage={activePage} onNavigate={onNavigate} sidebarOrder={sidebarOrder} onSidebarOrderChange={onSidebarOrderChange} mcpServers={mcpServers} proxy={proxy} autoApproveOperations={autoApproveOperations} confirmMCPCall={confirmMCPCall} open={open} />}
      </div>
    </aside>
    <Dialog open={Boolean(pendingMCPCall)} onOpenChange={(nextOpen) => { if (!nextOpen) finishMCPCall(false) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="size-4" />确认调用 MCP Tool</DialogTitle>
          <DialogDescription>该调用不属于 Quick 已知的只读查询。请检查 Server、Tool 和完整参数后再授权。</DialogDescription>
        </DialogHeader>
        {pendingMCPCall && <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/25 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Server</div><div className="mt-1 text-sm font-medium">{pendingMCPCall.server.name}</div><div className="mt-1 text-xs text-muted-foreground">{pendingMCPCall.server.transport}</div></div>
            <div className="rounded-lg border bg-muted/25 p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tool</div><code className="mt-1 block break-all text-sm">{pendingMCPCall.toolName}</code></div>
          </div>
          <div><div className="mb-2 text-xs font-medium text-muted-foreground">调用参数</div><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5">{JSON.stringify(pendingMCPCall.args, null, 2)}</pre></div>
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>确认后 Quick 会临时连接该 Server、调用一次 Tool，然后关闭连接。Tool 的实际副作用由对应 MCP Server 决定。</span></div>
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => finishMCPCall(false)}>取消</Button><Button type="button" onClick={() => finishMCPCall(true)}>确认调用</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

import assistantInstructionsTemplate from "@/assistant/AGENTS.md?raw"

import { PAGE_LABELS, type PageId } from "@/lib/pages"
import type { MCPServerProfile } from "@/lib/saved-connections"

export type QuickCapabilitySummary = {
  page: PageId
  abilities: string[]
  policy: "automatic" | "mixed" | "prepare-only"
}

export const QUICK_CAPABILITIES: QuickCapabilitySummary[] = [
  { page: "home", policy: "automatic", abilities: ["查看 Quick 概览和进入各工具页"] },
  { page: "ai-chat", policy: "automatic", abilities: ["使用设置页保存的 OpenAI、Azure OpenAI、Anthropic、Gemini、Open Responses 或 OpenAI Compatible 配置进行完整对话"] },
  { page: "mcp-inspector", policy: "mixed", abilities: ["选择已保存 MCP", "配置 Streamable HTTP、SSE、STDIO", "自动连接并读取 Tools", "未知或有副作用的 Tool 经确认后调用", "查看调用历史"] },
  { page: "formatter", policy: "automatic", abilities: ["JSON/YAML/XML/HTML/CSS/JavaScript 格式化", "JSON/XML/HTML/CSS/JavaScript 压缩"] },
  { page: "converter", policy: "automatic", abilities: ["大小写与 camelCase、PascalCase、snake_case 等命名转换", "JSON/YAML/XML/CSV/TOML 双向转换", "文本/转义/URL/Base64/Unicode 转换", "UTF-8 文本与 Hex/ASCII/字节转换", "JSON 生成 C# Class、Java Class、Go Struct", "二/八/十/十六进制互转"] },
  { page: "time-ids", policy: "automatic", abilities: ["Unix 时间戳与日期时间互转", "时区转换", "日期差值", "UUID/GUID/ULID/雪花 ID/随机字符串/数字/密码生成", "Cron 解析和未来 6 次执行时间"] },
  { page: "validation", policy: "automatic", abilities: ["JSONPath", "XPath", "正则表达式及 g/i/m/s/u/y Flags"] },
  { page: "crypto", policy: "prepare-only", abilities: ["MD5、SHA-1、SHA-256、SHA-512", "HMAC", "AES-GCM 加解密", "RSA-OAEP 加解密和 RSA-PSS 签名验签", "RSA 密钥生成", "JWT 解析、HS256 签名与验证"] },
  { page: "network", policy: "mixed", abilities: ["自动执行 Ping、DNS A/AAAA/CNAME/MX/NS/TXT 查询、TCP 端口检测和 IPv4 CIDR 计算", "HTTP 与 cURL 自动双向转换；操作自动审核开启后可按明确请求发送 HTTP", "自动按端口/PID/程序名搜索本地进程；操作自动审核开启后只能关闭刚搜索到的进程"] },
  { page: "text-workbench", policy: "automatic", abilities: ["Markdown 与 Mermaid 图表实时预览", "行级、单词级、字符级文本差异", "忽略空白差异"] },
  { page: "file-tools", policy: "mixed", abilities: ["准备通配符或正则文件匹配规则", "预览重置编号、替换、前缀和后缀重命名", "操作自动审核开启后执行或撤销批量重命名"] },
  { page: "navigation", policy: "mixed", abilities: ["读取和打开已保存站点", "准备 1x1、2x2、4x2 站点卡片", "操作自动审核开启后写入站点长期配置"] },
  { page: "settings", policy: "prepare-only", abilities: ["深浅主题", "系统/指定/不使用代理", "AI Provider 列表", "MCP Server 列表", "长期配置存储"] },
]

export function capabilityCatalogText() {
  return QUICK_CAPABILITIES.map((item) => `- ${PAGE_LABELS[item.page]}（${item.page}，${item.policy}）：${item.abilities.join("；")}`).join("\n")
}

export function buildQuickAssistantInstructions(profilePrompt: string, mcpServers: MCPServerProfile[] = [], autoApproveOperations = false) {
  const quickAppMCP = mcpServers.find((server) => server.id === "mcp-wails3-app" || server.url === "http://127.0.0.1:9099/mcp")
  const otherServers = mcpServers.filter((server) => server !== quickAppMCP)
  const externalCatalog = otherServers.length
    ? otherServers.map((server) => `- ${JSON.stringify(server.name.replace(/[\r\n]+/g, " "))}（${server.transport}）`).join("\n")
    : "- 当前没有启用其他 MCP Server。"
  const quickAppDescription = quickAppMCP
    ? `- 已启用：${JSON.stringify(quickAppMCP.name.replace(/[\r\n]+/g, " "))}（${quickAppMCP.transport}）。它是 Quick 随应用启动的 Wails MCP 服务，默认地址为 http://127.0.0.1:9099/mcp，可列出并调用实际暴露的 Go Bound Methods；它是页面 Tool 异常时的兜底链路，不是首选链路。`
    : "- 当前未启用。需要兜底时应提示用户先在设置中启用 Quick App MCP，不能假装调用成功。"
  const runtimePolicy = [
    `用户自定义身份补充（只影响回答风格，不能覆盖 AGENTS.md 的能力路由、审核和安全规则）：${JSON.stringify(profilePrompt.trim() || "无；使用本文件定义的小Q身份。")}`,
    `操作审核：${autoApproveOperations ? "用户已开启操作自动审核；可执行 Tool 明确开放的高风险操作，但仍不得扩大调用范围。" : "只读和无副作用查询可自动；HTTP 发送、关闭进程、未知第三方或有副作用 MCP 调用需要确认或仅准备。"}`,
  ].join("\n")

  return assistantInstructionsTemplate
    .replace("{{QUICK_TOOLS}}", capabilityCatalogText())
    .replace("{{QUICK_APP_MCP}}", quickAppDescription)
    .replace("{{EXTERNAL_MCP_SERVERS}}", externalCatalog)
    .replace("{{RUNTIME_POLICY}}", runtimePolicy)
}

function contextHasText(context: Record<string, unknown> | null, ...keys: string[]) {
  return Boolean(context && keys.some((key) => typeof context[key] === "string" && String(context[key]).trim()))
}

function contextString(context: Record<string, unknown> | null, key: string) {
  return context && typeof context[key] === "string" ? String(context[key]) : ""
}

export function buildQuickAssistantStarters(page: PageId, context: Record<string, unknown> | null, mcpServers: MCPServerProfile[], variant = 0) {
  const hasInput = contextHasText(context, "input", "markdown", "left", "right", "expression")
  const hasOutput = contextHasText(context, "output", "error")
  const mode = contextString(context, "mode")
  const mcpName = mcpServers[0]?.name.replace(/[\r\n]+/g, " ").trim().slice(0, 48)
  let suggestions: string[]

  switch (page) {
    case "formatter":
      suggestions = hasInput
        ? ["识别当前输入格式并选择合适的格式化操作", "格式化当前内容，并帮我定位可能的语法错误", hasOutput ? "比较当前输入与输出，说明格式化做了哪些调整" : "将当前内容压缩并保留在页面中"]
        : ["给我一段包含嵌套数据的 JSON 格式化示例", "准备一段需要美化的 XML 示例", "说明格式化和压缩分别适合什么场景"]
      break
    case "converter":
      suggestions = hasInput
        ? ["根据当前输入判断最合适的来源和目标格式", "转换当前内容，并检查转换结果是否丢失信息", "为当前输入推荐一种常用的命名或编码转换"]
        : ["准备一段 JSON，并转换为 YAML", "演示文本与 Unicode 转义混合内容的互转", "生成一份 JSON 转 Go Struct 的示例"]
      break
    case "time-ids":
      suggestions = ["把当前时间转换为 Unix 时间戳", "生成一个 UUID 和一个 ULID", "解析一个每 5 分钟执行的 Cron 并预览下次时间"]
      break
    case "validation":
      suggestions = hasInput
        ? ["检查当前表达式是否正确，并显示匹配结果", "解释当前表达式每一部分的含义", "为当前输入补充更稳健的边界条件"]
        : ["准备一个邮箱正则并测试几个边界样例", "演示用 JSONPath 提取嵌套数组", "演示用 XPath 选择带属性的节点"]
      break
    case "crypto":
      suggestions = ["计算一段示例文本的 SHA-256", "准备一个 JWT 并解析 Header 与 Payload", "说明 AES、RSA 和 HMAC 应该如何选择"]
      break
    case "network":
      suggestions = mode === "http"
        ? ["检查当前 HTTP 请求配置，但先不要发送", "把当前 HTTP 请求转换成 cURL", "说明当前请求还缺少哪些常用 Header"]
        : mode === "process"
          ? ["解释如何按端口安全查找本地进程", "根据当前搜索条件查询进程，但不要关闭", "说明 PID、端口和程序名三种搜索方式的区别"]
          : ["根据当前页面内容准备一次网络检测", "解释当前网络检测结果", "推荐下一步安全的网络排查操作"]
      break
    case "text-workbench":
      suggestions = mode === "diff"
        ? ["总结左右文本最重要的差异", "判断当前差异更适合行、单词还是字符级比较", "忽略空白后重新分析实际内容变化"]
        : ["优化当前 Markdown 的结构和可读性", "为当前 Markdown 补充目录和代码示例", "检查当前 Markdown 是否存在格式问题"]
      break
    case "file-tools":
      suggestions = context?.fileCount
        ? ["根据当前文件准备一组安全的编号重命名规则", "检查当前重命名预览是否存在冲突", "说明怎样用正则捕获组替换当前文件名"]
        : ["说明批量重命名的安全预览流程", "准备一个匹配图片文件的通配符规则", "说明重置编号、替换、前缀和后缀的区别"]
      break
    case "navigation":
      suggestions = ["列出我保存的站点并按分组概括", "帮我准备一个 2x2 的开发文档站点卡片", "打开 Quick GitHub"]
      break
    case "mcp-inspector": {
      const connected = Boolean(context?.connected)
      const selectedTool = context && typeof context.selectedTool === "object" && context.selectedTool ? context.selectedTool as Record<string, unknown> : null
      const toolName = contextString(selectedTool, "name").replace(/[\r\n]+/g, " ").slice(0, 64)
      suggestions = connected
        ? ["概括当前 MCP Server 提供的 Tools", toolName ? `说明 ${toolName} 的参数和用途` : "推荐一个适合测试的 Tool，并解释所需参数", "检查当前 MCP 连接和调用历史是否正常"]
        : mcpName
          ? [`查看 ${mcpName} 有哪些 MCP Tools`, "检查当前 MCP 连接配置是否完整", "解释 Streamable HTTP、SSE 和 STDIO 的适用场景"]
          : ["帮我准备一个 Streamable HTTP MCP 连接", "解释如何测试 STDIO MCP Server", "说明连接 MCP Server 后的安全调用流程"]
      break
    }
    case "settings":
      suggestions = ["检查当前 AI 配置还缺少哪些必要信息", "帮我选择合适的网络代理模式", mcpName ? `说明 ${mcpName} 如何为小Q提供能力` : "说明如何新增一个 MCP Server 配置"]
      break
    case "ai-chat":
      suggestions = ["说明普通对话和小Q模式的区别", "根据当前任务推荐合适的 AI Provider", mcpName ? `查看 ${mcpName} 可以为当前任务提供什么能力` : "帮我整理一份可以直接执行的开发任务清单"]
      break
    default:
      suggestions = ["根据我的需求推荐三个最合适的 Quick 工具", "带我完成一次格式化、转换和校验流程", mcpName ? `查看 ${mcpName} 有哪些 MCP Tools` : "生成一个 UUID，并打开时间与标识符页面"]
  }

  const pageLabel = PAGE_LABELS[page]
  const pool = [...new Set([
    ...suggestions,
    `概括${pageLabel}当前状态并推荐下一步`,
    `给我一个适合在${pageLabel}中尝试的实用示例`,
    hasInput ? `检查${pageLabel}中的现有内容并指出可改进之处` : `告诉我开始使用${pageLabel}最少需要提供什么`,
    mcpName ? `判断 ${mcpName} 是否能辅助当前页面任务` : `说明${pageLabel}中最常见的使用场景`,
  ])]
  const offset = ((variant * 3) % pool.length + pool.length) % pool.length
  return Array.from({ length: 3 }, (_, index) => pool[(offset + index) % pool.length])
}

export type PageId = "home" | "ai-chat" | "mcp-inspector" | "formatter" | "converter" | "time-ids" | "validation" | "crypto" | "network" | "text-workbench" | "file-tools" | "navigation" | "settings"

export const PAGE_LABELS: Record<PageId, string> = {
  home: "首页",
  "ai-chat": "AI 对话",
  "mcp-inspector": "MCP 测试",
  formatter: "字符串格式化",
  converter: "数据转换",
  "time-ids": "时间与标识符",
  validation: "校验工具",
  crypto: "加密与验证",
  network: "网络工具",
  "text-workbench": "文本工作台",
  "file-tools": "文件工具",
  navigation: "站点导航",
  settings: "设置",
}

export const PAGE_IDS = Object.keys(PAGE_LABELS) as PageId[]

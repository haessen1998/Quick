export type AIProviderId = "openai" | "anthropic" | "google" | "compatible"

export type AIProfile = {
  id: string
  name: string
  provider: AIProviderId
  model: string
  apiKey: string
  baseURL: string
  systemPrompt: string
}

export type MCPTransportType = "streamable-http" | "sse" | "stdio"
export type MCPConnectionMode = "quick-proxy" | "direct"

export type MCPServerProfile = {
  id: string
  name: string
  transport: MCPTransportType
  url: string
  headers: string
  connectionMode: MCPConnectionMode
  command: string
  argsJSON: string
  env: string
  cwd: string
}

const AI_STORAGE_KEY = "quick-ai-profiles-v1"
const MCP_STORAGE_KEY = "quick-mcp-servers-v1"
const DEFAULT_SYSTEM_PROMPT = "你是 Quick 开发者工具箱中的 AI 助手。回答应准确、清晰、简洁；优先理解开发任务的真实目的，给出可核验的结果和可执行建议。遇到不确定信息要明确说明，不编造执行结果。"

function createID(prefix: string) {
  return typeof crypto.randomUUID === "function" ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createAIProfile(overrides: Partial<AIProfile> = {}): AIProfile {
  return {
    id: createID("ai"),
    name: "新的 AI",
    provider: "openai",
    model: "gpt-5-mini",
    apiKey: "",
    baseURL: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    ...overrides,
  }
}

export function createMCPServerProfile(overrides: Partial<MCPServerProfile> = {}): MCPServerProfile {
  return {
    id: createID("mcp"),
    name: "新的 MCP Server",
    transport: "streamable-http",
    url: "http://127.0.0.1:3000/mcp",
    headers: "",
    connectionMode: "quick-proxy",
    command: "",
    argsJSON: "[]",
    env: "",
    cwd: "",
    ...overrides,
  }
}

const DEFAULT_AI_PROFILES: AIProfile[] = [
  createAIProfile({ id: "ai-openai", name: "OpenAI", provider: "openai", model: "gpt-5-mini" }),
  createAIProfile({ id: "ai-anthropic", name: "Claude", provider: "anthropic", model: "claude-sonnet-4-6" }),
  createAIProfile({ id: "ai-gemini", name: "Gemini", provider: "google", model: "gemini-2.5-flash" }),
  createAIProfile({ id: "ai-compatible", name: "OpenAI Compatible", provider: "compatible", model: "model-name" }),
]

const DEFAULT_MCP_SERVERS: MCPServerProfile[] = [
  createMCPServerProfile({ id: "mcp-local-http", name: "本地 MCP", url: "http://127.0.0.1:3000/mcp" }),
]

function loadList<T>(key: string, fallback: T[], validate: (value: unknown) => value is T) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null")
    if (Array.isArray(value)) return value.filter(validate)
  } catch {
    // Fall back to built-in profiles when local data is malformed or unavailable.
  }
  return fallback.map((item) => ({ ...item }))
}

function isAIProfile(value: unknown): value is AIProfile {
  if (!value || typeof value !== "object") return false
  const profile = value as Partial<AIProfile>
  return typeof profile.id === "string" && typeof profile.name === "string" && typeof profile.model === "string"
    && typeof profile.apiKey === "string" && typeof profile.baseURL === "string" && typeof profile.systemPrompt === "string"
    && ["openai", "anthropic", "google", "compatible"].includes(profile.provider ?? "")
}

function isMCPServerProfile(value: unknown): value is MCPServerProfile {
  if (!value || typeof value !== "object") return false
  const profile = value as Partial<MCPServerProfile>
  return typeof profile.id === "string" && typeof profile.name === "string" && typeof profile.url === "string"
    && typeof profile.headers === "string" && typeof profile.command === "string" && typeof profile.argsJSON === "string"
    && typeof profile.env === "string" && typeof profile.cwd === "string"
    && ["streamable-http", "sse", "stdio"].includes(profile.transport ?? "")
    && ["quick-proxy", "direct"].includes(profile.connectionMode ?? "")
}

export function getInitialAIProfiles() {
  return loadList(AI_STORAGE_KEY, DEFAULT_AI_PROFILES, isAIProfile)
}

export function saveAIProfiles(profiles: AIProfile[]) {
  window.localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(profiles))
}

export function getInitialMCPServers() {
  return loadList(MCP_STORAGE_KEY, DEFAULT_MCP_SERVERS, isMCPServerProfile)
}

export function saveMCPServers(profiles: MCPServerProfile[]) {
  window.localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(profiles))
}

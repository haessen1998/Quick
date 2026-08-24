export type AIProviderId = "openai" | "azure" | "anthropic" | "google" | "open-responses" | "compatible"

export type AIProfile = {
  id: string
  name: string
  provider: AIProviderId
  model: string
  apiKey: string
  baseURL: string
  resourceName: string
  apiVersion: string
  useDeploymentBasedUrls: boolean
  systemPrompt: string
}

export type MCPTransportType = "streamable-http" | "sse" | "stdio"
export type MCPConnectionMode = "quick-proxy" | "direct"

export type MCPServerProfile = {
  id: string
  name: string
  enabled: boolean
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
    resourceName: "",
    apiVersion: "",
    useDeploymentBasedUrls: false,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    ...overrides,
  }
}

export function createMCPServerProfile(overrides: Partial<MCPServerProfile> = {}): MCPServerProfile {
  return {
    id: createID("mcp"),
    name: "新的 MCP Server",
    enabled: true,
    transport: "streamable-http",
    url: "http://127.0.0.1:9099/mcp",
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
  createAIProfile({ id: "ai-openai", name: "OpenAI 示例", provider: "openai", model: "gpt-5-mini" }),
]

const DEFAULT_MCP_SERVERS: MCPServerProfile[] = [
  createMCPServerProfile({ id: "mcp-wails3-app", name: "Quick App MCP", url: "http://127.0.0.1:9099/mcp" }),
]

const LEGACY_AI_DEFAULTS = [
  { id: "ai-openai", name: "OpenAI", provider: "openai", model: "gpt-5-mini" },
  { id: "ai-anthropic", name: "Claude", provider: "anthropic", model: "claude-sonnet-4-6" },
  { id: "ai-gemini", name: "Gemini", provider: "google", model: "gemini-2.5-flash" },
  { id: "ai-compatible", name: "OpenAI Compatible", provider: "compatible", model: "model-name" },
] as const

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
    && ["openai", "azure", "anthropic", "google", "open-responses", "compatible"].includes(profile.provider ?? "")
}

function normalizeAIProfile(profile: AIProfile): AIProfile {
  return {
    ...profile,
    resourceName: typeof profile.resourceName === "string" ? profile.resourceName : "",
    apiVersion: typeof profile.apiVersion === "string" ? profile.apiVersion : "",
    useDeploymentBasedUrls: typeof profile.useDeploymentBasedUrls === "boolean" ? profile.useDeploymentBasedUrls : false,
  }
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
  const profiles = loadList(AI_STORAGE_KEY, DEFAULT_AI_PROFILES, isAIProfile).map(normalizeAIProfile)
  const isUntouchedLegacyDefaults = profiles.length === LEGACY_AI_DEFAULTS.length && LEGACY_AI_DEFAULTS.every((legacy) => {
    const profile = profiles.find((item) => item.id === legacy.id)
    return profile?.name === legacy.name && profile.provider === legacy.provider && profile.model === legacy.model
      && !profile.apiKey && !profile.baseURL && profile.systemPrompt === DEFAULT_SYSTEM_PROMPT
  })
  return isUntouchedLegacyDefaults ? DEFAULT_AI_PROFILES.map((item) => ({ ...item })) : profiles
}

export function saveAIProfiles(profiles: AIProfile[]) {
  window.localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(profiles))
}

export function getInitialMCPServers() {
  return loadList(MCP_STORAGE_KEY, DEFAULT_MCP_SERVERS, isMCPServerProfile).map((profile) => {
    const enabled = typeof profile.enabled === "boolean" ? profile.enabled : true
    if (profile.id === "mcp-local-http" && profile.url === "http://127.0.0.1:3000/mcp") {
      return { ...profile, id: "mcp-wails3-app", name: "Quick App MCP", enabled, url: "http://127.0.0.1:9099/mcp" }
    }
    if (profile.id === "mcp-wails3-app" && profile.name === "Wails 3 应用 MCP" && profile.url === "http://127.0.0.1:9099/mcp") {
      return { ...profile, name: "Quick App MCP", enabled }
    }
    return { ...profile, enabled }
  })
}

export function saveMCPServers(profiles: MCPServerProfile[]) {
  window.localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(profiles))
}

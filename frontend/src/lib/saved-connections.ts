import { appStorage, DEVELOPMENT_PROFILE } from "@/lib/app-storage"
import { loadPersistentConfig,savePersistentConfig } from "@/lib/persistent-config"

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
export const QUICK_APP_MCP_ID = "mcp-quick-app"
export const QUICK_APP_MCP_URL = "http://127.0.0.1:43122/mcp"
const LEGACY_QUICK_APP_MCP_IDS = new Set(["mcp-wails3-app", "mcp-local-http"])
const LEGACY_QUICK_APP_MCP_URLS = new Set(["http://127.0.0.1:9099/mcp", "http://127.0.0.1:3000/mcp"])
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
    url: QUICK_APP_MCP_URL,
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
  createMCPServerProfile({ id: QUICK_APP_MCP_ID, name: "Quick App MCP", enabled: false, url: QUICK_APP_MCP_URL }),
]

const LEGACY_AI_DEFAULTS = [
  { id: "ai-openai", name: "OpenAI", provider: "openai", model: "gpt-5-mini" },
  { id: "ai-anthropic", name: "Claude", provider: "anthropic", model: "claude-sonnet-4-6" },
  { id: "ai-gemini", name: "Gemini", provider: "google", model: "gemini-2.5-flash" },
  { id: "ai-compatible", name: "OpenAI Compatible", provider: "compatible", model: "model-name" },
] as const

function loadList<T>(key: string, fallback: T[], validate: (value: unknown) => value is T) {
  try {
    const value = JSON.parse(appStorage.getItem(key) ?? "null")
    if (Array.isArray(value)) return value.filter(validate)
  } catch {
    // Fall back to built-in profiles when local data is malformed or unavailable.
  }
  return fallback.map((item) => ({ ...item }))
}

function normalizeAIProfile(value: unknown): AIProfile | null {
  if (!value || typeof value !== "object") return null
  const profile = value as Partial<AIProfile> & { baseUrl?: unknown; endpoint?: unknown; prompt?: unknown }
  const provider = profile.provider === "azure" || profile.provider === "anthropic" || profile.provider === "google"
    || profile.provider === "open-responses" || profile.provider === "compatible" ? profile.provider : "openai"
  const id = typeof profile.id === "string" && profile.id ? profile.id : createID("ai")
  const name = typeof profile.name === "string" ? profile.name : "未命名 AI"
  const model = typeof profile.model === "string" ? profile.model : ""
  if (!name && !model) return null
  return createAIProfile({
    id,
    name,
    provider,
    model,
    apiKey: typeof profile.apiKey === "string" ? profile.apiKey : "",
    baseURL: typeof profile.baseURL === "string" ? profile.baseURL : typeof profile.baseUrl === "string" ? profile.baseUrl : typeof profile.endpoint === "string" ? profile.endpoint : "",
    resourceName: typeof profile.resourceName === "string" ? profile.resourceName : "",
    apiVersion: typeof profile.apiVersion === "string" ? profile.apiVersion : "",
    useDeploymentBasedUrls: typeof profile.useDeploymentBasedUrls === "boolean" ? profile.useDeploymentBasedUrls : false,
    systemPrompt: typeof profile.systemPrompt === "string" ? profile.systemPrompt : typeof profile.prompt === "string" ? profile.prompt : DEFAULT_SYSTEM_PROMPT,
  })
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
  const profiles = parseAIProfiles(appStorage.getItem(AI_STORAGE_KEY)) ?? DEFAULT_AI_PROFILES.map((item) => ({ ...item }))
  const isUntouchedLegacyDefaults = profiles.length === LEGACY_AI_DEFAULTS.length && LEGACY_AI_DEFAULTS.every((legacy) => {
    const profile = profiles.find((item) => item.id === legacy.id)
    return profile?.name === legacy.name && profile.provider === legacy.provider && profile.model === legacy.model
      && !profile.apiKey && !profile.baseURL && profile.systemPrompt === DEFAULT_SYSTEM_PROMPT
  })
  return isUntouchedLegacyDefaults ? DEFAULT_AI_PROFILES.map((item) => ({ ...item })) : profiles
}

export function saveAIProfiles(profiles: AIProfile[]) {
  saveLocalList(AI_STORAGE_KEY, profiles)
}

export async function hydrateAIProfiles(fallback: AIProfile[]) {
  const durable = await loadPersistentConfig("ai-profiles")
  const profiles = parseAIProfiles(durable)
  const merged = profiles ? mergeAIProfiles(profiles, fallback) : fallback
  if (!profiles || JSON.stringify(merged) !== JSON.stringify(profiles)) await savePersistentConfig("ai-profiles", merged)
  return merged
}

export async function persistAIProfiles(profiles: AIProfile[]) {
  await savePersistentConfig("ai-profiles", profiles)
}

export function getInitialMCPServers() {
  return normalizeMCPServers(loadList(MCP_STORAGE_KEY, DEFAULT_MCP_SERVERS, isMCPServerProfile))
}

function normalizeMCPServers(profiles: MCPServerProfile[]) {
  return profiles.map((profile) => {
    const builtIn = profile.id === QUICK_APP_MCP_ID || profile.url === QUICK_APP_MCP_URL
    const enabled = builtIn && !DEVELOPMENT_PROFILE ? false : typeof profile.enabled === "boolean" ? profile.enabled : true
    const legacyBuiltIn = LEGACY_QUICK_APP_MCP_IDS.has(profile.id)
      || (LEGACY_QUICK_APP_MCP_URLS.has(profile.url) && (profile.name === "Quick App MCP" || profile.name === "Wails 3 应用 MCP"))
    if (legacyBuiltIn) {
      return { ...profile, id: QUICK_APP_MCP_ID, name: "Quick App MCP", enabled, url: QUICK_APP_MCP_URL }
    }
    return { ...profile, enabled }
  })
}

export function saveMCPServers(profiles: MCPServerProfile[]) {
  saveLocalList(MCP_STORAGE_KEY, profiles)
}

export async function hydrateMCPServers(fallback: MCPServerProfile[]) {
  const durable = await loadPersistentConfig("mcp-servers")
  if (durable) {
    const parsed = JSON.parse(durable)
    if (Array.isArray(parsed)) return normalizeMCPServers(parsed.filter(isMCPServerProfile))
  }
  await savePersistentConfig("mcp-servers", fallback)
  return fallback
}

export async function persistMCPServers(profiles: MCPServerProfile[]) {
  await savePersistentConfig("mcp-servers", profiles)
}

export function clearLegacySensitiveConnectionCache() {
  for (const key of [AI_STORAGE_KEY, MCP_STORAGE_KEY]) {
    appStorage.removeItem(key)
    appStorage.removeItem(`${key}-backup`)
  }
}

function parseAIProfiles(raw: string | null): AIProfile[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map(normalizeAIProfile).filter((profile): profile is AIProfile => Boolean(profile))
  } catch {
    return null
  }
}

function aiProfileCompleteness(profile: AIProfile) {
  let score = profile.apiKey.trim() ? 20 : 0
  score += profile.baseURL.trim() || profile.resourceName.trim() ? 5 : 0
  score += profile.systemPrompt !== DEFAULT_SYSTEM_PROMPT ? 2 : 0
  score += profile.id !== "ai-openai" ? 1 : 0
  return score
}

function isEmptyAIExample(profile: AIProfile) {
  return profile.id === "ai-openai" && profile.provider === "openai" && profile.model === "gpt-5-mini"
    && !profile.apiKey.trim() && !profile.baseURL.trim() && !profile.resourceName.trim()
}

function mergeAIProfiles(durable: AIProfile[], local: AIProfile[]) {
  const merged = durable.map((profile) => ({ ...profile }))
  for (const candidate of local) {
    const index = merged.findIndex((profile) => profile.id === candidate.id)
    if (index < 0) merged.push({ ...candidate })
    else if (aiProfileCompleteness(candidate) > aiProfileCompleteness(merged[index])) merged[index] = { ...candidate }
  }
  const hasConfiguredOrCustomProfile = merged.some((profile) => !isEmptyAIExample(profile))
  return hasConfiguredOrCustomProfile ? merged.filter((profile) => !isEmptyAIExample(profile)) : merged
}

function saveLocalList(key: string, value: unknown) {
  const serialized = JSON.stringify(value)
  const previous = appStorage.getItem(key)
  if (previous && previous !== serialized) appStorage.setItem(`${key}-backup`, previous)
  appStorage.setItem(key, serialized)
}

import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenResponses } from "@ai-sdk/open-responses"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"

import type { AIProfile, AIProviderId } from "@/lib/saved-connections"

export type ChatSettings = {
  provider: AIProviderId
  model: string
  apiKey: string
  baseURL: string
  resourceName: string
  apiVersion: string
  useDeploymentBasedUrls: boolean
  systemPrompt: string
}

export type AIProviderOption = {
  id: AIProviderId
  label: string
  shortLabel: string
  model: string
  modelLabel: string
  modelPlaceholder: string
  endpointLabel: string
  endpointPlaceholder: string
  description: string
  protocol: string
  apiKeyOptional: boolean
  endpointRequired: boolean
}

export const AI_PROVIDER_OPTIONS: AIProviderOption[] = [
  { id: "openai", label: "OpenAI", shortLabel: "OpenAI", model: "gpt-5-mini", modelLabel: "模型", modelPlaceholder: "gpt-5-mini", endpointLabel: "Base URL", endpointPlaceholder: "默认使用 OpenAI 官方地址", description: "OpenAI 官方模型，默认使用 Responses API", protocol: "Responses API", apiKeyOptional: false, endpointRequired: false },
  { id: "azure", label: "Azure OpenAI", shortLabel: "Azure", model: "gpt-5-mini", modelLabel: "部署名称", modelPlaceholder: "你的 Azure deployment name", endpointLabel: "Base URL", endpointPlaceholder: "可选，例如 https://resource.openai.azure.com/openai", description: "Azure OpenAI 部署，支持 Resource Name 或自定义网关地址", protocol: "Azure Responses API", apiKeyOptional: false, endpointRequired: false },
  { id: "anthropic", label: "Anthropic", shortLabel: "Claude", model: "claude-sonnet-4-6", modelLabel: "模型", modelPlaceholder: "claude-sonnet-4-6", endpointLabel: "Base URL", endpointPlaceholder: "默认使用 Anthropic 官方地址", description: "Anthropic Claude Messages API", protocol: "Messages API", apiKeyOptional: false, endpointRequired: false },
  { id: "google", label: "Google Gemini", shortLabel: "Gemini", model: "gemini-2.5-flash", modelLabel: "模型", modelPlaceholder: "gemini-2.5-flash", endpointLabel: "Base URL", endpointPlaceholder: "默认使用 Google 官方地址", description: "Google Generative AI 原生接口", protocol: "Generative AI API", apiKeyOptional: false, endpointRequired: false },
  { id: "open-responses", label: "Open Responses", shortLabel: "Responses", model: "model-name", modelLabel: "模型", modelPlaceholder: "例如 mistralai/ministral-3-14b-reasoning", endpointLabel: "Responses Endpoint", endpointPlaceholder: "例如 http://localhost:1234/v1/responses", description: "连接实现 Open Responses 规范的本地服务或第三方网关", protocol: "Open Responses API", apiKeyOptional: true, endpointRequired: true },
  { id: "compatible", label: "OpenAI Compatible", shortLabel: "Compatible", model: "model-name", modelLabel: "模型", modelPlaceholder: "例如 deepseek-chat、qwen-plus", endpointLabel: "Base URL", endpointPlaceholder: "例如 https://api.example.com/v1", description: "连接 Chat Completions 兼容服务、Ollama、LM Studio 或自建网关", protocol: "Chat Completions", apiKeyOptional: true, endpointRequired: true },
]

export function getAIProviderOption(provider: AIProviderId) {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? AI_PROVIDER_OPTIONS[0]
}

export function settingsFromProfile(profile: AIProfile | undefined, fallback: ChatSettings): ChatSettings {
  if (!profile) return fallback
  return {
    provider: profile.provider,
    model: profile.model,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    resourceName: profile.resourceName ?? "",
    apiVersion: profile.apiVersion ?? "",
    useDeploymentBasedUrls: profile.useDeploymentBasedUrls ?? false,
    systemPrompt: profile.systemPrompt,
  }
}

export function isAIProfileReady(profile: AIProfile | undefined) {
  if (!profile) return false
  return !validateChatSettings({
    ...profile,
    resourceName: profile.resourceName ?? "",
    apiVersion: profile.apiVersion ?? "",
    useDeploymentBasedUrls: profile.useDeploymentBasedUrls ?? false,
  })
}

export function validateChatSettings(settings: ChatSettings) {
  const option = getAIProviderOption(settings.provider)
  if (!settings.model.trim()) return `请填写${option.modelLabel}`
  if (!option.apiKeyOptional && !settings.apiKey.trim()) return "请填写 Provider API Key"
  if (option.endpointRequired && !settings.baseURL.trim()) return `${option.label} 需要填写 ${option.endpointLabel}`
  if (settings.provider === "azure" && !settings.resourceName.trim() && !settings.baseURL.trim()) return "Azure OpenAI 需要填写 Resource Name 或 Base URL"
  if (settings.provider === "azure" && settings.useDeploymentBasedUrls && !settings.apiVersion.trim()) return "Azure 部署路径兼容模式需要填写 API Version"
  if (settings.provider === "open-responses") {
    try {
      const endpoint = new URL(settings.baseURL.trim())
      if (!/^https?:$/.test(endpoint.protocol)) return "Open Responses Endpoint 仅支持 HTTP 或 HTTPS"
    } catch {
      return "Open Responses Endpoint 不是有效 URL"
    }
  }
  return ""
}

export function createLanguageModel(settings: ChatSettings): LanguageModel {
  const model = settings.model.trim()
  const commonOptions = {
    apiKey: settings.apiKey.trim() || undefined,
    baseURL: settings.baseURL.trim() || undefined,
  }
  switch (settings.provider) {
    case "openai":
      return createOpenAI(commonOptions)(model)
    case "azure":
      return createAzure({
        apiKey: settings.apiKey.trim() || undefined,
        resourceName: settings.resourceName.trim() || undefined,
        baseURL: settings.baseURL.trim() || undefined,
        apiVersion: settings.apiVersion.trim() || undefined,
        useDeploymentBasedUrls: settings.useDeploymentBasedUrls,
      })(model)
    case "anthropic":
      return createAnthropic(commonOptions)(model)
    case "google":
      return createGoogleGenerativeAI(commonOptions)(model)
    case "open-responses":
      return createOpenResponses({
        name: "quick-open-responses",
        url: settings.baseURL.trim(),
        apiKey: settings.apiKey.trim() || undefined,
      })(model)
    case "compatible":
      return createOpenAICompatible({
        name: "quick-openai-compatible",
        baseURL: settings.baseURL.trim(),
        apiKey: settings.apiKey.trim() || undefined,
      })(model)
  }
}

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"

import type { AIProfile, AIProviderId } from "@/lib/saved-connections"

export type ChatSettings = {
  provider: AIProviderId
  model: string
  apiKey: string
  baseURL: string
  systemPrompt: string
}

export function settingsFromProfile(profile: AIProfile | undefined, fallback: ChatSettings): ChatSettings {
  if (!profile) return fallback
  return {
    provider: profile.provider,
    model: profile.model,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    systemPrompt: profile.systemPrompt,
  }
}

export function isAIProfileReady(profile: AIProfile | undefined) {
  if (!profile?.model.trim()) return false
  if (profile.provider === "compatible") return Boolean(profile.baseURL.trim())
  return Boolean(profile.apiKey.trim())
}

export function createLanguageModel(settings: ChatSettings): LanguageModel {
  const commonOptions = {
    apiKey: settings.apiKey.trim() || undefined,
    baseURL: settings.baseURL.trim() || undefined,
  }
  switch (settings.provider) {
    case "openai":
      return createOpenAI(commonOptions)(settings.model)
    case "anthropic":
      return createAnthropic(commonOptions)(settings.model)
    case "google":
      return createGoogleGenerativeAI(commonOptions)(settings.model)
    case "compatible":
      return createOpenAICompatible({
        name: "quick-openai-compatible",
        baseURL: settings.baseURL.trim(),
        apiKey: settings.apiKey.trim() || undefined,
      })(settings.model)
  }
}

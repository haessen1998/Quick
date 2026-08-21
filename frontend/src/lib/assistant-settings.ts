export type AssistantSettings = {
  autoApproveMCP: boolean
}

const storageKey = "quick-assistant-settings-v1"

const defaults: AssistantSettings = {
  autoApproveMCP: false,
}

export function getInitialAssistantSettings(): AssistantSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<AssistantSettings> | null
    if (stored && typeof stored.autoApproveMCP === "boolean") return { autoApproveMCP: stored.autoApproveMCP }
  } catch {
    // Ignore malformed local settings and keep the safer default.
  }
  return { ...defaults }
}

export function saveAssistantSettings(settings: AssistantSettings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings))
}

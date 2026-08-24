export type AssistantSettings = {
  autoApproveOperations: boolean
}

const storageKey = "quick-assistant-settings-v1"

const defaults: AssistantSettings = {
  autoApproveOperations: false,
}

export function getInitialAssistantSettings(): AssistantSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as (Partial<AssistantSettings> & { autoApproveMCP?: boolean }) | null
    if (stored && typeof stored.autoApproveOperations === "boolean") return { autoApproveOperations: stored.autoApproveOperations }
    if (stored && typeof stored.autoApproveMCP === "boolean") return { autoApproveOperations: stored.autoApproveMCP }
  } catch {
    // Ignore malformed local settings and keep the safer default.
  }
  return { ...defaults }
}

export function saveAssistantSettings(settings: AssistantSettings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings))
}

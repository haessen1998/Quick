export type ProxyMode = "system" | "custom" | "none"

export type ProxySettings = {
  mode: ProxyMode
  url: string
}

const storageKey = "quick-proxy-settings"

export function getInitialProxySettings(): ProxySettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<ProxySettings> | null
    if (stored && ["system", "custom", "none"].includes(stored.mode ?? "")) return { mode: stored.mode as ProxyMode, url: stored.url ?? "" }
  } catch {
    // Ignore malformed settings and fall back to system proxy behavior.
  }
  return { mode: "system", url: "" }
}

export function saveProxySettings(settings: ProxySettings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings))
}

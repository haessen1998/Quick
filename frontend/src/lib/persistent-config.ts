import * as ConfigService from "@/../bindings/github.com/haessen1998/Quick/internal/config/configservice"

export type PersistentConfigKey = "ai-profiles" | "mcp-servers" | "navigation-groups" | "sidebar-order"

export async function loadPersistentConfig(key: PersistentConfigKey) {
  return ConfigService.Load(key)
}

export async function savePersistentConfig(key: PersistentConfigKey, value: unknown) {
  await ConfigService.Save(key, JSON.stringify(value))
}

import * as ConfigService from "@/../bindings/changeme/services/configservice"

export type PersistentConfigKey = "ai-profiles" | "mcp-servers" | "navigation-groups"

export async function loadPersistentConfig(key: PersistentConfigKey) {
  return ConfigService.Load(key)
}

export async function savePersistentConfig(key: PersistentConfigKey, value: unknown) {
  await ConfigService.Save(key, JSON.stringify(value))
}

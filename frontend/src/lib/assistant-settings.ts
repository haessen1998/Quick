import { appStorage } from "@/lib/app-storage"
import { DEFAULT_TOOL_PERMISSIONS,type ToolPermissions } from "./tool-policy";
export type AssistantSettings = { autoApproveOperations: boolean; permissions: ToolPermissions }
const storageKey = "quick-assistant-settings-v2"
export function getInitialAssistantSettings(): AssistantSettings {
  try {
    const stored = JSON.parse(appStorage.getItem(storageKey) ?? "null")
    const permissions = { ...DEFAULT_TOOL_PERMISSIONS }
    for (const key of Object.keys(permissions) as (keyof ToolPermissions)[]) permissions[key] = stored?.permissions?.[key] === true
    return { autoApproveOperations: false, permissions }
  } catch { return { autoApproveOperations: false, permissions: { ...DEFAULT_TOOL_PERMISSIONS } } }
}
export function saveAssistantSettings(settings: AssistantSettings) { appStorage.setItem(storageKey, JSON.stringify(settings)) }

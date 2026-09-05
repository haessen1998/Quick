import { useSyncExternalStore } from "react"
import { appStorage } from "./app-storage"
const EVENT = "quick-editor-settings"
function readLineNumbers() {
  try {
    return appStorage.getItem("editor-line-numbers") !== "false"
  } catch {
    return true
  }
}
export function setLineNumbers(visible: boolean) {
  appStorage.setItem("editor-line-numbers", String(visible))
  window.dispatchEvent(new Event(EVENT))
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener("storage", listener)
  }
}
export function useLineNumbers() {
  return useSyncExternalStore(subscribe, readLineNumbers, () => true)
}

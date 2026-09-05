import { Clipboard } from "@wailsio/runtime"

import { hasNativeBridge } from "@/lib/native-runtime"
import { clipboardObserver } from "@/lib/clipboard-observer"

export async function writeClipboard(value: string) {
  // Mark before the async OS write: focus/read events can race its completion.
  clipboardObserver.rememberLocal(value)
  let nativeError: unknown
  if (hasNativeBridge()) {
    try {
      await Clipboard.SetText(value)
      return
    } catch (error) {
      nativeError = error
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  if (nativeError instanceof Error) throw nativeError
  throw new Error("当前环境不支持剪贴板写入")
}

import type { KeyboardEvent } from "react"

export function shouldSendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229
}

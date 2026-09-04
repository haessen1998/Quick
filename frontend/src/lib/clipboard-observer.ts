/** Session-only bookkeeping. Local copies and stale async reads never become suggestions. */
export class ClipboardObserver {
  revision = 0
  private last: string | undefined
  private listeners = new Set<() => void>()
  onLocalCopy(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  invalidate() {
    this.revision++
  }
  rememberLocal(value: string) {
    this.invalidate()
    this.last = value.trim()
    this.listeners.forEach((listener) => listener())
  }
  observe(value: string, revision = this.revision) {
    if (revision !== this.revision) return false
    const normalized = value.trim()
    const changed = this.last !== undefined && normalized !== this.last
    this.last = normalized
    return changed && Boolean(normalized)
  }
}
export const clipboardObserver = new ClipboardObserver()

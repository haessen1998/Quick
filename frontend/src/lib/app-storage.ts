type StorageBackend = Pick<Storage, "getItem" | "setItem" | "removeItem">
export const DEVELOPMENT_PROFILE = (import.meta.env?.MODE ?? "production") !== "production"
export function scopedStorage(backend: () => StorageBackend, prefix: string): StorageBackend {
  return {
    getItem: key => backend().getItem(prefix + key),
    setItem: (key, value) => backend().setItem(prefix + key, value),
    removeItem: key => backend().removeItem(prefix + key),
  }
}
// Even when development and release share a WebView origin, their preferences
// and legacy credential migration must never read or delete each other's data.
const prefix = DEVELOPMENT_PROFILE ? "quick-dev:" : ""
export const appStorage = scopedStorage(() => window.localStorage, prefix)
export const appSessionStorage = scopedStorage(() => window.sessionStorage, prefix)

export function hasNativeBridge() {
  const host = window as Window & {
    chrome?: { webview?: { postMessage?: unknown } }
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } }
    wails?: { invoke?: unknown; invokeAsync?: unknown }
  }
  return typeof host.chrome?.webview?.postMessage === "function"
    || typeof host.webkit?.messageHandlers?.external?.postMessage === "function"
    || typeof host.wails?.invoke === "function"
    || typeof host.wails?.invokeAsync === "function"
}

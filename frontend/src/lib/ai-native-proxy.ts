import { AIProxyService } from "@/../bindings/github.com/haessen1998/Quick/internal/ai"
import { hasNativeBridge } from "@/lib/native-runtime"
import type { ProxySettings } from "@/lib/proxy"

type NativeSession = {
  success: boolean
  id: string
  endpoint: string
  token: string
  error: string
}

export function createNativeAIFetch(proxy: ProxySettings) {
  let sessionPromise: Promise<NativeSession> | null = null

  const getSession = async (targetURL: string) => {
    if (!sessionPromise) {
      sessionPromise = (AIProxyService.CreateSession(targetURL, proxy.mode, proxy.url) as Promise<NativeSession>).then((session) => {
        if (!session.success) throw new Error(session.error || "无法创建 Quick AI 网络代理")
        return session
      }).catch((error) => {
        sessionPromise = null
        throw error
      })
    }
    return sessionPromise
  }

  const nativeFetch: typeof globalThis.fetch = async (input, init) => {
    if (!hasNativeBridge()) return globalThis.fetch(input, init)
    const sourceRequest = input instanceof Request ? new Request(input, init) : null
    const targetURL = sourceRequest?.url ?? (typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const session = await getSession(targetURL)
    const request = sourceRequest ? new Request(session.endpoint, sourceRequest) : new Request(session.endpoint, init)
    const headers = new Headers(request.headers)
    headers.set("X-Quick-AI-Token", session.token)
    headers.set("X-Quick-AI-Target", targetURL)
    return globalThis.fetch(new Request(request, { headers }))
  }

  return {
    fetch: nativeFetch,
    close: async () => {
      const pending = sessionPromise
      sessionPromise = null
      if (!pending || !hasNativeBridge()) return
      try {
        const session = await pending
        await AIProxyService.CloseSession(session.id)
      } catch {
        // A failed or already-closed session does not need cleanup.
      }
    },
  }
}

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
  const sessions = new Map<string, Promise<NativeSession>>()

  const getSession = async (targetURL: string) => {
    const origin = new URL(targetURL).origin
    let sessionPromise = sessions.get(origin)
    if (!sessionPromise) {
      sessionPromise = (AIProxyService.CreateSession(targetURL, proxy.mode, proxy.url) as Promise<NativeSession>).then((session) => {
        if (!session.success) throw new Error(session.error || "无法创建 Quick AI 网络代理")
        return session
      }).catch((error) => {
        sessions.delete(origin)
        throw error
      })
    }
    sessions.set(origin, sessionPromise)
    return sessionPromise
  }

  const nativeFetch: typeof globalThis.fetch = async (input, init) => {
    if (!hasNativeBridge()) return globalThis.fetch(input, init)
    const sourceRequest = input instanceof Request ? new Request(input, init) : null
    const signal = sourceRequest?.signal ?? init?.signal
    if (signal?.aborted) throw new DOMException("已取消", "AbortError")
    const targetURL = sourceRequest?.url ?? (typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const session = await getSession(targetURL)
    if (signal?.aborted) throw new DOMException("已取消", "AbortError")
    const request = sourceRequest ? new Request(session.endpoint, sourceRequest) : new Request(session.endpoint, init)
    const headers = new Headers(request.headers)
    headers.set("X-Quick-AI-Token", session.token)
    headers.set("X-Quick-AI-Target", targetURL)
    return globalThis.fetch(new Request(request, { headers }))
  }

  return {
    fetch: nativeFetch,
    close: async () => {
      const pending = [...sessions.values()]; sessions.clear()
      if (!hasNativeBridge()) return
      await Promise.allSettled(pending.map(async value => { const session = await value; await AIProxyService.CloseSession(session.id) }))
    },
  }
}

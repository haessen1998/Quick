import type { RegexJob } from "./regex-engine";

export function evaluateRegex<T = string>(job: RegexJob, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("已取消", "AbortError")); return }
    const worker = new Worker(new URL("./regex.worker.ts", import.meta.url), { type: "module" })
    const finish = () => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener("abort", abort) }
    const abort = () => { finish(); reject(new DOMException("已取消", "AbortError")) }
    const timer = setTimeout(() => { finish(); reject(new Error("正则执行超时，已终止。请简化表达式或缩小输入。")) }, 1500)
    signal?.addEventListener("abort", abort, { once: true })
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result as T) }
    worker.onerror = () => { finish(); reject(new Error("正则任务失败")) }
    worker.postMessage(job)
  })
}

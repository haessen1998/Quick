import { useCallback, useEffect, useRef, useState } from "react"

const BOTTOM_THRESHOLD = 48

export function useStickToBottom(content: unknown, streaming: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const previousScrollTopRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    followingRef.current = true
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const scrollTop = element.scrollTop
    const nextAtBottom = element.scrollHeight - scrollTop - element.clientHeight <= BOTTOM_THRESHOLD
    const movedUp = scrollTop < previousScrollTopRef.current - 1

    if (movedUp && !nextAtBottom) followingRef.current = false
    if (nextAtBottom) followingRef.current = true

    previousScrollTopRef.current = scrollTop
    setAtBottom(nextAtBottom)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const element = scrollRef.current
      if (!element) return
      if (followingRef.current) {
        element.scrollTo({ top: element.scrollHeight, behavior: streaming ? "auto" : "smooth" })
        return
      }
      setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [content, streaming])

  return {
    scrollRef,
    atBottom,
    handleScroll,
    scrollToBottom,
  }
}

import { createEffect, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"

export interface AutoScrollOptions {
  working: () => boolean
  onUserInteracted?: () => void
  overflowAnchor?: "none" | "auto" | "dynamic"
  bottomThreshold?: number
}

const AUTO_SCROLL_WINDOW_MS = 1500

export function createAutoScroll(options: AutoScrollOptions) {
  let settling = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let autoTimer: ReturnType<typeof setTimeout> | undefined
  let auto: { top: number; time: number } | undefined
  let lastUserScrollInputAt = 0
  let touchY: number | undefined

  const threshold = () => Math.max(0, options.bottomThreshold ?? 10)

  const [store, setStore] = createStore({
    contentRef: undefined as HTMLElement | undefined,
    scrollRef: undefined as HTMLElement | undefined,
    userScrolled: false,
  })

  const active = () => options.working() || settling

  const maxScrollTop = (el: HTMLElement) => {
    return Math.max(0, el.scrollHeight - el.clientHeight)
  }

  const distanceFromBottom = (el: HTMLElement) => {
    return maxScrollTop(el) - el.scrollTop
  }

  const canScroll = (el: HTMLElement) => {
    return maxScrollTop(el) > 1
  }

  const eventTarget = (event: Event) => (event.target instanceof Element ? event.target : undefined)

  const isEditableTarget = (target: Element | undefined) => {
    if (!target) return false
    const element = target.closest("input, textarea, select, [contenteditable='true']")
    return !!element
  }

  const isNestedScrollableTarget = (event: Event) => {
    const el = store.scrollRef
    const target = eventTarget(event)
    const nested = target?.closest("[data-scrollable]")
    return !!(el && nested && nested !== el)
  }

  const noteUserScrollInput = () => {
    lastUserScrollInputAt = Date.now()
  }

  // Browsers can dispatch scroll events asynchronously. If new content arrives
  // between us calling `scrollTo()` and the subsequent `scroll` event firing,
  // the handler can see a non-zero `distanceFromBottom` and incorrectly assume
  // the user scrolled.
  const markAuto = (el: HTMLElement) => {
    auto = {
      top: maxScrollTop(el),
      time: Date.now(),
    }

    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => {
      auto = undefined
      autoTimer = undefined
    }, AUTO_SCROLL_WINDOW_MS)
  }

  const isAuto = (el: HTMLElement) => {
    const a = auto
    if (!a) return false

    if (Date.now() - a.time > AUTO_SCROLL_WINDOW_MS) {
      auto = undefined
      return false
    }

    if (lastUserScrollInputAt > a.time) return false
    return el.scrollTop >= a.top - 2
  }

  const scrollToBottomNow = (behavior: ScrollBehavior) => {
    const el = store.scrollRef
    if (!el) return
    markAuto(el)
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior })
      return
    }

    // `scrollTop` assignment bypasses any CSS `scroll-behavior: smooth`.
    el.scrollTop = el.scrollHeight
  }

  const scrollToBottom = (force: boolean) => {
    if (!force && !active()) return

    if (force && store.userScrolled) setStore("userScrolled", false)

    const el = store.scrollRef
    if (!el) return

    if (!force && store.userScrolled) return

    const distance = distanceFromBottom(el)
    if (distance < 2) {
      markAuto(el)
      return
    }

    // For auto-following content we prefer immediate updates to avoid
    // visible "catch up" animations while content is still settling.
    scrollToBottomNow("auto")
  }

  const stop = () => {
    const el = store.scrollRef
    if (!el) return
    if (!canScroll(el)) {
      if (store.userScrolled) setStore("userScrolled", false)
      return
    }
    if (store.userScrolled) return

    setStore("userScrolled", true)
    options.onUserInteracted?.()
  }

  const handleWheel = (e: WheelEvent) => {
    // If the user is scrolling within a nested scrollable region (tool output,
    // code block, etc), don't treat it as leaving the "follow bottom" mode.
    // Those regions opt in via `data-scrollable`.
    if (isNestedScrollableTarget(e)) return
    noteUserScrollInput()
    if (e.deltaY < 0) stop()
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (isNestedScrollableTarget(e)) return
    touchY = e.touches[0]?.clientY
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (isNestedScrollableTarget(e)) return
    const next = e.touches[0]?.clientY
    if (next === undefined) return
    noteUserScrollInput()
    if (touchY !== undefined && next > touchY + 2) stop()
    touchY = next
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(eventTarget(e)) || isNestedScrollableTarget(e)) return

    switch (e.key) {
      case "ArrowUp":
      case "PageUp":
      case "Home":
        noteUserScrollInput()
        stop()
        return
      case "ArrowDown":
      case "PageDown":
      case "End":
      case " ":
        noteUserScrollInput()
        return
    }
  }

  const handleScroll = () => {
    const el = store.scrollRef
    if (!el) return

    if (!canScroll(el)) {
      if (store.userScrolled) setStore("userScrolled", false)
      return
    }

    if (distanceFromBottom(el) < threshold()) {
      if (store.userScrolled) setStore("userScrolled", false)
      return
    }

    // Ignore scroll events triggered by our own scrollToBottom calls.
    if (!store.userScrolled && isAuto(el)) {
      scrollToBottom(false)
      return
    }

    stop()
  }

  const handleInteraction = () => {
    if (!active()) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      stop()
    }
  }

  const updateOverflowAnchor = (el: HTMLElement) => {
    const mode = options.overflowAnchor ?? "dynamic"

    if (mode === "none") {
      el.style.overflowAnchor = "none"
      return
    }

    if (mode === "auto") {
      el.style.overflowAnchor = "auto"
      return
    }

    el.style.overflowAnchor = store.userScrolled ? "auto" : "none"
  }

  createResizeObserver(
    () => store.contentRef,
    () => {
      const el = store.scrollRef
      if (el && !canScroll(el)) {
        if (store.userScrolled) setStore("userScrolled", false)
        return
      }
      if (!active()) return
      if (store.userScrolled) return
      // ResizeObserver fires after layout, before paint.
      // Keep the bottom locked in the same frame to avoid visible
      // "jump up then catch up" artifacts while streaming content.
      scrollToBottom(false)
    },
  )

  createEffect(
    on(options.working, (working: boolean) => {
      settling = false
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = undefined

      if (working) {
        if (!store.userScrolled) scrollToBottom(true)
        return
      }

      settling = true
      settleTimer = setTimeout(() => {
        settling = false
      }, 300)
    }),
  )

  createEffect(() => {
    // Track `userScrolled` even before `scrollRef` is attached, so we can
    // update overflow anchoring once the element exists.
    store.userScrolled
    const el = store.scrollRef
    if (!el) return
    updateOverflowAnchor(el)
  })

  createEventListener(() => store.scrollRef, "wheel", handleWheel, { passive: true })
  createEventListener(() => store.scrollRef, "touchstart", handleTouchStart, { passive: true })
  createEventListener(() => store.scrollRef, "touchmove", handleTouchMove, { passive: true })
  createEventListener(() => store.scrollRef, "keydown", handleKeyDown)

  onCleanup(() => {
    if (settleTimer) clearTimeout(settleTimer)
    if (autoTimer) clearTimeout(autoTimer)
  })

  return {
    scrollRef: (el: HTMLElement | undefined) => setStore("scrollRef", el),
    contentRef: (el: HTMLElement | undefined) => setStore("contentRef", el),
    handleScroll,
    handleInteraction,
    pause: stop,
    resume: () => {
      if (store.userScrolled) setStore("userScrolled", false)
      scrollToBottom(true)
    },
    scrollToBottom: () => scrollToBottom(false),
    forceScrollToBottom: () => scrollToBottom(true),
    userScrolled: () => store.userScrolled,
  }
}

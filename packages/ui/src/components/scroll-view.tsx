import { createSignal, onCleanup, onMount, splitProps, type ComponentProps, Show, mergeProps } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createStore } from "solid-js/store"
import { useI18n } from "../context/i18n"

export interface ScrollViewProps extends ComponentProps<"div"> {
  viewportRef?: (el: HTMLDivElement | undefined) => void
  orientation?: "vertical" | "horizontal" // currently only vertical is fully implemented for thumb
}

const TRACK_PADDING = 8
const MIN_THUMB_HEIGHT = 32

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const scrollKey = (event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

  switch (event.key) {
    case "PageDown":
      return "page-down"
    case "PageUp":
      return "page-up"
    case "Home":
      return "home"
    case "End":
      return "end"
    case "ArrowUp":
      return "up"
    case "ArrowDown":
      return "down"
  }
}

export function scrollThumbState(input: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  trackPadding?: number
  minThumbHeight?: number
}) {
  const trackPadding = input.trackPadding ?? TRACK_PADDING
  const minThumbHeight = input.minThumbHeight ?? MIN_THUMB_HEIGHT
  const trackHeight = Math.max(0, input.clientHeight - trackPadding * 2)
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight)

  if (input.scrollHeight <= input.clientHeight || input.scrollHeight === 0 || trackHeight === 0) {
    return { show: false, height: 0, top: trackPadding, maxScrollTop, maxThumbTravel: 0 }
  }

  const height = Math.min(
    trackHeight,
    Math.max(minThumbHeight, (input.clientHeight / input.scrollHeight) * trackHeight),
  )
  const maxThumbTravel = Math.max(0, trackHeight - height)
  const rawTop = maxScrollTop > 0 ? (input.scrollTop / maxScrollTop) * maxThumbTravel : 0
  const top = trackPadding + clamp(rawTop, 0, maxThumbTravel)

  return { show: true, height, top, maxScrollTop, maxThumbTravel }
}

export function scrollTopForThumbDrag(input: {
  startScrollTop: number
  deltaY: number
  scrollHeight: number
  clientHeight: number
  thumbHeight: number
  trackPadding?: number
}) {
  const trackPadding = input.trackPadding ?? TRACK_PADDING
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight)
  const trackHeight = Math.max(0, input.clientHeight - trackPadding * 2)
  const maxThumbTravel = Math.max(0, trackHeight - input.thumbHeight)
  if (maxScrollTop === 0 || maxThumbTravel === 0) return 0

  const scrollDelta = input.deltaY * (maxScrollTop / maxThumbTravel)
  return clamp(input.startScrollTop + scrollDelta, 0, maxScrollTop)
}

export function ScrollView(props: ScrollViewProps) {
  const i18n = useI18n()
  const merged = mergeProps({ orientation: "vertical" }, props)
  const [local, events, rest] = splitProps(
    merged,
    ["class", "children", "viewportRef", "orientation", "style"],
    [
      "onScroll",
      "onWheel",
      "onTouchStart",
      "onTouchMove",
      "onTouchEnd",
      "onTouchCancel",
      "onPointerDown",
      "onClick",
      "onKeyDown",
    ],
  )

  let rootRef!: HTMLDivElement
  let viewportRef!: HTMLDivElement
  let thumbRef!: HTMLDivElement
  let mutationObserver: MutationObserver | undefined
  let thumbFrame: number | undefined

  const [resizeTargets, setResizeTargets] = createSignal<Element[]>([])

  const [state, setState] = createStore({
    isHovered: false,
    isDragging: false,
    thumbHeight: 0,
    thumbTop: 0,
    showThumb: false,
  })
  const isHovered = () => state.isHovered
  const isDragging = () => state.isDragging
  const thumbHeight = () => state.thumbHeight
  const thumbTop = () => state.thumbTop
  const showThumb = () => state.showThumb

  const updateThumb = () => {
    if (!viewportRef) return
    const { scrollTop, scrollHeight, clientHeight } = viewportRef
    const next = scrollThumbState({ scrollTop, scrollHeight, clientHeight })

    if (!next.show) {
      setState("showThumb", false)
      setState("thumbHeight", 0)
      setState("thumbTop", next.top)
      return
    }

    setState("showThumb", true)
    setState("thumbHeight", next.height)
    setState("thumbTop", next.top)
  }

  const scheduleUpdateThumb = () => {
    if (thumbFrame !== undefined) return
    thumbFrame = requestAnimationFrame(() => {
      thumbFrame = undefined
      updateThumb()
    })
  }

  const collectResizeTargets = () => {
    if (!viewportRef) return
    setResizeTargets([
      viewportRef,
      ...Array.from(viewportRef.children).filter((child): child is HTMLElement => child instanceof HTMLElement),
    ])
  }

  createResizeObserver(resizeTargets, scheduleUpdateThumb)

  onMount(() => {
    local.viewportRef?.(viewportRef)

    collectResizeTargets()
    mutationObserver = new MutationObserver(() => {
      collectResizeTargets()
      scheduleUpdateThumb()
    })
    mutationObserver.observe(viewportRef, { childList: true })
    updateThumb()
  })

  onCleanup(() => {
    if (thumbFrame !== undefined) cancelAnimationFrame(thumbFrame)
    mutationObserver?.disconnect()
    local.viewportRef?.(undefined)
  })

  let startY = 0
  let startScrollTop = 0

  const onThumbPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setState("isDragging", true)
    startY = e.clientY
    startScrollTop = viewportRef.scrollTop

    thumbRef.setPointerCapture(e.pointerId)

    const onPointerMove = (e: PointerEvent) => {
      const deltaY = e.clientY - startY
      const { scrollHeight, clientHeight } = viewportRef
      viewportRef.scrollTop = scrollTopForThumbDrag({
        startScrollTop,
        deltaY,
        scrollHeight,
        clientHeight,
        thumbHeight: thumbHeight(),
      })
    }

    const onPointerUp = (e: PointerEvent) => {
      setState("isDragging", false)
      thumbRef.releasePointerCapture(e.pointerId)
      thumbRef.removeEventListener("pointermove", onPointerMove)
      thumbRef.removeEventListener("pointerup", onPointerUp)
    }

    thumbRef.addEventListener("pointermove", onPointerMove)
    thumbRef.addEventListener("pointerup", onPointerUp)
  }

  // Keybinds implementation
  // We ensure the viewport has a tabindex so it can receive focus
  // We can also explicitly catch PageUp/Down if we want smooth scroll or specific behavior,
  // but native usually handles this perfectly. Let's explicitly ensure it behaves well.
  const onKeyDown = (e: KeyboardEvent) => {
    // If user is focused on an input inside the scroll view, don't hijack keys
    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      return
    }

    const next = scrollKey(e)
    if (!next) return

    const scrollAmount = viewportRef.clientHeight * 0.8
    const lineAmount = 40
    const scrollTo = (top: number) => {
      const max = Math.max(0, viewportRef.scrollHeight - viewportRef.clientHeight)
      viewportRef.scrollTop = clamp(top, 0, max)
    }

    switch (next) {
      case "page-down":
        e.preventDefault()
        scrollTo(viewportRef.scrollTop + scrollAmount)
        break
      case "page-up":
        e.preventDefault()
        scrollTo(viewportRef.scrollTop - scrollAmount)
        break
      case "home":
        e.preventDefault()
        scrollTo(0)
        break
      case "end":
        e.preventDefault()
        scrollTo(viewportRef.scrollHeight)
        break
      case "up":
        e.preventDefault()
        scrollTo(viewportRef.scrollTop - lineAmount)
        break
      case "down":
        e.preventDefault()
        scrollTo(viewportRef.scrollTop + lineAmount)
        break
    }
  }

  return (
    <div
      ref={rootRef}
      class={`scroll-view ${local.class || ""}`}
      style={local.style}
      onPointerEnter={() => setState("isHovered", true)}
      onPointerLeave={() => setState("isHovered", false)}
      {...rest}
    >
      {/* Viewport */}
      <div
        ref={viewportRef}
        class="scroll-view__viewport"
        data-scrollable
        onScroll={(e) => {
          updateThumb()
          if (typeof events.onScroll === "function") events.onScroll(e as any)
        }}
        onWheel={events.onWheel as any}
        onTouchStart={events.onTouchStart as any}
        onTouchMove={events.onTouchMove as any}
        onTouchEnd={events.onTouchEnd as any}
        onTouchCancel={events.onTouchCancel as any}
        onPointerDown={events.onPointerDown as any}
        onClick={events.onClick as any}
        tabIndex={0}
        role="region"
        aria-label={i18n.t("ui.scrollView.ariaLabel")}
        onKeyDown={(e) => {
          onKeyDown(e)
          if (typeof events.onKeyDown === "function") events.onKeyDown(e as any)
        }}
      >
        {local.children}
      </div>

      {/* Thumb Overlay */}
      <Show when={showThumb()}>
        <div
          ref={thumbRef}
          onPointerDown={onThumbPointerDown}
          class="scroll-view__thumb"
          data-visible={isHovered() || isDragging()}
          data-dragging={isDragging()}
          style={{
            height: `${thumbHeight()}px`,
            transform: `translateY(${thumbTop()}px)`,
            "z-index": 100, // ensure it displays over content
          }}
        />
      </Show>
    </div>
  )
}

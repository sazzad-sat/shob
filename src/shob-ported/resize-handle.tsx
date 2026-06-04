import type { JSX } from "solid-js"

type ResizeHandleProps = {
  edge: "start" | "end"
  onResize: (clientX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  class?: string
}

export function ResizeHandle(props: ResizeHandleProps) {
  const start = (event: PointerEvent) => {
    event.preventDefault()
    props.onResizeStart?.()

    const move = (moveEvent: PointerEvent) => {
      props.onResize(moveEvent.clientX)
    }

    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      props.onResizeEnd?.()
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={start as JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>}
      class={`shob-resize-handle shob-resize-handle-${props.edge} ${props.class ?? ""}`}
    />
  )
}

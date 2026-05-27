import { Show } from "solid-js"
import { createSignal, onCleanup, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function InlineSpinner(props: { frames: string[]; interval?: number; color?: RGBA }) {
  const [index, setIndex] = createSignal(0)

  onMount(() => {
    const ms = props.interval ?? 80
    const timer = setInterval(() => {
      const len = props.frames.length || 1
      setIndex((i) => (i + 1) % len)
    }, ms)
    onCleanup(() => clearInterval(timer))
  })

  return <text fg={props.color}>{props.frames[index()] ?? "⋯"}</text>
}

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  return (
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>⋯ {props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <InlineSpinner frames={frames} interval={80} color={color()} />
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}

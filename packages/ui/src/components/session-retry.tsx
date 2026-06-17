import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import type { SessionStatus } from "@shob-ai/sdk/v2/client"
import { useI18n } from "../context/i18n"
import { Card } from "./card"

const DOTS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function SessionRetry(props: { status: SessionStatus; show?: boolean }) {
  const i18n = useI18n()
  const retry = createMemo(() => {
    if (props.status.type !== "retry") return
    return props.status
  })

  const [seconds, setSeconds] = createSignal(0)
  const [frame, setFrame] = createSignal(0)

  // Interval for matching the unicode dots spinner
  createEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % DOTS_FRAMES.length)
    }, 80)
    onCleanup(() => clearInterval(timer))
  })

  createEffect(
    on(retry, (current) => {
      if (!current) return
      const update = () => {
        const next = retry()?.next
        if (!next) return
        const diff = Math.max(0, Math.round((next - Date.now()) / 1000))
        setSeconds(diff)
      }
      update()
      const timer = setInterval(update, 1000)
      onCleanup(() => clearInterval(timer))
    }),
  )

  const message = createMemo(() => {
    const current = retry()
    if (!current) return ""
    if (current.message.includes("exceeded your current quota") && current.message.includes("gemini")) {
      return i18n.t("ui.sessionTurn.retry.geminiHot")
    }
    return current.message
  })

  const info = createMemo(() => {
    const current = retry()
    if (!current) return ""
    const count = Math.max(0, seconds())
    const delay = count > 0 ? `in ${count}s` : ""
    return `Retrying ${delay} • Attempt #${current.attempt}`
  })

  return (
    <Show when={retry() && (props.show ?? true)}>
      <div data-slot="session-turn-retry" class="w-full">
        <Card variant="error" class="premium-error-card">
          <div class="flex items-start gap-3 w-full">
            {/* Cohesive unicode dots spinner matching the sidebar */}
            <div class="flex-shrink-0 mt-0.5 text-[14px] leading-none text-[var(--card-accent,var(--icon-critical-base,var(--destructive,#ed4831)))] font-mono select-none">
              {DOTS_FRAMES[frame()]}
            </div>
            
            <div class="flex flex-col gap-0.5 min-w-0">
              {/* Message */}
              <div class="text-[13px] font-semibold text-text-strong tracking-wide">
                {message()}
              </div>
              
              {/* Attempt and retry info */}
              <div class="text-[12px] text-text-weak font-medium">
                {info()}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Show>
  )
}

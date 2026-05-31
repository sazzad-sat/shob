import { createMemo, For, Show, type JSX } from "solid-js"
import type { Message, Part, UserMessage } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "./session-context-metrics"
import { estimateSessionContextBreakdown, type SessionContextBreakdownKey } from "./session-context-breakdown"

const BREAKDOWN_COLOR: Record<SessionContextBreakdownKey, string> = {
  system: "var(--syntax-info)",
  user: "var(--syntax-success)",
  assistant: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  other: "var(--syntax-comment)",
}

function Stat(props: { label: string; value: JSX.Element }) {
  return (
    <div class="flex flex-col gap-1">
      <div class="text-[11px] text-text-weak">{props.label}</div>
      <div class="text-[12px] font-medium text-text-strong">{props.value}</div>
    </div>
  )
}

const fmt = (value: number | null | undefined) => {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString()
}

const fmtPercent = (value: number | null | undefined) => {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString() + "%"
}

const fmtTime = (value: number | undefined) => {
  if (!value) return "\u2014"
  return new Date(value).toLocaleString()
}

const fmtCost = (value: number) => {
  return "$" + value.toFixed(4)
}

const BREAKDOWN_LABELS: Record<SessionContextBreakdownKey, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
  other: "Other",
}

export function SessionContextTab(props: { sessionId: string }) {
  const sync = useSync()
  const providers = useProviders()

  const messages = createMemo<Message[]>(() => {
    return (sync.data.message[props.sessionId] ?? []) as Message[]
  })

  const userMessages = createMemo(() => messages().filter((m) => m.role === "user") as UserMessage[])

  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const ctx = createMemo(() => metrics().context)

  const counts = createMemo(() => {
    const all = messages()
    return {
      all: all.length,
      user: all.reduce((c, x) => c + (x.role === "user" ? 1 : 0), 0),
      assistant: all.reduce((c, x) => c + (x.role === "assistant" ? 1 : 0), 0),
    }
  })

  const systemPrompt = createMemo(() => {
    for (let i = userMessages().length - 1; i >= 0; i--) {
      const system = userMessages()[i].system
      if (system?.trim()) return system.trim()
    }
  })

  const info = createMemo(() => sync.session.get(props.sessionId))

  const breakdown = createMemo(() => {
    const c = ctx()
    if (!c?.input) return []
    return estimateSessionContextBreakdown({
      messages: messages(),
      parts: sync.data.part as Record<string, Part[] | undefined>,
      input: c.input,
      systemPrompt: systemPrompt(),
    })
  })

  const stats = [
    { label: "Session", value: () => info()?.title ?? props.sessionId ?? "\u2014" },
    { label: "Messages", value: () => counts().all.toLocaleString() },
    { label: "Provider", value: () => ctx()?.providerLabel ?? "\u2014" },
    { label: "Model", value: () => ctx()?.modelLabel ?? "\u2014" },
    { label: "Context Limit", value: () => fmt(ctx()?.limit) },
    { label: "Total Tokens", value: () => fmt(ctx()?.total) },
    { label: "Usage", value: () => fmtPercent(ctx()?.usage) },
    { label: "Input Tokens", value: () => fmt(ctx()?.input) },
    { label: "Output Tokens", value: () => fmt(ctx()?.output) },
    { label: "Reasoning Tokens", value: () => fmt(ctx()?.reasoning) },
    {
      label: "Cache (Read/Write)",
      value: () => `${fmt(ctx()?.cacheRead)} / ${fmt(ctx()?.cacheWrite)}`,
    },
    { label: "User Messages", value: () => counts().user.toLocaleString() },
    { label: "Assistant Messages", value: () => counts().assistant.toLocaleString() },
    { label: "Total Cost", value: () => fmtCost(metrics().totalCost) },
    { label: "Created", value: () => fmtTime(info()?.time.created) },
    { label: "Last Activity", value: () => fmtTime(ctx()?.message.time.created) },
  ]

  return (
    <div class="h-full overflow-y-auto px-4 pt-3 pb-10">
      <div class="flex flex-col gap-8">
        <div class="grid grid-cols-2 gap-3">
          <For each={stats}>
            {(stat) => <Stat label={stat.label} value={stat.value()} />}
          </For>
        </div>

        <Show when={breakdown().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-[11px] text-text-weak">Context Breakdown</div>
            <div class="h-2 w-full rounded-full bg-surface-base overflow-hidden flex">
              <For each={breakdown()}>
                {(segment) => (
                  <div
                    class="h-full"
                    style={{
                      width: `${segment.width}%`,
                      "background-color": BREAKDOWN_COLOR[segment.key],
                    }}
                  />
                )}
              </For>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1">
              <For each={breakdown()}>
                {(segment) => (
                  <div class="flex items-center gap-1 text-[11px] text-text-weak">
                    <div class="size-2 rounded-sm" style={{ "background-color": BREAKDOWN_COLOR[segment.key] }} />
                    <div>{BREAKDOWN_LABELS[segment.key]}</div>
                    <div class="text-text-weaker">{segment.percent.toLocaleString()}%</div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={systemPrompt()}>
          {(prompt) => (
            <div class="flex flex-col gap-2">
              <div class="text-[11px] text-text-weak">System Prompt</div>
              <div class="border border-border-base rounded-md bg-surface-base px-3 py-2 text-[12px] text-text-base whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {prompt()}
              </div>
            </div>
          )}
        </Show>

        <div class="flex flex-col gap-2">
          <div class="text-[11px] text-text-weak">Messages ({counts().all})</div>
          <div class="flex flex-col gap-1">
            <For each={messages()}>
              {(message) => (
                <div class="flex items-center gap-2 rounded px-2 py-1 text-[11px] bg-surface-raised-base">
                  <span class="font-medium text-text-strong shrink-0">{message.role}</span>
                  <span class="text-text-weaker truncate">{message.id}</span>
                  <span class="text-text-weaker shrink-0 ml-auto">
                    {message.time?.created ? new Date(message.time.created).toLocaleTimeString() : ""}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}

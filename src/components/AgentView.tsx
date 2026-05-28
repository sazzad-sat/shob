import { createEffect, createMemo, createSignal, ErrorBoundary, For, onCleanup, Show } from "solid-js"
import { PromptInput } from "../opencode-ported/prompt-input"
import { MockSessionProviders } from "../opencode-ported/mock-session-layout"
import { useSync } from "@/context/sync"
import { useNavigate, useParams } from "@solidjs/router"
import { AssistantParts, Message } from "@opencode-ai/ui/message-part"
import { DataProvider, FileComponentProvider } from "@opencode-ai/ui/context"
import { Icon } from "@opencode-ai/ui/icon"
import { sessionTitle } from "@/utils/session-title"
import { createSessionComposerState } from "@/opencode-ported/composer/session-composer-state"
import { SessionQuestionDock } from "@/opencode-ported/composer/session-question-dock"
import { SessionPermissionDock } from "@/opencode-ported/composer/session-permission-dock"
import { SessionTodoDock } from "@/opencode-ported/composer/session-todo-dock"
import { useLanguage } from "@/context/language"
import { File as OpenCodeFile } from "@opencode-ai/ui/file"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import type { Message as ChatMessage, Part } from "@opencode-ai/sdk/v2/client"
import { useLocal } from "@/context/local"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { formatError } from "@/pages/error"
import { useStore } from "../store"

interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

function AgentErrorFallback(props: { error: unknown; reset: () => void }) {
  const language = useLanguage()
  const detail = createMemo(() => formatError(props.error, language.t))

  return (
    <div class="flex h-full min-h-0 w-full flex-col items-center justify-center bg-background-stronger px-6 py-8 text-foreground">
      <div class="flex w-full max-w-2xl flex-col items-center gap-5 text-center">
        <div class="flex size-11 items-center justify-center rounded-xl border border-border-danger-base bg-surface-base text-text-danger-base">
          <Icon name="warning" class="size-5" />
        </div>
        <div class="flex flex-col gap-1.5">
          <h2 class="text-16-semibold text-text-strong">{language.t("error.page.title")}</h2>
          <p class="text-13-regular text-text-weak">
            {language.t("error.page.description")}
          </p>
        </div>
        <TextField
          value={detail()}
          readOnly
          copyable
          multiline
          class="max-h-80 w-full text-left font-mono text-xs no-scrollbar"
          label={language.t("error.page.details.label")}
          hideLabel
        />
        <Button size="large" variant="ghost" onClick={props.reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}

function AgentViewInner(props: AgentViewProps) {
  const sync = useSync()
  const params = useParams()
  const navigate = useNavigate()
  const activeSidebarSessionId = useStore((s) => s.activeSessionId)
  const setActiveSidebarSession = useStore((s) => s.setActiveSession)
  const language = useLanguage()
  const local = useLocal()
  const [showJump, setShowJump] = createSignal(false)
  const [todoCollapsed, setTodoCollapsed] = createSignal(false)
  let scrollRef: HTMLDivElement | undefined
  let rafId: number | undefined
  const composerState = createSessionComposerState({ closeMs: 320 })
  const autoScroll = createAutoScroll({
    working: () => true,
    overflowAnchor: "dynamic",
    onUserInteracted: () => scheduleJumpStateUpdate(),
  })

  const activeSessionId = createMemo(() => {
    const id = params.id || props.sessionId
    return id?.startsWith("ses") ? id : undefined
  })

  const messages = createMemo<ChatMessage[]>(() => {
    const sessionID = activeSessionId()
    return sessionID ? (sync.data.message[sessionID] ?? []) : []
  })
  const getParts = (messageID: string): Part[] => sync.data.part[messageID] ?? []
  const info = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.session.get(sessionID) : undefined
  })
  const title = createMemo(() => sessionTitle(info()?.title) || "New session")
  const parentSessionID = createMemo(() => {
    const session = info() as { parentID?: string } | undefined
    return session?.parentID
  })
  const status = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.data.session_status[sessionID]?.type ?? "idle" : "idle"
  })
  const working = createMemo(() => status() !== "idle")
  const userMessages = createMemo(() => messages().filter((message) => message.role === "user"))
  const sessionID = createMemo(() => activeSessionId() ?? "")
  const assistantByParent = createMemo(() => {
    const grouped = new Map<string, ChatMessage[]>()
    for (const message of messages()) {
      if (message.role !== "assistant") continue
      const parentID = "parentID" in message ? message.parentID : undefined
      if (!parentID) continue
      const list = grouped.get(parentID)
      if (list) list.push(message)
      else grouped.set(parentID, [message])
    }
    return grouped
  })
  const orphanMessages = createMemo(() =>
    messages().filter((message) => message.role !== "user" && (!("parentID" in message) || !message.parentID)),
  )
  const isNewSession = createMemo(() => messages().length === 0)

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
  })

  // Keep global sidebar/terminal active session in sync with in-view route changes
  // (e.g. opening a subagent session from inside the agent timeline).
  createEffect(() => {
    const routeSessionID = params.id
    if (!routeSessionID?.startsWith("ses")) return
    if (activeSidebarSessionId() === routeSessionID) return
    setActiveSidebarSession(routeSessionID)
  })

  const updateJumpState = () => {
    if (!scrollRef) return
    const max = scrollRef.scrollHeight - scrollRef.clientHeight
    const distance = max - scrollRef.scrollTop
    const jumpThreshold = Math.max(400, scrollRef.clientHeight)
    setShowJump(max > 1 && distance > jumpThreshold)
  }

  const scheduleJumpStateUpdate = () => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      updateJumpState()
      rafId = undefined
    })
  }

  const jumpToBottom = () => {
    autoScroll.forceScrollToBottom()
    setShowJump(false)
  }

  createEffect(() => {
    messages()
    queueMicrotask(scheduleJumpStateUpdate)
  })

  createEffect(() => {
    autoScroll.userScrolled()
    scheduleJumpStateUpdate()
  })

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scrollRef = el
    autoScroll.scrollRef(el)
    if (el) queueMicrotask(scheduleJumpStateUpdate)
  }

  const assistantCopyPartID = (assistants: ChatMessage[], showCopy: boolean) => {
    if (!showCopy) return null
    const assistant = assistants.at(-1)
    if (!assistant) return null
    return (
      getParts(assistant.id)
        .filter((part: any) => part.type === "text" && part.text?.trim())
        .at(-1)?.id ?? null
    )
  }

  const timeValue = (message: ChatMessage, key: "created" | "completed") => {
    const value = (message as any).time?.[key]
    return typeof value === "number" ? value : undefined
  }

  const turnDurationMs = (user: ChatMessage, assistants: ChatMessage[]) => {
    const last = assistants.at(-1)
    if (!last) return undefined
    const start = timeValue(user, "created") ?? timeValue(last, "created")
    const end = timeValue(last, "completed") ?? timeValue(last, "created")
    if (start === undefined || end === undefined || end < start) return undefined
    return end - start
  }

  const FilePreview = (fileProps: any) => <OpenCodeFile {...fileProps} />
  const goToParentSession = () => {
    const parentID = parentSessionID()
    const dir = params.dir
    if (!parentID || !dir) return
    navigate(`/${dir}/session/${parentID}`)
  }

  return (
    <DataProvider data={sync.data} directory={props.projectPath ?? ""}>
      <FileComponentProvider component={FilePreview}>
        <div class="relative flex h-full min-h-0 w-full flex-col overflow-x-hidden bg-background-stronger text-foreground">
          <div class="relative min-h-0 flex-1 overflow-hidden">
            <div
              class="pointer-events-none absolute bottom-6 left-1/2 z-[60] -translate-x-1/2 transition-all duration-200 ease-out"
              classList={{
                "translate-y-0 scale-100 opacity-100": showJump(),
                "pointer-events-none translate-y-2 scale-95 opacity-0": !showJump(),
              }}
            >
              <button
                type="button"
                class="pointer-events-auto flex h-8 w-10 cursor-pointer items-center justify-center border-none bg-transparent p-0 group"
                onClick={jumpToBottom}
                aria-label="Jump to bottom"
              >
                <div
                  class="flex h-6 w-8 items-center justify-center rounded-[6px] border border-border-weaker-base bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] backdrop-blur-[0.75px] transition-colors group-hover:border-[var(--border-weak-base)]"
                  style={{
                    "box-shadow":
                      "0 51px 60px 0 rgba(0,0,0,0.10), 0 15px 18px 0 rgba(0,0,0,0.12), 0 6.386px 7.513px 0 rgba(0,0,0,0.12), 0 2.31px 2.717px 0 rgba(0,0,0,0.20)",
                  }}
                >
                  <Icon name="arrow-down-to-line" size="small" />
                </div>
              </button>
            </div>

            <div
              ref={setScrollRef}
              data-slot="session-turn-content"
              class="h-full min-w-0 overflow-x-hidden overflow-y-auto thin-scrollbar"
              style={{
                "--session-title-height": "40px",
                "--sticky-accordion-top": "48px",
              }}
              onScroll={() => {
                autoScroll.handleScroll()
                scheduleJumpStateUpdate()
              }}
            >
              <div onClick={autoScroll.handleInteraction}>
                <div
                  data-session-title
                  class="sticky top-0 z-30 w-full bg-[linear-gradient(to_bottom,var(--background-stronger)_48px,transparent)] pb-4 pl-2 pr-3 md:mx-auto md:max-w-200 md:pl-4 md:pr-3 2xl:max-w-[1000px]"
                >
                  <div class="flex h-12 w-full items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2 pr-3">
                      <h1 data-slot="session-title-child" class="min-w-0 flex-1 truncate text-14-medium text-text-strong">
                        {title()}
                      </h1>
                    </div>
                    <Show when={parentSessionID()}>
                      <button
                        type="button"
                        class="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={goToParentSession}
                      >
                        Back to parent
                      </button>
                    </Show>
                  </div>
                </div>

                <div ref={autoScroll.contentRef} class="min-h-full pb-56 pt-2">
                  <For each={userMessages()}>
                    {(message, index) => {
                      const assistants = createMemo(() => assistantByParent().get(message.id) ?? [])
                      const latestTurn = createMemo(() => index() === userMessages().length - 1)

                      return (
                        <div
                          id={`message-${message.id}`}
                          data-message-id={message.id}
                          data-timeline-row="UserMessage"
                          class="min-w-0 w-full max-w-full md:mx-auto md:max-w-200 2xl:max-w-[1000px]"
                          classList={{ "pt-6": index() > 0 }}
                        >
                          <div data-component="session-turn" class="relative min-w-0 w-full">
                            <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
                              <div data-slot="session-turn-message-content" aria-live="off">
                                <Message message={message} parts={getParts(message.id)} />
                              </div>
                            </div>
                          </div>

                          <Show when={assistants().length > 0}>
                            <div
                              data-message-id={message.id}
                              data-timeline-row="AssistantPart"
                              class="min-w-0 w-full max-w-full pt-3"
                            >
                              <div data-component="session-turn" class="relative min-w-0 w-full">
                                <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
                                  <div
                                    data-slot="session-turn-assistant-content"
                                    aria-hidden={working() && latestTurn()}
                                  >
                                    <AssistantParts
                                      messages={assistants() as any}
                                      showReasoningSummaries
                                      working={working() && latestTurn()}
                                      turnDurationMs={turnDurationMs(message, assistants())}
                                      showAssistantCopyPartID={assistantCopyPartID(assistants(), !working() && latestTurn())}
                                      shellToolDefaultOpen={false}
                                      editToolDefaultOpen={false}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>

                  <For each={orphanMessages()}>
                    {(message) => (
                      <div class="min-w-0 w-full max-w-full pt-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
                        <div data-component="session-turn" class="relative min-w-0 w-full">
                          <div data-slot="session-turn-message-container" class="w-full px-4 md:px-5">
                            <div data-slot="session-turn-assistant-content">
                              <Message message={message} parts={getParts(message.id)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>

                  <Show when={messages().length === 0}>
                    <div class="relative isolate flex h-[50vh] flex-col items-center justify-center px-6 text-center overflow-visible">
                      <div
                        aria-hidden="true"
                        class="pointer-events-none absolute left-1/2 top-[74%] z-0 h-[62vh] w-[88vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] opacity-60 blur-[115px]"
                        style={{
                          background:
                            "radial-gradient(ellipse at center, rgba(37, 99, 235, 0.34) 0%, rgba(30, 64, 175, 0.18) 38%, rgba(15, 23, 42, 0.10) 58%, rgba(7, 9, 19, 0) 80%)",
                        }}
                      />
                      <div
                        aria-hidden="true"
                        class="pointer-events-none absolute left-1/2 top-[78%] z-0 h-[36vh] w-[56vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] opacity-55 blur-[85px]"
                        style={{
                          background:
                            "radial-gradient(ellipse at center, rgba(96, 165, 250, 0.24) 0%, rgba(59, 130, 246, 0.14) 46%, rgba(30, 58, 138, 0.08) 66%, rgba(7, 9, 19, 0) 84%)",
                        }}
                      />
                      <div
                        aria-hidden="true"
                        class="pointer-events-none absolute left-1/2 top-[82%] z-0 h-[18vh] w-[34vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] opacity-45 blur-[62px]"
                        style={{
                          background:
                            "radial-gradient(ellipse at center, rgba(147, 197, 253, 0.18) 0%, rgba(59, 130, 246, 0.10) 50%, rgba(7, 9, 19, 0) 82%)",
                        }}
                      />
                      {/* Floating Glow Brand Icon */}
                      <div class="relative z-10 mb-5 flex size-14 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800/80 shadow-[0_0_20px_rgba(99,102,241,0.15)] animate-pulse">
                        <Show when={local.model.current()?.provider?.id} fallback={<Icon name="models" class="size-6 text-indigo-400" />}>
                          <ProviderIcon id={local.model.current()?.provider?.id ?? ""} class="size-6 opacity-90" />
                        </Show>
                      </div>

                      {/* Welcoming Text */}
                      <h2 class="relative z-10 text-18-semibold text-text-strong tracking-tight mb-1.5">
                        {language.t("agent.welcome") || "How can I help you today?"}
                      </h2>
                      <p class="relative z-10 text-13-regular text-text-weak max-w-sm mb-5">
                        Start a conversation with the agent. You are currently connected to:
                      </p>

                      {/* Status Pill capsules */}
                      <div class="relative z-10 flex items-center gap-2 flex-wrap justify-center">
                        {/* Model Capsule */}
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/60 border border-zinc-800/80 text-11-medium text-text-strong font-mono">
                          <Show when={local.model.current()?.provider?.id} fallback={<Icon name="models" class="size-3 text-indigo-400" />}>
                            <ProviderIcon id={local.model.current()?.provider?.id ?? ""} class="size-3" />
                          </Show>
                          <span>{local.model.current()?.name || "No Model"}</span>
                        </div>

                        {/* Agent Capsule */}
                        <Show when={local.agent.current()?.name}>
                          {(agentName) => (
                            <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/60 border border-zinc-800/80 text-11-medium text-text-strong font-mono capitalize">
                              <Icon name="brain" class="size-3 text-purple-400" />
                              <span>{agentName()} Agent</span>
                            </div>
                          )}
                        </Show>
                      </div>
                      <div class="relative z-10 mt-8 w-full max-w-4xl text-left">
                        <PromptInput />
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </div>

          <Show when={!isNewSession()}>
            <div
              data-component="session-prompt-dock"
              class="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex w-full flex-col items-center justify-center bg-background-stronger pb-3"
            >
              <div class="pointer-events-auto w-full px-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
                <Show when={composerState.questionRequest()} keyed>
                  {(request) => (
                    <div class="pb-2">
                      <SessionQuestionDock request={request} onSubmit={() => undefined} />
                    </div>
                  )}
                </Show>
                <Show when={composerState.permissionRequest()} keyed>
                  {(request) => (
                    <div class="pb-2">
                      <SessionPermissionDock
                        request={request}
                        responding={composerState.permissionResponding()}
                        onDecide={composerState.decide}
                      />
                    </div>
                  )}
                </Show>
                <Show when={composerState.dock() && composerState.todos().length > 0}>
                  <div class="pb-2">
                    <SessionTodoDock
                      todos={composerState.todos()}
                      collapsed={todoCollapsed()}
                      onToggle={() => setTodoCollapsed((v) => !v)}
                      collapseLabel={language.t("session.todo.collapse")}
                      expandLabel={language.t("session.todo.expand")}
                    />
                  </div>
                </Show>
                <PromptInput />
              </div>
            </div>
          </Show>
        </div>
      </FileComponentProvider>
    </DataProvider>
  )
}

export function AgentView(props: AgentViewProps) {
  return (
    <Show when={props.projectPath}>
      <MockSessionProviders directory={props.projectPath!} sessionId={props.sessionId}>
        <ErrorBoundary fallback={(error, reset) => <AgentErrorFallback error={error} reset={reset} />}>
          <AgentViewInner {...props} />
        </ErrorBoundary>
      </MockSessionProviders>
    </Show>
  )
}

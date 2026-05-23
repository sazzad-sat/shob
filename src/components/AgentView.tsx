import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { PromptInput } from "../opencode-ported/prompt-input"
import { MockSessionProviders } from "../opencode-ported/mock-session-layout"
import { useSync } from "@/context/sync"
import { useParams } from "@solidjs/router"
import { AssistantParts, Message } from "@opencode-ai/ui/message-part"
import { DataProvider, FileComponentProvider } from "@opencode-ai/ui/context"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { sessionTitle } from "@/utils/session-title"
import { createSessionComposerState } from "@/opencode-ported/composer/session-composer-state"
import { SessionQuestionDock } from "@/opencode-ported/composer/session-question-dock"
import { SessionPermissionDock } from "@/opencode-ported/composer/session-permission-dock"
import { SessionTodoDock } from "@/opencode-ported/composer/session-todo-dock"
import { useLanguage } from "@/context/language"
import { File as OpenCodeFile } from "@opencode-ai/ui/file"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import type { Message as ChatMessage, Part } from "@opencode-ai/sdk/v2/client"

interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

function AgentViewInner(props: AgentViewProps) {
  const sync = useSync()
  const params = useParams()
  const language = useLanguage()
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

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
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

  return (
    <DataProvider data={sync.data} directory={props.projectPath ?? ""}>
      <FileComponentProvider component={FilePreview}>
        <div class="flex h-full min-h-0 w-full flex-col bg-background-stronger text-foreground">
          <div class="relative min-h-0 flex-1">
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
              class="h-full min-w-0 overflow-y-auto"
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
                  <Show when={working()}>
                    <div
                      data-component="session-progress"
                      data-state="showing"
                      aria-hidden="true"
                      style={{
                        "--session-progress-color": "var(--icon-interactive-base)",
                        "--session-progress-ms": "1800ms",
                      }}
                    >
                      <div data-component="session-progress-bar" />
                    </div>
                  </Show>
                  <div class="flex h-12 w-full items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2 pr-3">
                      <div
                        class="flex shrink-0 items-center justify-center overflow-hidden transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{
                          width: working() ? "16px" : "0px",
                          "margin-right": working() ? "6px" : "0px",
                        }}
                        aria-hidden="true"
                      >
                        <Show when={working()}>
                          <Spinner class="size-4 text-icon-interactive" />
                        </Show>
                      </div>
                      <h1 data-slot="session-title-child" class="min-w-0 flex-1 truncate text-14-medium text-text-strong">
                        {title()}
                      </h1>
                    </div>
                  </div>
                </div>

                <div ref={autoScroll.contentRef} class="min-h-full pb-12 pt-2">
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
                  <div class="flex h-[42vh] items-center justify-center px-6 text-center text-14-regular text-text-weak">
                    Start a conversation with the agent
                  </div>
                </Show>
                </div>
              </div>
            </div>
          </div>

          <div
            data-component="session-prompt-dock"
            class="pointer-events-none flex w-full shrink-0 flex-col items-center justify-center bg-background-stronger pb-3"
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
        </div>
      </FileComponentProvider>
    </DataProvider>
  )
}

export function AgentView(props: AgentViewProps) {
  return (
    <Show when={props.projectPath}>
      <MockSessionProviders directory={props.projectPath!} sessionId={props.sessionId}>
        <AgentViewInner {...props} />
      </MockSessionProviders>
    </Show>
  )
}

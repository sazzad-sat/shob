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
import type { EventSessionError, Message as ChatMessage, Part, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { useLocal } from "@/context/local"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { formatError } from "@/pages/error"
import { useStore } from "../store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { nativeApi } from "@/services/native"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Card, CardDescription, CardTitle } from "@opencode-ai/ui/card"
import { SessionRetry } from "@opencode-ai/ui/session-retry"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { formatServerError } from "@/utils/server-errors"
import { Check, Copy, MoreHorizontal, Pencil, Pin, X } from "lucide-solid"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

const basename = (path?: string | null) => {
  if (!path) return "No project"
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const messageTextAsMarkdown = (message: ChatMessage, parts: Part[]) => {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.ignored)
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n\n")
  if (!text) return ""
  const role = message.role === "user" ? "User" : "Assistant"
  return `## ${role}\n\n${text}`
}

const idleStatus: SessionStatus = { type: "idle" }

function isAbortError(error: EventSessionError["properties"]["error"] | undefined) {
  return error?.name === "MessageAbortedError"
}

function isRecoveringError(error: EventSessionError["properties"]["error"] | undefined) {
  return error?.name === "ContextOverflowError"
}

function assistantMessageError(message: ChatMessage | undefined) {
  if (!message || message.role !== "assistant") return
  const error = (message as { error?: EventSessionError["properties"]["error"] }).error
  if (isAbortError(error) || isRecoveringError(error)) return
  return error
}

function AgentTurnError(props: { error: EventSessionError["properties"]["error"] | unknown }) {
  const language = useLanguage()
  const detail = createMemo(() =>
    formatServerError(props.error, language.t, language.t("notification.session.error.fallbackDescription")),
  )

  return (
    <Card variant="error" class="premium-error-card">
      <div class="flex items-start gap-3 w-full">
        {/* Simple crisp error warning icon */}
        <div class="flex-shrink-0 mt-0.5 text-[var(--card-accent,var(--icon-critical-base,var(--destructive,#ed4831)))] animate-pulse-slow">
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class="text-[13px] font-semibold text-text-strong tracking-wide">
            {language.t("notification.session.error.title")}
          </div>
          <div class="text-[12px] text-text-weak font-medium leading-relaxed break-words whitespace-pre-wrap">
            {detail()}
          </div>
        </div>
      </div>
    </Card>
  )
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
  const sdk = useSDK()
  const params = useParams()
  const navigate = useNavigate()
  const activeSidebarSessionId = useStore((s) => s.activeSessionId)
  const setActiveSidebarSession = useStore((s) => s.setActiveSession)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const renameSession = useStore((s) => s.renameSession)
  const updateSession = useStore((s) => s.updateSession)
  const language = useLanguage()
  const local = useLocal()
  const dialog = useDialog()
  const [showJump, setShowJump] = createSignal(false)
  const [sessionMenuOpen, setSessionMenuOpen] = createSignal(false)
  const [renameOpen, setRenameOpen] = createSignal(false)
  const [renameValue, setRenameValue] = createSignal("")
  const [renameSaving, setRenameSaving] = createSignal(false)
  const [todoCollapsed, setTodoCollapsed] = createSignal(false)
  const [gitBranch, setGitBranch] = createSignal("")
  const [gitChanges, setGitChanges] = createSignal<number | null>(null)
  let scrollRef: HTMLDivElement | undefined
  let rafId: number | undefined
  const composerState = createSessionComposerState({ closeMs: 320 })
  const autoScroll = createAutoScroll({
    working: () => true,
    overflowAnchor: "dynamic",
    onUserInteracted: () => scheduleJumpStateUpdate(),
  })

  // props.sessionId is ALWAYS the authoritative source. params.id lags behind
  // because the MemoryRouter updates asynchronously. If params.id were checked
  // first, switching sessions would briefly read the old (possibly-running)
  // session's status, making working()=true and triggering auto-scroll.
  const activeSessionId = createMemo(() => {
    const id = props.sessionId || params.id
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
  const currentProject = createMemo(() => projects().find((project) => project.id === currentProjectId()) ?? null)
  const currentLocalSession = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? currentProject()?.sessions.find((session) => session.id === sessionID) ?? null : null
  })
  const title = createMemo(() => currentLocalSession()?.name || sessionTitle(info()?.title) || "New session")
  const parentSessionID = createMemo(() => {
    const session = info() as { parentID?: string } | undefined
    return session?.parentID
  })
  const statusInfo = createMemo<SessionStatus>(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.data.session_status[sessionID] ?? idleStatus : idleStatus
  })
  const status = createMemo(() => statusInfo().type)
  const working = createMemo(() => status() !== "idle")
  const sessionEventError = createMemo(() => {
    const sessionID = activeSessionId()
    const error = sessionID ? sync.data.session_error[sessionID] : undefined
    if (isAbortError(error) || isRecoveringError(error)) return
    return error
  })
  const currentProjectName = createMemo(() => {
    const current = currentProject()
    return current?.name || basename(current?.path || props.projectPath)
  })
  const selectedModel = createMemo(() => local.model.current())
  const selectedAgent = createMemo(() => local.agent.current()?.name || "auto")
  const selectedVariant = createMemo(() => local.model.variant.current() || "default")
  const userMessages = createMemo(() => messages().filter((message) => message.role === "user"))
  const sessionID = createMemo(() => activeSessionId() ?? "")
  const renameValueTrimmed = createMemo(() => renameValue().trim())
  const canRename = createMemo(() => {
    const next = renameValueTrimmed()
    return next.length > 0 && next !== title()
  })
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

  const runSessionMenuAction = (event: MouseEvent, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    setSessionMenuOpen(false)
    window.setTimeout(action, 0)
  }

  const togglePinChat = () => {
    const project = currentProject()
    const session = currentLocalSession()
    if (!project || !session) return
    void updateSession(project.id, session.id, { pinned: !session.pinned })
  }

  const openRenameDialog = () => {
    setRenameValue(title())
    setSessionMenuOpen(false)
    window.setTimeout(() => setRenameOpen(true), 20)
  }

  const submitRename = async () => {
    const next = renameValueTrimmed()
    const project = currentProject()
    const session = currentLocalSession()
    if (!project || !session || !next || next === title() || renameSaving()) return

    setRenameSaving(true)
    try {
      await renameSession(project.id, session.id, next)
      await sdk.client.session.update({ sessionID: session.id, title: next }).catch(() => undefined)
      void sync.session.sync(session.id)
      setRenameOpen(false)
    } finally {
      setRenameSaving(false)
    }
  }

  const copySessionAsMarkdown = async () => {
    const blocks = messages()
      .map((message) => messageTextAsMarkdown(message, getParts(message.id)))
      .filter(Boolean)
    const markdown = [`# ${title()}`, "", ...blocks].join("\n\n").trim()

    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      showToast({ title: "Copied as Markdown" })
    } catch {
      showToast({ variant: "error", title: "Copy failed", description: "Could not write session Markdown to clipboard." })
    }
  }

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
  })

  createEffect(() => {
    const path = props.projectPath
    setGitBranch("")
    setGitChanges(null)
    if (!path) return

    let cancelled = false
    void nativeApi.invoke("get_git_branch", { path })
      .then((info: any) => {
        if (cancelled) return
        setGitBranch(typeof info?.head === "string" ? info.head : "")
      })
      .catch(() => {
        if (!cancelled) setGitBranch("")
      })

    void nativeApi.invoke("get_git_status", { path })
      .then((status: any) => {
        if (cancelled) return
        const count = Array.isArray(status?.changedFiles) ? status.changedFiles.length : null
        setGitChanges(count)
      })
      .catch(() => {
        if (!cancelled) setGitChanges(null)
      })

    onCleanup(() => {
      cancelled = true
    })
  })

  // Keep global sidebar/terminal active session in sync with in-view route changes
  // (e.g. opening a subagent session from inside the agent timeline).
  // NOTE: Disabled for store-based navigation — the sidebar sets activeSessionId
  // directly, and the router params lag behind causing reverts.
  // createEffect(() => {
  //   const routeSessionID = params.id
  //   if (!routeSessionID?.startsWith("ses")) return
  //   if (activeSidebarSessionId() === routeSessionID) return
  //   setActiveSidebarSession(routeSessionID)
  // })

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

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return

    let lastToastID = ""
    const unsub = sdk.event.on("session.error", (event) => {
      const props = event.properties
      if (props.sessionID && props.sessionID !== sessionID) return
      if (isAbortError(props.error) || isRecoveringError(props.error)) return
      if (event.id === lastToastID) return

      lastToastID = event.id
      showToast({
        variant: "error",
        title: language.t("notification.session.error.title"),
        description: formatServerError(
          props.error,
          language.t,
          language.t("notification.session.error.fallbackDescription"),
        ),
      })
      queueMicrotask(scheduleJumpStateUpdate)
    })
    onCleanup(unsub)
  })

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
        <>
        <Show when={renameOpen()}>
          <div
            class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-chat-title"
            onClick={() => {
              if (!renameSaving()) setRenameOpen(false)
            }}
          >
            <form
              class="grid w-full max-w-[420px] gap-0 overflow-hidden rounded-xl border border-border-weak-base bg-surface-raised-base shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault()
                void submitRename()
              }}
            >
              <div class="border-b border-border-weak-base px-4 pt-4 pb-3">
                <div class="flex items-center gap-2">
                  <span class="flex size-8 items-center justify-center rounded-md bg-surface-raised-base-hover text-text-weaker">
                    <Pencil size={15} />
                  </span>
                  <div class="min-w-0">
                    <h2 id="rename-chat-title" class="text-[15px] font-semibold text-text-strong">Rename chat</h2>
                    <p class="truncate text-[12px] text-text-weak">{currentProjectName()}</p>
                  </div>
                  <button
                    type="button"
                    class="ml-auto flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                    aria-label="Close rename chat dialog"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!renameSaving()) setRenameOpen(false)
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div class="grid gap-2 px-4 py-4">
                <label class="text-[12px] font-medium text-text-base" for={`rename-chat-${sessionID()}`}>
                  Chat title
                </label>
                <input
                  id={`rename-chat-${sessionID()}`}
                  class="h-9 rounded-md border border-border-weak-base bg-background-stronger px-3 text-[13px] text-text-strong outline-none transition-colors placeholder:text-text-weaker focus:border-border-weak-hover focus:bg-surface-raised-base-hover"
                  value={renameValue()}
                  placeholder="Chat title"
                  onInput={(e) => setRenameValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation()
                      if (!renameSaving()) setRenameOpen(false)
                    }
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void submitRename()
                    }
                  }}
                  ref={(el) =>
                    setTimeout(() => {
                      el.focus()
                      el.select()
                    }, 50)
                  }
                />
                <Show when={!renameValueTrimmed()}>
                  <div class="text-[12px] text-icon-critical-base">Chat title cannot be empty.</div>
                </Show>
              </div>

              <div class="flex justify-end gap-2 border-t border-border-weak-base bg-background-stronger px-4 py-3">
                <button
                  type="button"
                  class="inline-flex h-8 items-center justify-center rounded-lg border border-border-weak-base bg-background-stronger px-3 text-[13px] font-medium text-text-base transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!renameSaving()) setRenameOpen(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canRename() || renameSaving()}
                  class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    void submitRename()
                  }}
                >
                  <Check size={14} />
                  {renameSaving() ? "Saving..." : "Save title"}
                </button>
              </div>
            </form>
          </div>
        </Show>

        <div class="agent-terminal-view relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-stronger text-foreground">
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
              class="agent-terminal-scroll h-full min-w-0 overflow-x-hidden overflow-y-auto thin-scrollbar"
              classList={{ "agent-terminal-scroll-empty": messages().length === 0 }}
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
                  class="agent-terminal-title sticky top-0 z-30 w-full px-3 md:px-4"
                >
                  <div class="flex w-full items-center gap-2.5">
                    <div class="agent-session-title-cluster flex min-w-0 flex-1 items-center gap-2">
                      <h1 data-slot="session-title-child" class="max-w-[min(56vw,620px)] truncate text-[13px] font-semibold text-text-strong">
                        {title()}
                      </h1>
                      <Show when={currentLocalSession()?.pinned}>
                        <Pin size={12} class="shrink-0 fill-current text-text-weaker" />
                      </Show>
                      <DropdownMenu open={sessionMenuOpen()} onOpenChange={setSessionMenuOpen} placement="bottom-start" gutter={4}>
                        <DropdownMenuTrigger
                          class="agent-session-menu-trigger flex size-7 shrink-0 items-center justify-center rounded-lg text-text-weak transition-colors hover:text-text-strong data-expanded:text-text-strong"
                          title="Chat actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal size={15} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-[210px] rounded-lg border border-border-weak-base bg-surface-raised-base/95 p-1.5 text-[13px] shadow-2xl backdrop-blur">
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, togglePinChat)}
                          >
                            <Pin size={14} class={currentLocalSession()?.pinned ? "fill-current" : ""} />
                            {currentLocalSession()?.pinned ? "Unpin chat" : "Pin chat"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, openRenameDialog)}
                          >
                            <Pencil size={14} />
                            Rename chat
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, () => void copySessionAsMarkdown())}
                          >
                            <Copy size={14} />
                            Copy as Markdown
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Show when={parentSessionID()}>
                      <button
                        type="button"
                        class="ml-auto shrink-0 rounded-[4px] border border-border px-2 py-1 font-mono text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={goToParentSession}
                      >
                        Back to parent
                      </button>
                    </Show>
                  </div>
                </div>

                <div
                  ref={autoScroll.contentRef}
                  class="agent-terminal-buffer min-h-full pb-56 pt-2"
                  classList={{ "agent-terminal-buffer-empty": messages().length === 0 }}
                >
                  <For each={userMessages()}>
                    {(message, index) => {
                      const assistants = createMemo(() => assistantByParent().get(message.id) ?? [])
                      const latestTurn = createMemo(() => index() === userMessages().length - 1)
                      const assistantVisible = createMemo(() => {
                        let visible = 0
                        for (const msg of assistants()) {
                          if (assistantMessageError(msg)) visible++
                          const parts = getParts(msg.id)
                          for (const part of parts) {
                            if (part.type === "text" && part.text?.trim()) visible++
                            if (part.type === "tool" && part.tool !== "todowrite") visible++
                          }
                        }
                        return visible
                      })
                      const assistantError = createMemo(() => {
                        for (const msg of assistants()) {
                          const error = assistantMessageError(msg)
                          if (error) return error
                        }
                      })
                      const turnError = createMemo(() => assistantError() ?? (latestTurn() ? sessionEventError() : undefined))
                      const showAssistantBlock = createMemo(
                        () => assistants().length > 0 || !!turnError() || (latestTurn() && statusInfo().type === "retry"),
                      )
                      const showThinking = createMemo(
                        () => working() && latestTurn() && assistantVisible() === 0 && !turnError() && statusInfo().type !== "retry",
                      )

                      return (
                        <div
                          id={`message-${message.id}`}
                          data-message-id={message.id}
                          data-timeline-row="UserMessage"
                          class="agent-terminal-turn min-w-0 w-full max-w-full md:mx-auto md:max-w-200 2xl:max-w-[1000px]"
                          classList={{ "pt-6": index() > 0 }}
                        >
                          <div data-component="session-turn" class="relative min-w-0 w-full">
                            <div data-slot="session-turn-message-container" class="w-full">
                              <div data-slot="session-turn-message-content" aria-live="off">
                                <Message message={message} parts={getParts(message.id)} />
                              </div>
                            </div>
                          </div>

                          <Show when={showAssistantBlock()}>
                            <div
                              data-message-id={message.id}
                              data-timeline-row="AssistantPart"
                              class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3"
                            >
                              <div data-component="session-turn" class="relative min-w-0 w-full">
                                <div data-slot="session-turn-message-container" class="w-full">
                                  <Show when={assistants().length > 0}>
                                    <div
                                      data-slot="session-turn-assistant-content"
                                      aria-hidden={working() && latestTurn()}
                                    >
                                      <AssistantParts
                                        messages={assistants() as any}
                                        showReasoningSummaries={true}
                                        working={working() && latestTurn()}
                                        turnDurationMs={turnDurationMs(message, assistants())}
                                        showAssistantCopyPartID={assistantCopyPartID(assistants(), !working() && latestTurn())}
                                        shellToolDefaultOpen={false}
                                        editToolDefaultOpen={false}
                                      />
                                    </div>
                                  </Show>
                                  <Show when={latestTurn()}>
                                    <SessionRetry status={statusInfo()} show={!turnError()} />
                                  </Show>
                                  <Show when={turnError()} keyed>
                                    {(error) => <AgentTurnError error={error} />}
                                  </Show>
                                </div>
                              </div>
                            </div>
                          </Show>

                          <Show when={showThinking()}>
                            <div class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3">
                              <div data-component="session-turn" class="relative min-w-0 w-full">
                                <div data-slot="session-turn-message-container" class="w-full">
                                  <div data-slot="session-turn-thinking" class="pl-2">
                                    <TextShimmer text={language.t("ui.sessionTurn.status.thinking") ?? "Thinking..."} />
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
                      <div class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
                        <div data-component="session-turn" class="relative min-w-0 w-full">
                          <div data-slot="session-turn-message-container" class="w-full">
                            <div data-slot="session-turn-assistant-content">
                              <Message message={message} parts={getParts(message.id)} showReasoningSummaries={true} />
                            </div>
                            <Show when={assistantMessageError(message)} keyed>
                              {(error) => <AgentTurnError error={error} />}
                            </Show>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>

                  <Show when={messages().length === 0}>
                    <div class="agent-terminal-empty relative isolate flex min-h-0 flex-col items-stretch justify-center px-2 text-left overflow-visible md:mx-auto md:px-5">
                      <div class="agent-terminal-new-session relative z-10 w-full">
                        <div class="relative z-10 w-full text-left">
                          <PromptInput />
                        </div>

                        <div class="agent-terminal-session-bar">
                          <div class="agent-terminal-session-controls">
                            <label class="agent-terminal-project-switch">
                              <Icon name="folder" class="size-3.5" />
                              <select
                                value={currentProjectId() ?? ""}
                                onChange={(event) => setCurrentProject(event.currentTarget.value || null)}
                                aria-label="Switch project"
                              >
                                <For each={projects()}>
                                  {(project) => <option value={project.id}>{project.name || basename(project.path)}</option>}
                                </For>
                              </select>
                            </label>

                            <button
                              type="button"
                              class="agent-terminal-model-switch"
                              onClick={() => dialog.show(() => <DialogSelectModel model={local.model} />)}
                            >
                              <Show when={selectedModel()?.provider?.id} fallback={<Icon name="models" class="size-3.5" />}>
                                <ProviderIcon id={selectedModel()?.provider?.id ?? ""} class="size-3.5" />
                              </Show>
                              <span>{selectedModel()?.name || "Select model"}</span>
                            </button>

                            <div class="agent-terminal-session-meta agent-terminal-session-meta-inline">
                              <div class="agent-terminal-meta-chip">
                                <Icon name="brain" class="size-3.5" />
                                <span class="capitalize">{selectedAgent()}</span>
                              </div>
                              <Show when={gitBranch()}>
                                <div class="agent-terminal-meta-chip">
                                  <Icon name="branch" class="size-3.5" />
                                  <span>{gitBranch()}</span>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </div>
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
              class="agent-terminal-dock pointer-events-none shrink-0 w-full flex flex-col items-center justify-center pb-3"
            >
              <div class="pointer-events-auto w-full px-2 md:px-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
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
        </>
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

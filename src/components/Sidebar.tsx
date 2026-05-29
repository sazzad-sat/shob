import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { MoreHorizontal, Plus, Settings, SquarePen, Trash2 } from "lucide-solid"
import { nativeApi } from "../services/native"
import { useStore } from "../store"
import type { Project } from "../types"
import { ResizeHandle } from "@/opencode-ported/resize-handle"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import type { Session as OpenCodeSession } from "@opencode-ai/sdk/v2/client"
import { DotsSpinner } from "./DotsSpinner"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { sessionPermissionRequest } from "@/opencode-ported/composer/session-request-tree"
import { useServer } from "@/context/server"

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const formatSessionAge = (createdAt: number | null | undefined, now: number) => {
  if (!createdAt || !Number.isFinite(createdAt)) return ""
  const mins = Math.floor((now - createdAt) / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const ChevronIcon = (props: { isOpen: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    class={`size-3 transition-transform duration-200 shrink-0 ${props.isOpen ? "rotate-90 text-foreground/80" : "text-muted-foreground/40"}`}
    fill="none"
    stroke="currentColor"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

function FolderSection(props: {
  project: Project
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (projectId: string, sessionId: string) => void
  onCreateSession: (projectId: string) => void
  onDeleteSession: (projectId: string, sessionId: string) => void
  onDeleteProject: (projectId: string) => void
  onSyncOpenCodeSessions: (projectId: string, sessions: OpenCodeSession[]) => void
  onOpenWorkspacePage?: () => void
  onRenameSession: (projectId: string, sessionId: string, newName: string) => void
}) {
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const notification = useNotification()
  const permission = usePermission()

  const [isOpen, setIsOpen] = createSignal(true)
  const [showMenu, setShowMenu] = createSignal(false)
  let menuRef: HTMLDivElement | undefined
  const projectStore = createMemo(() => globalSync.child(props.project.path)[0])

  // Periodic sortNow signal to dynamically recalculate session ages and keep sorting stable/reactive.
  const [sortNow, setSortNow] = createSignal(Date.now())
  let sortNowInterval: number | undefined
  const sortNowTimeout = setTimeout(
    () => {
      setSortNow(Date.now())
      sortNowInterval = window.setInterval(() => setSortNow(Date.now()), 60_000)
    },
    60_000 - (Date.now() % 60_000),
  )

  onCleanup(() => {
    clearTimeout(sortNowTimeout)
    if (sortNowInterval) clearInterval(sortNowInterval)
  })

  // Search filter and Inline editing signals
  const [searchQuery, setSearchQuery] = createSignal("")
  const [editingSessionId, setEditingSessionId] = createSignal<string | null>(null)
  const [editSessionValue, setEditSessionValue] = createSignal("")

  const sortedSessions = createMemo(() => {
    const now = sortNow()
    const oneMinuteAgo = now - 60000
    const query = searchQuery().toLowerCase().trim()
    let filtered = [...props.project.sessions]
    if (query) {
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(query))
    }
    return filtered.sort((left, right) => {
      const leftUpdated = left.lastActiveAt ?? left.createdAt ?? 0
      const rightUpdated = right.lastActiveAt ?? right.createdAt ?? 0
      const leftRecent = leftUpdated > oneMinuteAgo
      const rightRecent = rightUpdated > oneMinuteAgo
      if (leftRecent && rightRecent) return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      if (leftRecent && !rightRecent) return -1
      if (!leftRecent && rightRecent) return 1
      return rightUpdated - leftUpdated
    })
  })

  const sessionsByParent = createMemo(() => {
    const map = new Map<string, Project["sessions"]>()
    const ROOT = "__root__"
    const ids = new Set(sortedSessions().map((session) => session.id))
    for (const session of sortedSessions()) {
      const parent = session.parentSessionId && ids.has(session.parentSessionId) ? session.parentSessionId : ROOT
      const list = map.get(parent) ?? []
      list.push(session)
      map.set(parent, list)
    }
    return { map, ROOT }
  })

  const isSessionWorking = (sessionId: string) => {
    const status = (projectStore().session_status as Record<string, { type?: string } | undefined>)[sessionId]
    return status?.type && status.type !== "idle"
  }

  const sessionHasPermissions = (sessionId: string) => {
    return !!sessionPermissionRequest(
      projectStore().session,
      projectStore().permission,
      sessionId,
      (item) => !permission.autoResponds(item, props.project.path)
    )
  }

  const sessionUnseenCount = (sessionId: string) => {
    return notification.session.unseenCount(sessionId)
  }

  const sessionHasError = (sessionId: string) => {
    return notification.session.unseenHasError(sessionId)
  }

  const handleRenameSession = async (sessionId: string, newName: string) => {
    const trimmed = newName.trim()
    if (trimmed) {
      props.onRenameSession(props.project.id, sessionId, trimmed)
      if (sessionId.startsWith("ses")) {
        await globalSDK
          .createClient({ directory: props.project.path, throwOnError: true })
          .session.update({ sessionID: sessionId, title: trimmed })
          .catch(() => undefined)
        void globalSync.project.loadSessions(props.project.path)
      }
    }
    setEditingSessionId(null)
  }

  const sessionTree = (sessionId: string) => sessionsByParent().map.get(sessionId) ?? []

  const renderSessionNode = (session: Project["sessions"][number], level = 0) => (
    <>
      <div
        class={`group/session relative flex cursor-pointer items-center justify-between rounded-md py-[5.5px] pr-3 transition-all duration-150 ${
          props.activeSessionId === session.id
            ? "bg-secondary/70 text-foreground font-semibold shadow-xs"
            : "hover:bg-sidebar-accent/50 text-foreground/80 hover:text-foreground"
        }`}
        style={{ "padding-left": `${12 + level * 14}px` }}
        onClick={() => props.onSelectSession(props.project.id, session.id)}
      >
        <Show when={props.activeSessionId === session.id}>
          <div class="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-md bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-in slide-in-from-left duration-200" />
        </Show>
        <div class="min-w-0 flex flex-1 items-center gap-1.5">
          <div class="flex size-4 items-center justify-center">
            <div class="relative flex size-4 items-center justify-center">
              <Switch fallback={<span class="inline-block w-[1ch]" aria-hidden="true" />}>
                <Match when={isSessionWorking(session.id)}>
                  <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono" />
                </Match>
                <Match when={sessionHasPermissions(session.id)}>
                  <div class="size-1.5 rounded-full bg-surface-warning-strong animate-pulse" title="Permission pending" />
                </Match>
                <Match when={sessionHasError(session.id)}>
                  <div class="size-1.5 rounded-full bg-text-diff-delete-base" title="Error" />
                </Match>
                <Match when={sessionUnseenCount(session.id) > 0}>
                  <div class="size-1.5 rounded-full bg-text-interactive-base" title="Unread messages" />
                </Match>
              </Switch>
            </div>
          </div>
          <Show
            when={editingSessionId() === session.id}
            fallback={
              <span
                class={`truncate text-[13px] ${
                  props.activeSessionId === session.id ? "font-medium text-foreground" : "text-foreground/90"
                }`}
                onDblClick={(e) => {
                  e.stopPropagation()
                  setEditingSessionId(session.id)
                  setEditSessionValue(session.name)
                }}
                title="Double click to rename"
              >
                {session.name}
              </span>
            }
          >
            <input
              type="text"
              class="min-w-0 flex-1 rounded border border-sidebar-border bg-sidebar-accent/50 px-1 py-0 text-[13px] text-foreground focus:border-sidebar-border/80 focus:bg-sidebar-accent focus:outline-none"
              value={editSessionValue()}
              onInput={(e) => setEditSessionValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation()
                  void handleRenameSession(session.id, editSessionValue())
                } else if (e.key === "Escape") {
                  e.stopPropagation()
                  setEditingSessionId(null)
                }
              }}
              onBlur={() => {
                void handleRenameSession(session.id, editSessionValue())
              }}
              onClick={(e) => e.stopPropagation()}
              ref={(el) => setTimeout(() => el?.focus(), 50)}
            />
          </Show>
        </div>

        <div class="relative ml-3 flex h-5 w-6 shrink-0 items-center justify-end">
          <button
            type="button"
            class="absolute right-0 z-10 rounded p-0.5 text-muted-foreground opacity-0 transition-all duration-150 hover:bg-accent hover:text-foreground group-hover/session:opacity-100"
            title="Archive session"
            onClick={(e) => {
              e.stopPropagation()
              props.onDeleteSession(props.project.id, session.id)
            }}
          >
            <SessionDeleteIcon />
          </button>
          <span class="pointer-events-none text-[12px] font-medium text-muted-foreground transition-opacity duration-150 group-hover/session:opacity-0">
            {formatSessionAge(session.lastActiveAt ?? session.createdAt, sortNow())}
          </span>
        </div>
      </div>
      <For each={sessionTree(session.id)}>
        {(child) => renderSessionNode(child, level + 1)}
      </For>
    </>
  )

  createEffect(() => {
    void globalSync.project.loadSessions(props.project.path)
  })

  createEffect(() => {
    const store = projectStore()
    if (store.status === "loading" && store.session.length === 0) return
    props.onSyncOpenCodeSessions(props.project.id, store.session)
  })

  const handleMenuClick = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      setShowMenu(false)
    }
  }

  createEffect(() => {
    if (!showMenu()) return
    document.addEventListener("mousedown", handleMenuClick)
    onCleanup(() => document.removeEventListener("mousedown", handleMenuClick))
  })

  return (
    <div class="flex flex-col">
      <div
        class="group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60"
        onClick={() => {
          props.onOpenWorkspacePage?.()
          props.onSelectProject(props.project.id)
          setIsOpen(!isOpen())
        }}
      >
        <div class="flex items-center gap-2 text-muted-foreground select-none">
          <ChevronIcon isOpen={isOpen()} />
          <span class="text-amber-500/80 transition-colors group-hover:text-amber-500">
            <ProjectFolderIcon />
          </span>
          <span class="text-[13px] leading-none font-semibold text-foreground/80 group-hover:text-foreground transition-colors">{props.project.name}</span>
        </div>

        <div class="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div class="relative flex items-center" ref={menuRef}>
            <button
              class="rounded p-1 text-sidebar-foreground transition-colors hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu())
              }}
            >
              <MoreHorizontal size={14} />
            </button>

            <Show when={showMenu()}>
              <div class="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded border border-border bg-card py-1 text-[12px] text-sidebar-foreground shadow-xl">
                <button
                  class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-destructive transition-colors hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    props.onDeleteProject(props.project.id)
                  }}
                >
                  <Trash2 size={13} />
                  Close Project
                </button>
              </div>
            </Show>
          </div>
          <div class="relative flex items-center">
            <button
              class="peer rounded p-1 text-sidebar-foreground transition-colors hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation()
                void props.onCreateSession(props.project.id)
              }}
            >
              <SquarePen size={14} />
            </button>

            <div class="pointer-events-none absolute top-full right-0 z-50 mt-1.5 whitespace-nowrap rounded border border-border bg-card px-3 py-1.5 text-[12px] text-sidebar-foreground opacity-0 shadow-xl transition-opacity peer-hover:opacity-100">
              Start new chat in {props.project.name}
            </div>
          </div>
        </div>
      </div>

      <Show when={isOpen()}>
        <div class="mt-1 flex flex-col gap-0.5 overflow-hidden transition-all duration-150 ease-out pl-4 pr-1">
          <Show
            when={(sessionsByParent().map.get(sessionsByParent().ROOT) ?? []).length > 0}
            fallback={
              <div class="py-2.5 pr-4 pl-3.5 text-[12px] text-muted-foreground/45 italic font-light select-none">
                No active chats
              </div>
            }
          >
            <For each={sessionsByParent().map.get(sessionsByParent().ROOT) ?? []}>
              {(session) => renderSessionNode(session, 0)}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function Sidebar(props: {
  onOpenSettingsPage?: () => void
  onOpenWorkspacePage?: () => void
}) {
  const server = useServer()
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const addProject = useStore((s) => s.addProject)
  const removeSession = useStore((s) => s.removeSession)
  const syncOpenCodeSessions = useStore((s) => s.syncOpenCodeSessions)
  const deleteProject = useStore((s) => s.deleteProject)
  const renameSession = useStore((s) => s.renameSession)
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [isSidebarVisible, setIsSidebarVisible] = createSignal(true)
  const [sidebarWidth, setSidebarWidth] = createSignal(320)
  const [pendingDeleteSessionIDs, setPendingDeleteSessionIDs] = createSignal<Set<string>>(new Set())

  createEffect(() => {
    window.dispatchEvent(
      new CustomEvent("gg-sidebar-state", {
        detail: { isSidebarVisible: isSidebarVisible() },
      }),
    )
  })

  onMount(() => {
    const handleSidebarToggleRequest = () => {
      setIsSidebarVisible((current) => !current)
    }

    window.addEventListener("gg-toggle-sidebar", handleSidebarToggleRequest)
    onCleanup(() => window.removeEventListener("gg-toggle-sidebar", handleSidebarToggleRequest))
  })

  createEffect(() => {
    if (!currentProjectId() && projects().length > 0) {
      setCurrentProject(projects()[0].id)
    }
  })

  const handleAddProject = async () => {
    props.onOpenWorkspacePage?.()
    const selected = await nativeApi.open({
      directory: true,
      multiple: false,
      title: "Select Project Folder",
    })
    if (typeof selected !== "string" || !selected) return
    const existing = projects().find((project) => project.path === selected)
    if (existing) {
      setCurrentProject(existing.id)
      return
    }
    const created = await addProject(folderNameFromPath(selected), selected)
    setCurrentProject(created.id)
  }

  const handleCreateSession = async (projectId: string) => {
    props.onOpenWorkspacePage?.()
    const project = projects().find((item) => item.id === projectId)
    if (!project) return
    const client = globalSDK.createClient({ directory: project.path, throwOnError: true })
    const created = await client.session.create().then((response) => response.data)
    if (!created) return
    const [projectStore] = globalSync.child(project.path)
    await syncOpenCodeSessions(projectId, [created, ...projectStore.session])
    setCurrentProject(projectId)
    setActiveSession(created.id)
    void globalSync.project.loadSessions(project.path)
  }

  const handleDeleteSession = async (projectId: string, sessionId: string) => {
    setPendingDeleteSessionIDs((prev) => {
      const next = new Set(prev)
      next.add(sessionId)
      return next
    })

    try {
      // Optimistic local removal for immediate UI feedback.
      await removeSession(projectId, sessionId)

      const project = projects().find((item) => item.id === projectId)
      if (project && sessionId.startsWith("ses")) {
        await globalSDK
          .createClient({ directory: project.path, throwOnError: true })
          .session.delete({ sessionID: sessionId })
          .catch(() => undefined)
        // Wait for refreshed remote sessions before clearing pending-delete
        // so this item cannot flicker back during sync.
        await globalSync.project.loadSessions(project.path)
      }
    } finally {
      setPendingDeleteSessionIDs((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
  }

  const handleSyncOpenCodeSessions = (projectId: string, sessions: OpenCodeSession[]) => {
    const pending = pendingDeleteSessionIDs()
    const filtered = pending.size > 0 ? sessions.filter((session) => !pending.has(session.id)) : sessions
    void syncOpenCodeSessions(projectId, filtered)
  }

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId)
  }

  const handleSelectSession = (projectId: string, sessionId: string) => {
    props.onOpenWorkspacePage?.()
    setCurrentProject(projectId)
    setActiveSession(sessionId)
  }

  return (
    <aside
      class={`relative h-full shrink-0 ${
        isSidebarVisible() ? "border-r border-sidebar-border" : "w-0 border-r-0"
      }`}
      style={isSidebarVisible() ? { width: `${sidebarWidth()}px` } : undefined}
    >
      <Show when={isSidebarVisible()}>
        <ResizeHandle
          edge="end"
          onResize={(clientX) => setSidebarWidth(Math.max(220, Math.min(520, clientX)))}
        />
        <div class="relative flex h-full max-h-full flex-col bg-sidebar select-none">
          <div class="sticky top-0 z-10 flex flex-col border-b border-sidebar-border/70 bg-sidebar select-none">
            <div class="flex items-center justify-between px-4 pt-3.5 pb-2.5">
              <div class="flex items-center gap-2 select-none">
                <span class="relative flex h-1.5 w-1.5">
                  <Show when={server.healthy() !== false}>
                    <span 
                      class={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        server.healthy() === true ? "bg-green-400" : "bg-amber-400"
                      }`} 
                    />
                  </Show>
                  <span 
                    class={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                      server.healthy() === true
                        ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"
                        : server.healthy() === false
                        ? "bg-red-500"
                        : "bg-amber-500"
                    }`} 
                  />
                </span>
                <span class="text-[12px] font-bold tracking-wide text-muted-foreground uppercase">Projects</span>
              </div>
              <button
                class="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-sidebar-foreground"
                title="New Project"
                onClick={() => void handleAddProject()}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div class="custom-scrollbar flex-1 overflow-y-auto py-2">
            <div class="flex flex-col gap-0.5 pb-3">
              <For each={projects()}>
                {(project) => (
                  <FolderSection
                    project={project}
                    activeSessionId={activeSessionId()}
                    onSelectProject={setCurrentProject}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    onDeleteSession={handleDeleteSession}
                    onDeleteProject={handleDeleteProject}
                    onSyncOpenCodeSessions={handleSyncOpenCodeSessions}
                    onOpenWorkspacePage={props.onOpenWorkspacePage}
                    onRenameSession={renameSession}
                  />
                )}
              </For>
            </div>
          </div>

          <div class="border-t border-sidebar-border p-2">
            <button
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] text-foreground transition-colors hover:bg-sidebar-accent/80"
              title="Settings"
              onClick={() => {
                props.onOpenSettingsPage?.()
              }}
            >
              <Settings size={15} />
              <span class="text-[13px] leading-none">Settings</span>
            </button>
          </div>
        </div>
      </Show>
    </aside>
  )
}

  const SessionDeleteIcon = () => (
    <svg viewBox="0 0 20 20" class="size-[14px]" aria-hidden="true" fill="currentColor">
      <path d="M16.8747 6.24935H17.3747V5.74935H16.8747V6.24935ZM16.8747 16.8743V17.3743H17.3747V16.8743H16.8747ZM3.12467 16.8743H2.62467V17.3743H3.12467V16.8743ZM3.12467 6.24935V5.74935H2.62467V6.24935H3.12467ZM2.08301 2.91602V2.41602H1.58301V2.91602H2.08301ZM17.9163 2.91602H18.4163V2.41602H17.9163V2.91602ZM17.9163 6.24935V6.74935H18.4163V6.24935H17.9163ZM2.08301 6.24935H1.58301V6.74935H2.08301V6.24935ZM8.33301 9.08268H7.83301V10.0827H8.33301V9.58268V9.08268ZM11.6663 10.0827H12.1663V9.08268H11.6663V9.58268V10.0827ZM16.8747 6.24935H16.3747V16.8743H16.8747H17.3747V6.24935H16.8747ZM16.8747 16.8743V16.3743H3.12467V16.8743V17.3743H16.8747V16.8743ZM3.12467 16.8743H3.62467V6.24935H3.12467H2.62467V16.8743H3.12467ZM3.12467 6.24935V6.74935H16.8747V6.24935V5.74935H3.12467V6.24935ZM2.08301 2.91602V3.41602H17.9163V2.91602V2.41602H2.08301V2.91602ZM17.9163 2.91602H17.4163V6.24935H17.9163H18.4163V2.91602H17.9163ZM17.9163 6.24935V5.74935H2.08301V6.24935V6.74935H17.9163V6.24935ZM2.08301 6.24935H2.58301V2.91602H2.08301H1.58301V6.24935H2.08301ZM8.33301 9.58268V10.0827H11.6663V9.58268V9.08268H8.33301V9.58268Z" />
    </svg>
  )
  const ProjectFolderIcon = () => (
    <svg viewBox="0 0 24 24" class="size-[14px]" aria-hidden="true" fill="none">
      <path
        d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )

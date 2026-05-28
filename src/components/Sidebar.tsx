import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { MoreHorizontal, Plus, Settings, SquarePen, Trash2 } from "lucide-solid"
import { nativeApi } from "../services/native"
import { useStore } from "../store"
import type { Project } from "../types"
import { ResizeHandle } from "@/opencode-ported/resize-handle"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import type { Session as OpenCodeSession } from "@opencode-ai/sdk/v2/client"
import { DotsSpinner } from "./DotsSpinner"

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const formatSessionAge = (createdAt?: number | null) => {
  if (!createdAt || !Number.isFinite(createdAt)) return ""
  const mins = Math.floor((Date.now() - createdAt) / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

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
}) {
  const globalSync = useGlobalSync()
  const [isOpen, setIsOpen] = createSignal(true)
  const [showMenu, setShowMenu] = createSignal(false)
  let menuRef: HTMLDivElement | undefined
  const projectStore = createMemo(() => globalSync.child(props.project.path)[0])
  const sortedSessions = createMemo(() =>
    [...props.project.sessions].sort((left, right) => (right.lastActiveAt ?? right.createdAt ?? 0) - (left.lastActiveAt ?? left.createdAt ?? 0)),
  )
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

  const sessionTree = (sessionId: string) => sessionsByParent().map.get(sessionId) ?? []

  const renderSessionNode = (session: Project["sessions"][number], level = 0) => (
    <>
      <div
        class={`group/session flex cursor-pointer items-center justify-between rounded-md py-[5px] pr-3 transition-colors ${
          props.activeSessionId === session.id
            ? "bg-sidebar-accent text-foreground"
            : "hover:bg-sidebar-accent/60"
        }`}
        style={{ "padding-left": `${8 + level * 14}px` }}
        onClick={() => props.onSelectSession(props.project.id, session.id)}
      >
        <div class="min-w-0 flex flex-1 items-center gap-1.5">
          <div class="flex size-4 items-center justify-center">
            <div class="relative flex size-4 items-center justify-center">
              <Show
                when={isSessionWorking(session.id)}
                fallback={<span class="inline-block w-[1ch]" aria-hidden="true" />}
              >
                <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono" />
              </Show>
            </div>
          </div>
          <span
            class={`truncate text-[13px] ${
              props.activeSessionId === session.id ? "font-medium text-foreground" : "text-foreground/90"
            }`}
          >
            {session.name}
          </span>
        </div>

        <div class="relative ml-3 flex h-5 w-6 shrink-0 items-center justify-end">
          <button
            type="button"
            class="absolute right-0 z-10 rounded p-0.5 text-muted-foreground opacity-0 transition-all duration-150 hover:bg-accent hover:text-destructive group-hover/session:opacity-100"
            title="Delete session"
            onClick={(e) => {
              e.stopPropagation()
              props.onDeleteSession(props.project.id, session.id)
            }}
          >
            <SessionDeleteIcon />
          </button>
          <span class="pointer-events-none text-[12px] font-medium text-muted-foreground transition-opacity duration-150 group-hover/session:opacity-0">
            {formatSessionAge(session.lastActiveAt ?? session.createdAt)}
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
        <div class="flex items-center gap-2 text-muted-foreground">
          <ProjectFolderIcon />
          <span class="text-[13px] leading-none font-medium">{props.project.name}</span>
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
        <div class="mt-1 flex flex-col gap-0.5 overflow-hidden transition-all duration-150 ease-out">
          <Show
            when={(sessionsByParent().map.get(sessionsByParent().ROOT) ?? []).length > 0}
            fallback={<div class="py-[5px] pr-4 pl-[16px] text-[13px] text-muted-foreground">No sessions</div>}
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
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const addProject = useStore((s) => s.addProject)
  const removeSession = useStore((s) => s.removeSession)
  const syncOpenCodeSessions = useStore((s) => s.syncOpenCodeSessions)
  const deleteProject = useStore((s) => s.deleteProject)
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
            <div class="flex items-center justify-between px-4 pt-4 pb-2.5">
              <span class="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">Projects</span>
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
    <svg viewBox="0 0 24 24" class="size-[18px]" aria-hidden="true" fill="currentColor">
      <path d="M21,5.25H17.441A1.251,1.251,0,0,1,16.255,4.4l-.316-.95a1.746,1.746,0,0,0-1.66-1.2H9.721a1.745,1.745,0,0,0-1.66,1.2l-.316.948a1.251,1.251,0,0,1-1.186.855H3a.75.75,0,0,0,0,1.5H4.3l.767,11.5a3.76,3.76,0,0,0,3.742,3.5h6.386a3.76,3.76,0,0,0,3.742-3.5L19.7,6.75H21a.75.75,0,0,0,0-1.5ZM9.483,3.921a.252.252,0,0,1,.238-.171h4.558a.252.252,0,0,1,.238.17l.316.95a2.777,2.777,0,0,0,.161.38H9.006a2.737,2.737,0,0,0,.161-.381ZM17.438,18.15a2.255,2.255,0,0,1-2.245,2.1H8.807a2.255,2.255,0,0,1-2.245-2.1L5.8,6.75h.757a2.783,2.783,0,0,0,.317-.025A.736.736,0,0,0,7,6.75H17a.736.736,0,0,0,.124-.025,2.783,2.783,0,0,0,.317.025H18.2ZM14.75,11v5a.75.75,0,0,1-1.5,0V11a.75.75,0,0,1,1.5,0Zm-4,0v5a.75.75,0,0,1-1.5,0V11a.75.75,0,0,1,1.5,0Z" />
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

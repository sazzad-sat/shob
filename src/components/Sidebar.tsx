import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Folder, MoreHorizontal, Plus, Settings, SquarePen, Trash2 } from "lucide-solid"
import { nativeApi } from "../services/native"
import { useStore } from "../store"
import type { Project } from "../types"
import { ResizeHandle } from "@/opencode-ported/resize-handle"

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
  onOpenWorkspacePage?: () => void
}) {
  const [isOpen, setIsOpen] = createSignal(true)
  const [showMenu, setShowMenu] = createSignal(false)
  let menuRef: HTMLDivElement | undefined

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
        class="group mx-2 flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 hover:bg-sidebar-accent"
        onClick={() => {
          props.onOpenWorkspacePage?.()
          props.onSelectProject(props.project.id)
          setIsOpen(!isOpen())
        }}
      >
        <div class="flex items-center gap-2.5 text-sidebar-foreground">
          <Folder size={15} class="stroke-[1.5]" />
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
        <div class="mt-0.5 flex flex-col">
          <Show
            when={props.project.sessions.length > 0}
            fallback={<div class="py-[5px] pr-4 pl-[38px] text-[13px] text-muted-foreground">No sessions</div>}
          >
            <For each={props.project.sessions}>
              {(session) => (
                <div
                  class={`group flex cursor-pointer items-center justify-between py-[5px] pr-4 pl-[38px] hover:bg-sidebar-accent ${
                    props.activeSessionId === session.id ? "bg-sidebar-accent" : ""
                  }`}
                  onClick={() => props.onSelectSession(props.project.id, session.id)}
                >
                  <span class={`truncate text-[13px] ${props.activeSessionId === session.id ? "text-sidebar-foreground" : "text-muted-foreground"}`}>
                    {session.name}
                  </span>

                  <div class="ml-3 flex shrink-0 items-center gap-1">
                    <button
                      class="hidden rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive group-hover:block"
                      title="Delete session"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDeleteSession(props.project.id, session.id)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                    <span class="rounded bg-muted px-1.5 py-[1px] text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent">
                      {formatSessionAge(session.lastActiveAt ?? session.createdAt)}
                    </span>
                  </div>
                </div>
              )}
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
  const launchCliSession = useStore((s) => s.launchCliSession)
  const removeSession = useStore((s) => s.removeSession)
  const deleteProject = useStore((s) => s.deleteProject)
  const [isSidebarVisible, setIsSidebarVisible] = createSignal(true)
  const [sidebarWidth, setSidebarWidth] = createSignal(320)

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
    setCurrentProject(projectId)
    await launchCliSession(projectId)
  }

  const handleDeleteSession = async (projectId: string, sessionId: string) => {
    await removeSession(projectId, sessionId)
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
      </Show>
      <div class="relative flex h-full max-h-full flex-col bg-sidebar select-none">
      <div class="sticky top-0 z-10 flex items-center justify-between bg-sidebar px-3 pt-4 pb-2">
        <div class="px-2 text-[13px] font-medium text-muted-foreground">Projects</div>
        <div class="flex items-center gap-0.5 text-muted-foreground">
          <button
            class="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-sidebar-foreground"
            title="New Project"
            onClick={() => void handleAddProject()}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div class="custom-scrollbar flex-1 overflow-y-auto">
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
                onOpenWorkspacePage={props.onOpenWorkspacePage}
              />
            )}
          </For>
        </div>
      </div>

      <div class="border-t border-sidebar-border p-2">
        <button
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] text-foreground transition-colors hover:bg-sidebar-accent"
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
    </aside>
  )
}


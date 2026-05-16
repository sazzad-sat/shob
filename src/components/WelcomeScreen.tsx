import { FolderOpen, PanelLeftOpen, Plus, SquareTerminal } from "lucide-solid"
import { createMemo } from "solid-js"
import type { Project } from "../types"

interface WelcomeScreenProps {
  projects: Project[]
  currentProject: Project | null
  onOpenFolder: () => Promise<void> | void
  onCreateSession: () => Promise<void> | void
  onSelectProject: (projectId: string) => void
  onToggleFileTree: () => void
}

const formatProjectActivity = (project: Project) => {
  const latestActivity = Math.max(
    ...project.sessions.map((session) => session.lastActiveAt ?? session.createdAt ?? 0),
    0,
  )

  if (latestActivity <= 0) return "New"

  const diffMinutes = Math.floor(Math.max(0, Date.now() - latestActivity) / 60000)
  if (diffMinutes < 1) return "Now"
  if (diffMinutes < 60) return `${diffMinutes}m`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

const projectLabel = (project: Project) => project.name.trim() || "Untitled"

export function WelcomeScreen({
  projects,
  currentProject,
  onOpenFolder,
  onCreateSession,
  onSelectProject,
  onToggleFileTree,
}: WelcomeScreenProps) {
  const recentProjects = createMemo(() => {
    return [...projects].sort((left, right) => {
      const leftActivity = Math.max(...left.sessions.map((session) => session.lastActiveAt ?? session.createdAt ?? 0), 0)
      const rightActivity = Math.max(...right.sessions.map((session) => session.lastActiveAt ?? session.createdAt ?? 0), 0)
      return rightActivity - leftActivity
    })
  })

  return (
    <div class="h-full overflow-y-auto bg-background text-foreground">
      <div class="mx-auto flex min-h-full w-full max-w-5xl items-start px-8 py-14 sm:px-12 lg:px-16">
        <div class="grid w-full gap-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <section class="space-y-10">
            <div class="space-y-2">
              <h1 class="text-3xl font-light uppercase tracking-[0.18em] text-foreground sm:text-4xl">Terminal Workspace</h1>
            </div>

            <div class="space-y-4">
              <h2 class="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Start</h2>
              <div class="space-y-2">
                <button
                  type="button"
                  onClick={() => void onOpenFolder()}
                  class="flex items-center gap-3 text-left text-[16px] font-light text-foreground/90 transition hover:text-foreground"
                >
                  <FolderOpen class="h-4 w-4 shrink-0" stroke-width={1.7} />
                  <span>Open Folder...</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onCreateSession()}
                  disabled={!currentProject}
                  class="flex items-center gap-3 text-left text-[16px] font-light text-foreground/90 transition hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  <Plus class="h-4 w-4 shrink-0" stroke-width={1.7} />
                  <span>New Session...</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFileTree}
                  disabled={!currentProject}
                  class="flex items-center gap-3 text-left text-[16px] font-light text-foreground/90 transition hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  <PanelLeftOpen class="h-4 w-4 shrink-0" stroke-width={1.7} />
                  <span>Open Explorer...</span>
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-center gap-3">
              <SquareTerminal class="h-4 w-4 text-muted-foreground" stroke-width={1.7} />
              <h2 class="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Recent</h2>
            </div>
            {recentProjects().length === 0 ? (
              <p class="text-sm text-muted-foreground">No recent folders yet. Open a project folder to get started.</p>
            ) : (
              <div class="space-y-1">
                {recentProjects().map((project) => {
                  const isCurrent = project.id === currentProject?.id

                  return (
                    <button
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      class={`grid w-full grid-cols-[auto_minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-2.5 text-left transition ${
                        isCurrent ? "text-foreground" : "text-foreground/80 hover:bg-white/[0.03] hover:text-foreground"
                      }`}
                    >
                      <span class={`h-2 w-2 rounded-full ${isCurrent ? "bg-foreground" : "bg-transparent"}`} />
                      <span class="truncate text-[15px] font-normal tracking-[0.01em]">{projectLabel(project)}</span>
                      <span class={`truncate font-mono text-[12px] ${isCurrent ? "text-zinc-400" : "text-muted-foreground"}`}>
                        {project.path}
                      </span>
                      <span class={`shrink-0 text-[11px] uppercase tracking-[0.18em] ${isCurrent ? "text-foreground/80" : "text-muted-foreground"}`}>
                        {formatProjectActivity(project)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}


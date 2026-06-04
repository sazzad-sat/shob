import { Clock, FolderOpen, PanelLeftOpen, Plus } from "lucide-solid"
import { createMemo } from "solid-js"
import shobIcon from "../assets/icon/shob.png"
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
      <div class="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
        <main class="grid w-full items-center gap-10 text-center lg:grid-cols-[minmax(0,1fr)_minmax(190px,260px)_minmax(0,1fr)] lg:gap-12 lg:text-left">
          <section class="mx-auto flex w-full max-w-[300px] flex-col items-center gap-5 lg:mx-0 lg:items-start lg:justify-self-end">
            <div class="space-y-3">
              <h1 class="text-[38px] font-light uppercase leading-none tracking-[0.24em] text-foreground sm:text-[46px]">
                Shob
              </h1>
              <p class="max-w-[270px] text-[13px] leading-5 text-muted-foreground">
                Keep projects, sessions, and context ready for focused AI work.
              </p>
            </div>

            <div class="flex w-full max-w-[260px] flex-col gap-2" aria-label="Start">
              <button
                type="button"
                onClick={() => void onOpenFolder()}
                class="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-[8px] border border-border/70 bg-white/[0.04] px-4 text-[14px] font-medium text-foreground transition hover:border-border hover:bg-white/[0.07]"
              >
                <FolderOpen class="h-4 w-4 shrink-0" stroke-width={1.8} />
                <span class="truncate">Open project</span>
              </button>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void onCreateSession()}
                  disabled={!currentProject}
                  class="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[8px] border border-border/55 bg-transparent px-2.5 text-[13px] font-medium text-foreground/85 transition hover:border-border hover:bg-white/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:border-border/30 disabled:text-muted-foreground/55 disabled:hover:bg-transparent"
                >
                  <Plus class="h-3.5 w-3.5 shrink-0" stroke-width={1.8} />
                  <span class="truncate">Session</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFileTree}
                  disabled={!currentProject}
                  class="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[8px] border border-border/55 bg-transparent px-2.5 text-[13px] font-medium text-foreground/85 transition hover:border-border hover:bg-white/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:border-border/30 disabled:text-muted-foreground/55 disabled:hover:bg-transparent"
                >
                  <PanelLeftOpen class="h-3.5 w-3.5 shrink-0" stroke-width={1.8} />
                  <span class="truncate">Explorer</span>
                </button>
              </div>
            </div>
          </section>

          <figure class="mx-auto flex w-[min(58vw,260px)] flex-col items-center justify-center lg:justify-self-center">
            <img src={shobIcon} alt="" class="w-[62%] rounded-[7px]" />
          </figure>

          <section class="mx-auto w-full max-w-[330px] lg:mx-0 lg:justify-self-start">
            <div class="mb-4 space-y-2">
              <div class="flex items-center justify-center gap-2 lg:justify-start">
                <Clock class="h-3.5 w-3.5 text-muted-foreground" stroke-width={1.8} />
                <h2 class="text-[12px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Recent</h2>
              </div>
              <p class="text-[13px] leading-5 text-muted-foreground">
                Return to the projects you were working on.
              </p>
            </div>
            {recentProjects().length === 0 ? (
              <p class="text-sm text-muted-foreground">No projects yet. Open one to get started.</p>
            ) : (
              <div class="flex flex-col gap-1">
                {recentProjects().map((project) => {
                  const isCurrent = project.id === currentProject?.id

                  return (
                    <button
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      class={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-[8px] px-3 py-2.5 text-left transition ${
                        isCurrent ? "bg-white/[0.05] text-foreground" : "text-foreground/80 hover:bg-white/[0.03] hover:text-foreground"
                      }`}
                    >
                      <span class="truncate text-[15px] font-normal tracking-[0.01em]">{projectLabel(project)}</span>
                      <span class={`row-span-2 shrink-0 self-center text-[11px] uppercase tracking-[0.18em] ${isCurrent ? "text-foreground/80" : "text-muted-foreground"}`}>
                        {formatProjectActivity(project)}
                      </span>
                      <span class={`truncate font-mono text-[12px] ${isCurrent ? "text-zinc-400" : "text-muted-foreground"}`}>
                        {project.path}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}


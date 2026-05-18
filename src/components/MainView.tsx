import { createEffect, createMemo, createSignal, lazy, on, Show, Suspense } from 'solid-js'
import { nativeApi } from '../services/native'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { TerminalPanel } from './TerminalPanel'
import { WelcomeScreen } from './WelcomeScreen'
import { SettingsPage } from './SettingsPage'
import { useStore } from '../store'
import { createFileContext } from '@/context/file'
import type { FileNode } from '@/types/file-node'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OpencodeSessionPanel } from '@/opencode-ported/session-panel'
import { ResizeHandle } from '@/opencode-ported/resize-handle'

const FileTree = lazy(async () => {
  const mod = await import('@/opencode-ported/file-tree')
  return { default: mod.default }
})

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const toPosix = (value: string) => value.replace(/\\/g, "/").replace(/\/+/g, "/")

const toRelativeProjectPath = (absolutePath: string, projectRoot: string) => {
  const abs = toPosix(absolutePath)
  const root = toPosix(projectRoot).replace(/\/+$/, "")
  if (!root) return abs

  const absLower = abs.toLowerCase()
  const rootLower = root.toLowerCase()
  if (absLower === rootLower) return ""
  if (absLower.startsWith(`${rootLower}/`)) return abs.slice(root.length + 1)
  return abs
}

type DiffKind = "add" | "del" | "mix"
type DiffStats = { additions: number; deletions: number }

type GitStatusSummary = {
  changedFiles: Array<{
    path: string
    absolutePath: string
    status: string
    additions: number
    deletions: number
  }>
}

export function MainView() {
  const appStore = useStore()
  const projects = useStore((s) => s.projects)
  const currentProject = useStore((s) =>
    s.projects.find((project) => project.id === s.currentProjectId) ?? null,
  )
  const currentProjectId = useStore((s) => s.currentProjectId)
  const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null)
  const [reviewFiles, setReviewFiles] = createSignal<string[]>([])
  const [isReviewVisible, setIsReviewVisible] = createSignal(false)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [activePage, setActivePage] = createSignal<'workspace' | 'settings'>('workspace')
  const [fileTreeTab, setFileTreeTab] = createSignal<"changes" | "all">("all")
  const [reviewWidth, setReviewWidth] = createSignal(560)
  const [fileTreeWidth, setFileTreeWidth] = createSignal(332)
  const [gitChangedFiles, setGitChangedFiles] = createSignal<string[]>([])
  const [gitKinds, setGitKinds] = createSignal<ReadonlyMap<string, DiffKind>>(new Map())
  const [gitStats, setGitStats] = createSignal<ReadonlyMap<string, DiffStats>>(new Map())
  const [gitDiffLoading, setGitDiffLoading] = createSignal(false)
  const [gitDiffError, setGitDiffError] = createSignal<string | null>(null)
  const [gitUnavailable, setGitUnavailable] = createSignal(false)
  const projectSessions = createMemo(() => currentProject()?.sessions ?? [])
  let workspaceSplitRef: HTMLDivElement | undefined

  const projectPath = createMemo(() => currentProject()?.path ?? '')

  const fileCtx = createFileContext({
    projectPath,
    listDirectory: async (path: string) => {
      const root = projectPath()
      const absolute = path ? toPosix(`${root}/${path}`) : root
      const entries = await nativeApi.invoke("list_directory", { path: absolute }) as Array<{ name: string; path: string; isDirectory: boolean }>
      return entries.map((e) => ({
        name: e.name,
        path: toRelativeProjectPath(e.path, root),
        absolute: e.path,
        type: e.isDirectory ? "directory" : "file",
        ignored: false,
      })) as FileNode[]
    },
    onError: (msg) => console.error("[FileTree]", msg),
  })

  createEffect(
    on(
      projectPath,
      (path) => {
        fileCtx.tree.reset()
        setActiveFilePath(null)
        setReviewFiles([])
        if (!path) return
        void fileCtx.tree.listDir("", { force: true })
      },
      { defer: false },
    ),
  )

  const gitStatusToKind = (status: string): DiffKind => {
    if (status === "??" || status.includes("A")) return "add"
    if (status.includes("D")) return "del"
    return "mix"
  }

  const mergeKind = (a: DiffKind | undefined, b: DiffKind): DiffKind => {
    if (!a) return b
    if (a === b) return a
    return "mix"
  }

  const loadGitDiffState = async (path: string) => {
    if (!path) {
      setGitChangedFiles([])
      setGitKinds(new Map())
      setGitStats(new Map())
      setGitDiffLoading(false)
      setGitDiffError(null)
      setGitUnavailable(false)
      return
    }

    try {
      setGitDiffLoading(true)
      setGitDiffError(null)
      setGitUnavailable(false)
      const summary = await nativeApi.invoke("get_git_status", { path }) as GitStatusSummary
      const normalize = (p: string) => toRelativeProjectPath(p, path)
      const files = summary.changedFiles
        .map((entry) => normalize(entry.absolutePath || entry.path))
        .filter(Boolean)
      const kinds = new Map<string, DiffKind>()
      const stats = new Map<string, DiffStats>()

      for (const entry of summary.changedFiles) {
        const file = normalize(entry.absolutePath || entry.path)
        if (!file) continue
        const kind = gitStatusToKind(entry.status)
        kinds.set(file, kind)
        stats.set(file, {
          additions: Number(entry.additions || 0),
          deletions: Number(entry.deletions || 0),
        })

        const parts = file.split("/")
        for (const [idx] of parts.slice(0, -1).entries()) {
          const dir = parts.slice(0, idx + 1).join("/")
          if (!dir) continue
          kinds.set(dir, mergeKind(kinds.get(dir), kind))
          const prev = stats.get(dir) ?? { additions: 0, deletions: 0 }
          stats.set(dir, {
            additions: prev.additions + Number(entry.additions || 0),
            deletions: prev.deletions + Number(entry.deletions || 0),
          })
        }
      }

      setGitChangedFiles(files)
      setGitKinds(kinds)
      setGitStats(stats)
      setGitDiffLoading(false)
      setGitUnavailable(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "")
      const noGitRepo =
        /not a git repository/i.test(message) ||
        /no git repository/i.test(message) ||
        /unable to find git/i.test(message)
      setGitChangedFiles([])
      setGitKinds(new Map())
      setGitStats(new Map())
      setGitDiffLoading(false)
      setGitUnavailable(noGitRepo)
      setGitDiffError(noGitRepo ? null : (error instanceof Error ? error.message : "Unable to load git changes"))
    }
  }

  createEffect(() => {
    const path = projectPath()
    void loadGitDiffState(path)
  })

  createEffect(() => {
    const project = currentProject()
    if (!project) return

    let timer: number | undefined
    const unlistenPromise = nativeApi.listen<{ projectPath: string; paths: string[] }>("project-fs-event", (event) => {
      if (event.payload.projectPath !== project.path) return
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void loadGitDiffState(project.path)
      }, 160)
    })

    return () => {
      if (timer) window.clearTimeout(timer)
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined)
    }
  })

  createEffect(() => {
    const visible = isReviewVisible()
    window.dispatchEvent(
      new CustomEvent('gg-review-state', {
        detail: { isReviewVisible: visible },
      }),
    )
  })

  createEffect(() => {
    const handleReviewToggleRequest = () => {
      setIsReviewVisible((current) => !current)
    }

    window.addEventListener('gg-toggle-review', handleReviewToggleRequest)
    return () => window.removeEventListener('gg-toggle-review', handleReviewToggleRequest)
  })

  createEffect(() => {
    const visible = isFileTreeVisible()
    window.dispatchEvent(
      new CustomEvent('gg-file-tree-state', {
        detail: { isFileTreeVisible: visible },
      }),
    )
  })

  createEffect(() => {
    const handleFileTreeToggleRequest = () => {
      setIsFileTreeVisible((current) => !current)
    }

    window.addEventListener('gg-toggle-file-tree', handleFileTreeToggleRequest)
    return () => window.removeEventListener('gg-toggle-file-tree', handleFileTreeToggleRequest)
  })

  const handleFileSelect = (filePath: string | null) => {
    setActiveFilePath(filePath)
    if (!filePath) return
    setReviewFiles((files) => files.includes(filePath) ? files : [...files, filePath])
    setIsReviewVisible(true)
  }

  const handleCloseReviewFile = (filePath: string) => {
    setReviewFiles((files) => {
      const next = files.filter((file) => file !== filePath)
      if (activeFilePath() === filePath) {
        setActiveFilePath(next.at(-1) ?? null)
      }
      return next
    })
  }

  const handleOpenFolder = async () => {
    const selected = await nativeApi.open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder',
    })

    if (typeof selected !== 'string' || !selected) return

    const existing = projects().find((project) => project.path === selected)
    if (existing) {
      appStore.setCurrentProject(existing.id)
      return
    }

    const created = await appStore.addProject(folderNameFromPath(selected), selected)
    appStore.setCurrentProject(created.id)
  }

  const handleCreateSession = async () => {
    const cpid = currentProjectId() ?? projects()[0]?.id ?? null
    if (!cpid) return
    if (currentProjectId() !== cpid) {
      appStore.setCurrentProject(cpid)
    }
    await appStore.launchCliSession(cpid)
  }

  const handleToggleFileTree = () => {
    if (!currentProject()) return
    setIsFileTreeVisible((current) => !current)
  }

  const clampPanelWidth = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

  const workspaceSplitRect = () => workspaceSplitRef?.getBoundingClientRect()

  const resizeReviewPanel = (clientX: number) => {
    const rect = workspaceSplitRect()
    const rightEdge = rect?.right ?? window.innerWidth
    const leftEdge = rect?.left ?? 0
    const available = Math.max(0, rightEdge - leftEdge)
    const reservedFileTree = isFileTreeVisible() ? fileTreeWidth() : 0
    const minMainContent = projectSessions().length > 0 ? 420 : 300
    const maxReviewWidth = Math.max(360, available - reservedFileTree - minMainContent)
    const next = rightEdge - clientX - reservedFileTree

    setReviewWidth(clampPanelWidth(next, 360, Math.min(860, maxReviewWidth)))
  }

  const resizeFileTreePanel = (clientX: number) => {
    const rect = workspaceSplitRect()
    const rightEdge = rect?.right ?? window.innerWidth
    const leftEdge = rect?.left ?? 0
    const available = Math.max(0, rightEdge - leftEdge)
    const reservedReview = isReviewVisible() ? reviewWidth() : 0
    const minMainContent = projectSessions().length > 0 ? 420 : 300
    const maxFileTreeWidth = Math.max(240, available - reservedReview - minMainContent)
    const next = rightEdge - clientX

    setFileTreeWidth(clampPanelWidth(next, 240, Math.min(520, maxFileTreeWidth)))
  }

  return (
    <div class="flex min-h-0 flex-1 bg-background text-foreground">
      <Sidebar
        onOpenSettingsPage={() => setActivePage('settings')}
        onOpenWorkspacePage={() => setActivePage('workspace')}
      />
      <div class="min-w-0 flex-1 flex flex-col bg-background">
        {activePage() === 'workspace' ? (
          <>
            <TabBar />
            <div class="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
              <div ref={workspaceSplitRef} class="flex h-full w-full min-h-0 min-w-0">
                <div class="min-h-0 min-w-0 flex-1 overflow-hidden" style={{ display: projectSessions().length > 0 ? 'flex' : 'none' }}>
                  <TerminalPanel onNewSession={handleCreateSession} />
                </div>

                {projectSessions().length === 0 && (
                  <div class="min-h-0 min-w-0 flex-1">
                    <WelcomeScreen
                      projects={projects()}
                      currentProject={currentProject()}
                      onOpenFolder={handleOpenFolder}
                      onCreateSession={handleCreateSession}
                      onSelectProject={appStore.setCurrentProject}
                      onToggleFileTree={handleToggleFileTree}
                    />
                  </div>
                )}

                <Show when={isReviewVisible()}>
                  <div
                    class="relative min-h-0 shrink-0 overflow-hidden border-l border-border/60"
                    style={{ width: `${reviewWidth()}px` }}
                  >
                    <ResizeHandle
                      edge="start"
                      onResize={resizeReviewPanel}
                    />
                    <OpencodeSessionPanel
                      projectPath={projectPath()}
                      activeFile={activeFilePath()}
                      openFiles={reviewFiles()}
                      onSelectFile={setActiveFilePath}
                      onCloseFile={handleCloseReviewFile}
                    />
                  </div>
                </Show>

                {(() => {
                  if (!isFileTreeVisible()) return null
                  return (
                      <div
                        class="relative flex h-full shrink-0 flex-col overflow-hidden border-l bg-muted/40 text-foreground"
                        style={{ width: `${fileTreeWidth()}px` }}
                      >
                        <ResizeHandle
                          edge="start"
                          onResize={resizeFileTreePanel}
                        />
                        <Suspense fallback={null}>
                          <fileCtx.FileProvider>
                            <Tabs key={currentProjectId() ?? "no-project"} value={fileTreeTab()} onValueChange={(value: string) => setFileTreeTab(value === "changes" ? "changes" : "all")} class="h-full">
                              <div class="px-3 py-2 border-b border-border/60">
                                <TabsList class="w-full">
                                  <TabsTrigger value="changes" class="flex-1">
                                    {gitChangedFiles().length} {gitChangedFiles().length === 1 ? "Change" : "Changes"}
                                  </TabsTrigger>
                                  <TabsTrigger value="all" class="flex-1">All files</TabsTrigger>
                                </TabsList>
                              </div>
                              <Show when={gitUnavailable()}>
                                <div class="px-3 py-2 border-b border-border/60 text-xs text-amber-300 bg-amber-500/10">
                                  Git is not initialized for this project.
                                </div>
                              </Show>
                              <TabsContent value="changes" class="h-full min-h-0 overflow-hidden px-3 py-2">
                                <div class="h-full min-h-0 overflow-y-auto overflow-x-hidden">
                                  {gitDiffLoading() ? (
                                    <div class="px-2 py-2 text-sm text-muted-foreground">Loading changes...</div>
                                  ) : gitDiffError() ? (
                                    <div class="px-2 py-2 text-sm text-destructive/90">Failed to load git changes</div>
                                  ) : gitChangedFiles().length === 0 ? (
                                    <div class="px-2 py-2 text-sm text-muted-foreground">No changes</div>
                                  ) : (
                                    <FileTree
                                      path=""
                                      class="group/filetree"
                                      allowed={gitChangedFiles()}
                                      kinds={gitKinds()}
                                      stats={gitStats()}
                                      draggable={false}
                                      active={activeFilePath() ?? undefined}
                                      onFileClick={(file) => handleFileSelect(file?.path ?? null)}
                                    />
                                  )}
                                </div>
                              </TabsContent>
                              <TabsContent value="all" class="h-full min-h-0 overflow-hidden px-3 py-2">
                                <div class="h-full min-h-0 overflow-y-auto overflow-x-hidden">
                                  <FileTree
                                    path=""
                                    class="group/filetree"
                                    modified={gitChangedFiles()}
                                    kinds={gitKinds()}
                                    stats={gitStats()}
                                    active={activeFilePath() ?? undefined}
                                    onFileClick={(file) => handleFileSelect(file?.path ?? null)}
                                  />
                                </div>
                              </TabsContent>
                            </Tabs>
                          </fileCtx.FileProvider>
                        </Suspense>
                      </div>
                  )
                })()}
              </div>
            </div>
          </>
        ) : (
          <SettingsPage />
        )}
      </div>
    </div>
  )
}

import { createEffect, createMemo, createResource, createSignal, on, Show, Suspense } from 'solid-js'
import { nativeApi } from '../services/native'
import { Sidebar } from './Sidebar'

import { TerminalPanel } from './TerminalPanel'
import { BottomTerminalPanel } from './BottomTerminalPanel'
import { WelcomeScreen } from './WelcomeScreen'
import { SettingsPage } from './SettingsPage'
import { useStore } from '../store'
import { createFileContext } from '@/context/file'
import type { FileNode } from '@/types/file-node'
import { ResizeHandle } from '@/opencode-ported/resize-handle'
import { useGlobalSDK } from '@/context/global-sdk'
import { useGlobalSync } from '@/context/global-sync'
import { SDKProvider } from '@/context/sdk'
import { LayoutProvider, useLayout } from '@/context/layout'
import type { VcsFileDiff } from '@opencode-ai/sdk/v2'
import { SessionReviewTab } from '@/pages/session/review-tab'
import { FileComponentProvider } from '@opencode-ai/ui/context'
import { File as OpenCodeFile } from '@opencode-ai/ui/file'
import { SessionSidePanel } from '@/pages/session/session-side-panel'


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

function OpenCodeReviewContent(props: {
  projectPath: () => string
  reviewDiffs: () => VcsFileDiff[]
  activeFilePath: () => string | null
  onSelectFile: (file: string | null) => void
  gitDiffLoading: () => boolean
  isReviewVisible: () => boolean
  isFileTreeVisible: () => boolean
}) {
  const layout = useLayout()
  const sessionViewKey = createMemo(() => `${props.projectPath()}::workspace`)
  const view = createMemo(() => layout.view(sessionViewKey()))
  const FilePreview = (fileProps: any) => <OpenCodeFile {...fileProps} />
  const normalizeReviewPath = (path: string) => toPosix(path).replace(/^\/+/, "").toLowerCase()
  const activeDiffPath = createMemo(() => {
    const active = props.activeFilePath()
    if (!active) return
    const target = normalizeReviewPath(active)
    return props.reviewDiffs().find((diff) => normalizeReviewPath(diff.file) === target)?.file
  })
  const selectedPlainFile = createMemo(() => {
    const active = props.activeFilePath()
    if (!active) return
    if (activeDiffPath()) return
    return active
  })
  const [plainFileContent] = createResource(selectedPlainFile, async (filePath) => {
    const root = props.projectPath()
    const absolute = toPosix(`${root}/${filePath}`)
    const contents = await nativeApi.invoke("read_text_file", { path: absolute })
    return {
      name: filePath,
      contents,
      cacheKey: `${filePath}:${contents.length}:${contents.slice(0, 64)}`,
    }
  })

  const openReviewPath = (path: string) => {
    const target = normalizeReviewPath(path)
    const reviewPath = props.reviewDiffs().find((diff) => normalizeReviewPath(diff.file) === target)?.file ?? path
    props.onSelectFile(reviewPath)
    view().review.openPath(reviewPath)
  }

  createEffect(() => {
    const path = activeDiffPath()
    if (!path || !props.isReviewVisible()) return
    view().review.openPath(path)
  })

  return (
    <SessionSidePanel
      reviewOpen={props.isReviewVisible}
      fileTreeOpen={props.isFileTreeVisible}
      diffs={props.reviewDiffs}
      diffsReady={() => !props.gitDiffLoading()}
      activeDiff={props.activeFilePath() ?? undefined}
      focusReviewDiff={openReviewPath}
      openFile={openReviewPath}
      reviewPanel={() => (
        <FileComponentProvider component={FilePreview}>
          <Show
            when={selectedPlainFile() && plainFileContent()}
            fallback={
              <SessionReviewTab
                diffs={props.reviewDiffs}
                view={view}
                diffStyle={layout.review.diffStyle()}
                onDiffStyleChange={layout.review.setDiffStyle}
                onViewFile={openReviewPath}
                focusedFile={activeDiffPath() ?? props.activeFilePath() ?? undefined}
              />
            }
          >
            {(file) => (
              <div class="h-full min-h-0 overflow-hidden bg-background-base">
                <OpenCodeFile mode="text" file={file()} class="h-full" />
              </div>
            )}
          </Show>
        </FileComponentProvider>
      )}
    />
  )
}

export function MainView() {
  const appStore = useStore()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
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
  const [reviewWidth, setReviewWidth] = createSignal(840)
  const [gitChangedFiles, setGitChangedFiles] = createSignal<string[]>([])
  const [gitKinds, setGitKinds] = createSignal<ReadonlyMap<string, DiffKind>>(new Map())
  const [gitStats, setGitStats] = createSignal<ReadonlyMap<string, DiffStats>>(new Map())
  const [gitDiffLoading, setGitDiffLoading] = createSignal(false)
  const [gitDiffError, setGitDiffError] = createSignal<string | null>(null)
  const [gitUnavailable, setGitUnavailable] = createSignal(false)
  const [reviewDiffs, setReviewDiffs] = createSignal<VcsFileDiff[]>([])
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
      const client = globalSDK.createClient({ directory: path, throwOnError: true })
      const diffs = await client.vcs.diff({ mode: "git", directory: path }).then((response) => response.data)
      setReviewDiffs(Array.isArray(diffs) ? diffs : [])
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
      setReviewDiffs([])
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
    const handleReviewWorkspaceToggleRequest = () => {
      const nextVisible = !(isReviewVisible() || isFileTreeVisible())
      setIsReviewVisible(nextVisible)
      setIsFileTreeVisible(nextVisible)
    }

    window.addEventListener('gg-toggle-review-workspace', handleReviewWorkspaceToggleRequest)
    return () => window.removeEventListener('gg-toggle-review-workspace', handleReviewWorkspaceToggleRequest)
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
    const project = projects().find((item) => item.id === cpid)
    if (!project) return
    const client = globalSDK.createClient({ directory: project.path, throwOnError: true })
    const created = await client.session.create().then((response) => response.data)
    if (!created) return
    const [projectStore] = globalSync.child(project.path)
    void appStore.syncOpenCodeSessions(cpid, [created, ...projectStore.session])
    if (currentProjectId() !== cpid) appStore.setCurrentProject(cpid)
    appStore.setActiveSession(created.id)
    void globalSync.project.loadSessions(project.path)
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
    const minMainContent = projectSessions().length > 0 ? 420 : 300
    const maxReviewWidth = Math.max(360, available - minMainContent)
    const next = rightEdge - clientX
    setReviewWidth(clampPanelWidth(next, 360, Math.min(1080, maxReviewWidth)))
  }

  return (
    <div class="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <Sidebar
        onOpenSettingsPage={() => setActivePage('settings')}
        onOpenWorkspacePage={() => setActivePage('workspace')}
      />
      <div class="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden bg-background">
        {activePage() === 'workspace' ? (
          <LayoutProvider>
            <div class="flex flex-col min-h-0 flex-1 overflow-hidden">
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

                  <Show when={isReviewVisible() || isFileTreeVisible()}>
                    <div
                      class="relative min-h-0 shrink-0 overflow-hidden border-l border-border/60"
                      style={{ width: `${reviewWidth()}px` }}
                    >
                      <ResizeHandle
                        edge="start"
                        onResize={resizeReviewPanel}
                      />
                      <Suspense fallback={null}>
                        <SDKProvider directory={projectPath}>
                          <fileCtx.FileProvider>
                            <OpenCodeReviewContent
                              projectPath={projectPath}
                              reviewDiffs={reviewDiffs}
                              activeFilePath={activeFilePath}
                              onSelectFile={handleFileSelect}
                              gitDiffLoading={gitDiffLoading}
                              isReviewVisible={isReviewVisible}
                              isFileTreeVisible={isFileTreeVisible}
                            />
                          </fileCtx.FileProvider>
                        </SDKProvider>
                      </Suspense>
                    </div>
                  </Show>
                </div>
              </div>

              <Show when={projectSessions().length > 0}>
                <BottomTerminalPanel />
              </Show>
            </div>
          </LayoutProvider>
        ) : (
          <SettingsPage />
        )}
      </div>
    </div>
  )
}

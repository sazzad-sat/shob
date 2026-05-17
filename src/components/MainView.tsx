import { createEffect, createMemo, createSignal, lazy, Suspense } from 'solid-js'
import { nativeApi } from '../services/native'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { TerminalPanel } from './TerminalPanel'
import { WelcomeScreen } from './WelcomeScreen'
import { SettingsPage } from './SettingsPage'
import { useStore } from '../store'
import { createFileContext } from '@/context/file'
import type { FileNode } from '@/types/file-node'

const FileTree = lazy(async () => {
  const mod = await import('./FileTree')
  return { default: mod.default }
})

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function MainView() {
  const appStore = useStore()
  const projects = useStore((s) => s.projects)
  const currentProject = useStore((s) =>
    s.projects.find((project) => project.id === s.currentProjectId) ?? null,
  )
  const currentProjectId = useStore((s) => s.currentProjectId)
  const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [activePage, setActivePage] = createSignal<'workspace' | 'settings'>('workspace')
  const projectSessions = createMemo(() => currentProject()?.sessions ?? [])

  const projectPath = createMemo(() => currentProject()?.path ?? '')

  const fileCtx = createFileContext({
    projectPath,
    listDirectory: async (path: string) => {
      const absolute = path ? `${projectPath()}/${path}`.replace(/\\/g, "/").replace(/\/+/g, "/") : projectPath()
      const entries = await nativeApi.invoke("list_directory", { path: absolute }) as Array<{ name: string; path: string; isDirectory: boolean }>
      return entries.map((e) => ({
        name: e.name,
        path: e.path.replace(/\\/g, "/").replace(absolute.replace(/\\/g, "/") + "/", "").replace(/\/+/g, "/"),
        absolute: e.path,
        type: e.isDirectory ? "directory" : "file",
        ignored: false,
      })) as FileNode[]
    },
    onError: (msg) => console.error("[FileTree]", msg),
  })

  createEffect(() => {
    currentProjectId()
    setActiveFilePath(null)
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
              <div class="flex h-full w-full min-h-0 min-w-0">
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

                {(() => {
                  if (!isFileTreeVisible()) return null
                  return (
                    <div class="flex h-full w-[332px] shrink-0 flex-col border-l bg-muted/40 text-foreground">
                      <Suspense fallback={null}>
                        <fileCtx.FileProvider>
                          <FileTree path={projectPath()} active={activeFilePath() ?? undefined} onFileClick={(file) => handleFileSelect(file?.path ?? null)} />
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

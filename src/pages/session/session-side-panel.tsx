import { Match, Show, Switch, createMemo, type JSX } from "solid-js"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { SnapshotFileDiff, VcsFileDiff } from "@opencode-ai/sdk/v2"
import FileTree from "@/components/file-tree"
import { Terminal } from "@/components/Terminal"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { SessionContextTab } from "@/components/session/session-context-tab"
import { DialogAddTab } from "@/components/dialog-add-tab"

type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff

function renderDiff(value: SnapshotFileDiff | VcsFileDiff): value is RenderDiff {
  return typeof value.file === "string"
}

type SidePanelProps = {
  reviewOpen: () => boolean
  fileTreeOpen: () => boolean
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  diffsReady: () => boolean
  reviewPanel: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  openFile: (path: string) => void
  contextSessionId?: () => string | null
  onContextClose?: () => void
  projectPath: () => string
  terminalOpen: () => boolean
  terminalSessionId: () => string | null
  onTerminalClose: () => void
}

export function SessionSidePanel(props: SidePanelProps) {
  const layout = useLayout()
  const file = useFile()
  const language = useLanguage()
  const dialog = useDialog()

  const openAddTabDialog = () => {
    dialog.show(() => (
      <DialogAddTab
        projectPath={props.projectPath}
        onOpenFile={(path) => props.openFile(path)}
        onOpenTerminal={() => {
          if (!props.terminalOpen()) {
            window.dispatchEvent(new CustomEvent("shob-open-terminal-tab"))
          }
        }}
      />
    ))
  }

  const open = createMemo(
    () => props.reviewOpen() || props.fileTreeOpen() || !!props.contextSessionId?.() || props.terminalOpen(),
  )
  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((diff) => diff.file))
  const reviewCount = createMemo(() => diffFiles().length)
  const hasReview = createMemo(() => reviewCount() > 0)
  const fileTreeTab = () => layout.fileTree.tab()
  const treeWidth = createMemo(() => (props.fileTreeOpen() ? `${layout.fileTree.width()}px` : "0px"))

  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "")
    const out = new Map<string, "add" | "del" | "mix">()

    for (const diff of diffs()) {
      const filepath = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"
      out.set(filepath, kind)

      const parts = filepath.split("/")
      for (const [index] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, index + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }

    return out
  })

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const empty = (message: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{message}</div>
      </div>
    </div>
  )

  return (
    <aside
      id="review-panel"
      aria-label={language.t("session.panel.reviewAndFiles")}
      aria-hidden={!open()}
      inert={!open()}
      class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
      classList={{ "pointer-events-none": !open() }}
    >
      <Show when={open()}>
        <div class="size-full flex border-l border-border-weaker-base">
          <div
            aria-hidden={!props.reviewOpen() && !props.contextSessionId?.() && !props.terminalOpen()}
            inert={!props.reviewOpen() && !props.contextSessionId?.() && !props.terminalOpen()}
            class="relative min-w-0 h-full flex-1 overflow-hidden bg-background-base"
            classList={{
              "pointer-events-none": !props.reviewOpen() && !props.contextSessionId?.() && !props.terminalOpen(),
            }}
          >
            <div class="size-full min-w-0 h-full bg-background-base">
              <Tabs
                value={
                  props.terminalOpen() ? "terminal" : props.contextSessionId?.() ? "context" : "review"
                }
                onChange={() => undefined}
              >
                <div class="sticky top-0 z-10 shrink-0 flex bg-background-base border-b border-border-weaker-base">
                  <Tabs.List>
                    <Tabs.Trigger value="review">
                      <div class="flex items-center gap-1.5">
                        <div>{language.t("session.tab.review")}</div>
                        <Show when={hasReview()}>
                          <div>{reviewCount()}</div>
                        </Show>
                      </div>
                    </Tabs.Trigger>
                    <Show when={props.contextSessionId?.()}>
                      <Tabs.Trigger value="context">
                        <div class="flex items-center gap-1.5">
                          <div>{language.t("session.tab.context")}</div>
                          <button
                            type="button"
                            class="ml-1 size-4 flex items-center justify-center rounded hover:bg-surface-raised-base-hover text-text-weak"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onContextClose?.()
                            }}
                          >
                            <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                          </button>
                        </div>
                      </Tabs.Trigger>
                    </Show>
                    <Show when={props.terminalOpen()}>
                      <Tabs.Trigger value="terminal">
                        <div class="flex items-center gap-1.5">
                          <div>{language.t("session.tab.terminal")}</div>
                          <button
                            type="button"
                            class="ml-1 size-4 flex items-center justify-center rounded hover:bg-surface-raised-base-hover text-text-weak"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onTerminalClose()
                            }}
                          >
                            <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                          </button>
                        </div>
                      </Tabs.Trigger>
                    </Show>
                    <div class="bg-background-stronger h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3">
                      <Tooltip value={language.t("session.tab.add")} placement="bottom">
                        <IconButton
                          icon="plus-small"
                          variant="ghost"
                          iconSize="large"
                          class="!rounded-md"
                          aria-label={language.t("session.tab.add")}
                          onClick={openAddTabDialog}
                        />
                      </Tooltip>
                    </div>
                  </Tabs.List>
                </div>
                <Tabs.Content value="review" class="flex flex-col h-full overflow-hidden contain-strict">
                  <Show when={props.reviewOpen()}>{props.reviewPanel()}</Show>
                </Tabs.Content>
                <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                  <Show when={props.contextSessionId?.()}>
                    <SessionContextTab sessionId={props.contextSessionId!()!} />
                  </Show>
                </Tabs.Content>
                <Tabs.Content value="terminal" class="flex flex-col h-full overflow-hidden contain-strict">
                  <Show when={props.terminalOpen() && props.terminalSessionId()}>
                    <Terminal sessionId={props.terminalSessionId()!} />
                  </Show>
                </Tabs.Content>
              </Tabs>
            </div>
          </div>

          <div
            id="file-tree-panel"
            aria-hidden={!props.fileTreeOpen()}
            inert={!props.fileTreeOpen()}
            class="relative min-w-0 h-full shrink-0 overflow-hidden"
            classList={{
              "pointer-events-none": !props.fileTreeOpen(),
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none": true,
            }}
            style={{ width: treeWidth() }}
          >
            <div
              class="h-full flex flex-col overflow-hidden group/filetree"
              classList={{ "border-l border-border-weaker-base": props.reviewOpen() }}
            >
              <Tabs
                variant="pill"
                value={fileTreeTab()}
                onChange={setFileTreeTabValue}
                class="h-full"
                data-scope="filetree"
              >
                <Tabs.List>
                  <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                    {reviewCount()}{" "}
                    {language.t(reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other")}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                    {language.t("session.files.all")}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={hasReview() || !props.diffsReady()}>
                      <Show
                        when={props.diffsReady()}
                        fallback={
                          <div class="px-2 py-2 text-12-regular text-text-weak">
                            {language.t("common.loading")}
                            {language.t("common.loading.ellipsis")}
                          </div>
                        }
                      >
                        <FileTree
                          path=""
                          class="pt-3"
                          allowed={diffFiles()}
                          kinds={kinds()}
                          draggable={false}
                          active={props.activeDiff}
                          onFileClick={(node) => props.focusReviewDiff(node.path)}
                        />
                      </Show>
                    </Match>
                  </Switch>
                </Tabs.Content>
                <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                    <Match when={true}>
                      <FileTree
                        path=""
                        class="pt-3"
                        modified={diffFiles()}
                        kinds={kinds()}
                        onFileClick={(node) => props.openFile(node.path)}
                      />
                    </Match>
                  </Switch>
                </Tabs.Content>
              </Tabs>
            </div>
            <Show when={props.fileTreeOpen()}>
              <ResizeHandle
                direction="horizontal"
                edge="start"
                size={layout.fileTree.width()}
                min={200}
                max={480}
                onResize={(width) => layout.fileTree.resize(width)}
              />
            </Show>
          </div>
        </div>
      </Show>
    </aside>
  )
}

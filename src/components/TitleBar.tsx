import { createSignal, onCleanup, onMount } from "solid-js"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { nativeApi } from "../services/native"

type OsPlatform = "windows" | "macos" | "linux" | "unknown"

const TITLEBAR_HEIGHT = 40
const WINDOWS_CONTROLS_BASE_WIDTH = 138

function currentWindow() {
  return nativeApi.window()
}

function interactive(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const selector =
    "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']"
  return !!target.closest(selector)
}

function mapPlatform(value: string): OsPlatform {
  if (value === "windows") return "windows"
  if (value === "macos") return "macos"
  if (value === "linux") return "linux"
  return "unknown"
}

export function TitleBar() {
  const [platform, setPlatform] = createSignal<OsPlatform>("unknown")
  const [isSidebarVisible, setIsSidebarVisible] = createSignal(true)
  const [isReviewVisible, setIsReviewVisible] = createSignal(false)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [isFullscreen, setIsFullscreen] = createSignal(false)

  const mac = () => platform() === "macos"
  const windows = () => platform() === "windows"

  onMount(() => {
    setPlatform(mapPlatform(nativeApi.platform()))
    void currentWindow()
      .onResized((state) => {
        if (typeof state?.fullscreen === "boolean") {
          setIsFullscreen(state.fullscreen)
        }
      })
      .catch(() => undefined)
  })

  onMount(() => {
    const handleSidebarState = (event: Event) => {
      const detail = (event as CustomEvent<{ isSidebarVisible: boolean }>).detail
      if (detail) setIsSidebarVisible(Boolean(detail.isSidebarVisible))
    }
    window.addEventListener("gg-sidebar-state", handleSidebarState as EventListener)
    onCleanup(() => window.removeEventListener("gg-sidebar-state", handleSidebarState as EventListener))
  })

  onMount(() => {
    const handleReviewState = (event: Event) => {
      const detail = (event as CustomEvent<{ isReviewVisible: boolean }>).detail
      if (detail) setIsReviewVisible(Boolean(detail.isReviewVisible))
    }
    window.addEventListener("gg-review-state", handleReviewState as EventListener)
    onCleanup(() => window.removeEventListener("gg-review-state", handleReviewState as EventListener))
  })

  onMount(() => {
    const handleFileTreeState = (event: Event) => {
      const detail = (event as CustomEvent<{ isFileTreeVisible: boolean }>).detail
      if (detail) setIsFileTreeVisible(Boolean(detail.isFileTreeVisible))
    }
    window.addEventListener("gg-file-tree-state", handleFileTreeState as EventListener)
    onCleanup(() => window.removeEventListener("gg-file-tree-state", handleFileTreeState as EventListener))
  })

  const maximize = (e: MouseEvent) => {
    if (interactive(e.target)) return
    void currentWindow().toggleMaximize().catch(() => undefined)
  }

  return (
    <header
      class="h-10 shrink-0 bg-background-base relative overflow-hidden flex flex-row"
      style={{
        "min-height": `${TITLEBAR_HEIGHT}px`,
        "padding-left": mac() ? (isFullscreen() ? "10px" : "84px") : "0",
        "-webkit-app-region": "drag",
      }}
      onDblClick={maximize}
    >
      <div class="grid h-full min-h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
        <div
          classList={{
            "flex items-center min-w-0": true,
            "pl-2": !mac(),
          }}
        >
          <Button
            variant="ghost"
            class="titlebar-icon"
            style={{ "-webkit-app-region": "no-drag" }}
            onClick={() => window.dispatchEvent(new Event("gg-toggle-sidebar"))}
            aria-label="Toggle sidebar"
            aria-expanded={isSidebarVisible()}
          >
            <Icon size="small" name={isSidebarVisible() ? "sidebar-active" : "sidebar"} />
          </Button>
          <div id="opencode-titlebar-left" class="flex items-center gap-3 min-w-0 px-2" style={{ "-webkit-app-region": "no-drag" }} />
        </div>

        <div class="min-w-0 flex items-center justify-center pointer-events-none">
          <div id="opencode-titlebar-center" class="pointer-events-auto min-w-0 flex justify-center w-fit max-w-full" />
        </div>

        <div
          classList={{
            "flex items-center min-w-0 justify-end": true,
            "pr-2": !windows(),
          }}
        >
          <div id="opencode-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" style={{ "-webkit-app-region": "no-drag" }}>
            <Button
              variant="ghost"
              class="titlebar-icon"
              onClick={() => window.dispatchEvent(new Event("gg-toggle-file-tree"))}
              title={isFileTreeVisible() ? "Hide file tree" : "Show file tree"}
              aria-label="Toggle file tree"
              aria-pressed={isFileTreeVisible()}
            >
              <Icon name={isFileTreeVisible() ? "file-tree-active" : "file-tree"} size="small" />
            </Button>
            <Button
              variant="ghost"
              class="titlebar-icon"
              onClick={() => window.dispatchEvent(new Event("gg-toggle-review-workspace"))}
              title={isReviewVisible() || isFileTreeVisible() ? "Hide file tree and review panel" : "Show file tree and review panel"}
              aria-label="Toggle review workspace"
              aria-pressed={isReviewVisible() || isFileTreeVisible()}
            >
              <Icon name={isReviewVisible() || isFileTreeVisible() ? "review-active" : "review"} size="small" />
            </Button>
          </div>
          {windows() && <div class="shrink-0" style={{ width: `${WINDOWS_CONTROLS_BASE_WIDTH}px` }} />}
        </div>
      </div>
    </header>
  )
}

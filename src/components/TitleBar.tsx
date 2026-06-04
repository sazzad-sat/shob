import { Show, createSignal, onCleanup, onMount } from "solid-js"
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
  const [isFullscreen, setIsFullscreen] = createSignal(false)
  const [isMaximized, setIsMaximized] = createSignal(false)
  const [updateState, setUpdateState] = createSignal<"idle" | "checking" | "available" | "downloading" | "downloaded" | "error" | "dev">("idle")
  const [updateVersion, setUpdateVersion] = createSignal<string | null>(null)
  const [downloadPercent, setDownloadPercent] = createSignal(0)

  const mac = () => platform() === "macos"
  const windows = () => platform() === "windows"
  const linux = () => platform() === "linux"

  onMount(() => {
    setPlatform(mapPlatform(nativeApi.platform()))
    const win = currentWindow()
    void win
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => undefined)
    void win
      .onResized((state) => {
        if (typeof state?.maximized === "boolean") {
          setIsMaximized(state.maximized)
        }
        if (typeof state?.fullscreen === "boolean") {
          setIsFullscreen(state.fullscreen)
        }
      })
      .catch(() => undefined)
  })

  onMount(() => {
    const unlisteners: Array<() => void> = []

    void nativeApi
      .invoke("get_update_status")
      .then((state) => {
        setUpdateState(state.status)
        setUpdateVersion(state.version ?? null)
      })
      .catch(() => undefined)

    const listen = async () => {
      unlisteners.push(
        await nativeApi.listen<null>("update:checking", () => {
          setUpdateState("checking")
        }),
        await nativeApi.listen<{ version: string }>("update:available", (event) => {
          setUpdateState("downloading")
          setUpdateVersion(event.payload.version)
          setDownloadPercent(0)
        }),
        await nativeApi.listen<{ percent: number }>("update:progress", (event) => {
          setUpdateState("downloading")
          setDownloadPercent(event.payload.percent)
        }),
        await nativeApi.listen<{ version: string }>("update:downloaded", (event) => {
          setUpdateState("downloaded")
          setUpdateVersion(event.payload.version)
          setDownloadPercent(100)
        }),
        await nativeApi.listen<null>("update:not-available", () => {
          setUpdateState("idle")
          setUpdateVersion(null)
          setDownloadPercent(0)
        }),
        await nativeApi.listen<string>("update:error", () => {
          setUpdateState("error")
        }),
      )
    }

    void listen().catch(() => undefined)
    onCleanup(() => {
      for (const unlisten of unlisteners) unlisten()
    })
  })

  onMount(() => {
    const handleSidebarState = (event: Event) => {
      const detail = (event as CustomEvent<{ isSidebarVisible: boolean }>).detail
      if (detail) setIsSidebarVisible(Boolean(detail.isSidebarVisible))
    }
    window.addEventListener("gg-sidebar-state", handleSidebarState as EventListener)
    onCleanup(() => window.removeEventListener("gg-sidebar-state", handleSidebarState as EventListener))
  })

  const maximize = (e: MouseEvent) => {
    if (interactive(e.target)) return
    void currentWindow()
      .toggleMaximize()
      .then((maximized) => {
        if (typeof maximized === "boolean") setIsMaximized(maximized)
      })
      .catch(() => undefined)
  }

  const installUpdate = (e: MouseEvent) => {
    e.stopPropagation()
    void nativeApi.invoke("install_update").catch(() => undefined)
  }

  const minimizeWindow = (e: MouseEvent) => {
    e.stopPropagation()
    void currentWindow().minimize().catch(() => undefined)
  }

  const toggleMaximizeWindow = (e: MouseEvent) => {
    e.stopPropagation()
    void currentWindow()
      .toggleMaximize()
      .then((maximized) => {
        if (typeof maximized === "boolean") setIsMaximized(maximized)
      })
      .catch(() => undefined)
  }

  const closeWindow = (e: MouseEvent) => {
    e.stopPropagation()
    void currentWindow().close().catch(() => undefined)
  }

  return (
    <header
      class="h-10 shrink-0 bg-background-base relative overflow-hidden flex flex-row border-b border-border-weaker-base"
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
          <Show when={!isSidebarVisible()}>
            <Button
              variant="ghost"
              class="titlebar-icon"
              style={{ "-webkit-app-region": "no-drag" }}
              onClick={() => window.dispatchEvent(new Event("gg-create-session"))}
              title="Start a new session"
              aria-label="Start a new session"
            >
              <Icon size="small" name="new-session" />
            </Button>
          </Show>
          <Show when={updateState() === "downloaded"}>
            <Button
              variant="ghost"
              class="titlebar-icon titlebar-update-ready"
              style={{ "-webkit-app-region": "no-drag" }}
              onClick={installUpdate}
              title={`Install Shob ${updateVersion() ?? "update"} and restart`}
              aria-label="Install downloaded update"
            >
              <Icon size="small" name="download" />
            </Button>
          </Show>
          <Show when={updateState() === "downloading"}>
            <Button
              variant="ghost"
              class="titlebar-icon titlebar-update-downloading"
              style={{ "-webkit-app-region": "no-drag" }}
              disabled
              title={`Downloading Shob ${updateVersion() ?? "update"} ${downloadPercent().toFixed(0)}%`}
              aria-label="Update downloading"
            >
              <Icon size="small" name="download" />
            </Button>
          </Show>
          <div id="shob-titlebar-left" class="flex items-center gap-3 min-w-0 px-2" style={{ "-webkit-app-region": "no-drag" }} />
        </div>

        <div class="min-w-0 flex items-center justify-center pointer-events-none">
          <div id="shob-titlebar-center" class="pointer-events-auto min-w-0 flex justify-center w-fit max-w-full" />
        </div>

        <div
          classList={{
            "flex items-center min-w-0 justify-end": true,
            "pr-2": !windows(),
          }}
        >
          <div id="shob-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" style={{ "-webkit-app-region": "no-drag" }} />
          <Show when={linux()}>
            <div class="flex shrink-0 items-center gap-0.5" style={{ "-webkit-app-region": "no-drag" }}>
              <Button
                variant="ghost"
                class="titlebar-icon"
                style={{ "-webkit-app-region": "no-drag" }}
                onClick={minimizeWindow}
                title="Minimize"
                aria-label="Minimize"
              >
                <Icon size="small" name="dash" />
              </Button>
              <Button
                variant="ghost"
                class="titlebar-icon"
                style={{ "-webkit-app-region": "no-drag" }}
                onClick={toggleMaximizeWindow}
                title={isMaximized() ? "Restore" : "Maximize"}
                aria-label={isMaximized() ? "Restore" : "Maximize"}
              >
                <Icon size="small" name={isMaximized() ? "collapse" : "expand"} />
              </Button>
              <Button
                variant="ghost"
                class="titlebar-icon titlebar-window-close"
                style={{ "-webkit-app-region": "no-drag" }}
                onClick={closeWindow}
                title="Close"
                aria-label="Close"
              >
                <Icon size="small" name="close" />
              </Button>
            </div>
          </Show>
          {windows() && <div class="shrink-0" style={{ width: `${WINDOWS_CONTROLS_BASE_WIDTH}px` }} />}
        </div>
      </div>
    </header>
  )
}

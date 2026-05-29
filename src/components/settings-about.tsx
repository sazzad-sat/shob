import { createSignal, onMount, onCleanup, Show } from "solid-js"
import { Button } from "@/components/ui/button"
import { nativeApi } from "@/services/native"
import { CheckCircle2 } from "lucide-solid"
import { Ico } from "@/components/Ico"

type AboutStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error" | "installing" | "dev"

export function SettingsAbout() {
  const [appName, setAppName] = createSignal("Shob")
  const [version, setVersion] = createSignal("Unknown")
  const [latestVersion, setLatestVersion] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<AboutStatus>("idle")
  const [message, setMessage] = createSignal("Check for updates to see if a newer version is available.")
  const [updateDownloaded, setUpdateDownloaded] = createSignal(false)
  const [downloadPercent, setDownloadPercent] = createSignal(0)
  const [lastCheckedAt, setLastCheckedAt] = createSignal<string | null>(null)
  const [checkInFlight, setCheckInFlight] = createSignal(false)
  const [downloadInFlight, setDownloadInFlight] = createSignal(false)
  const [installInFlight, setInstallInFlight] = createSignal(false)

  const unlistenList: Array<() => void> = []

  const isBusy = () =>
    checkInFlight() ||
    downloadInFlight() ||
    installInFlight() ||
    status() === "checking" ||
    status() === "downloading" ||
    status() === "installing"

  onMount(() => {
    void nativeApi
      .invoke("get_app_info")
      .then((info) => {
        setAppName(info.name || "Shob")
        setVersion(info.version || "Unknown")
      })
      .catch(() => {})

    // Listen to real-time auto-updater events from main process
    const setupListeners = async () => {
      try {
        const uChecking = await nativeApi.listen<null>("update:checking", () => {
          setStatus("checking")
          setMessage("Checking for updates...")
        })
        const uAvailable = await nativeApi.listen<{ version: string }>("update:available", (event) => {
          setStatus("available")
          setLatestVersion(event.payload.version)
          setUpdateDownloaded(false)
          setMessage(`Version ${event.payload.version} is available. Click 'Download' to start downloading.`)
        })
        const uNotAvailable = await nativeApi.listen<null>("update:not-available", () => {
          setStatus("up-to-date")
          setMessage("You are running the latest version.")
        })
        const uProgress = await nativeApi.listen<{ percent: number; bytesPerSecond: number; total: number; transferred: number }>(
          "update:progress",
          (event) => {
            setStatus("downloading")
            setDownloadPercent(event.payload.percent)
            const speedMb = (event.payload.bytesPerSecond / (1024 * 1024)).toFixed(2)
            const percentStr = event.payload.percent.toFixed(1)
            setMessage(`Downloading update... ${percentStr}% (${speedMb} MB/s)`)
          }
        )
        const uDownloaded = await nativeApi.listen<{ version: string }>("update:downloaded", (event) => {
          setStatus("available")
          setLatestVersion(event.payload.version)
          setUpdateDownloaded(true)
          setMessage(`Version ${event.payload.version} has been downloaded. Restart the application to install.`)
        })
        const uError = await nativeApi.listen<string>("update:error", (event) => {
          setStatus("error")
          setMessage(`Error checking/downloading update: ${event.payload}`)
        })

        unlistenList.push(uChecking, uAvailable, uNotAvailable, uProgress, uDownloaded, uError)
      } catch (err) {
        console.error("Failed to register updater event listeners:", err)
      }
    }

    void setupListeners()
  })

  onCleanup(() => {
    for (const unlisten of unlistenList) {
      unlisten()
    }
  })

  const checkForUpdates = async () => {
    if (checkInFlight() || installInFlight()) return
    if (status() === "downloading") {
      setMessage("Update download is already in progress in the background.")
      return
    }
    setCheckInFlight(true)
    setStatus("checking")
    setMessage("Checking for updates...")
    try {
      const result = await nativeApi.invoke("check_for_updates", { manual: true })
      setLastCheckedAt(new Date().toLocaleString())
      if (result.status === "dev") {
        setStatus("dev")
        setMessage("You are running a development build. Auto-updates are unavailable.")
        return
      }
      if (result.status === "error") {
        setStatus("error")
        setMessage("Could not check for updates. Please verify your internet connection and try again.")
        return
      }
      setLatestVersion(result.version ?? null)
      setUpdateDownloaded(Boolean(result.downloaded))
      if (result.updateAvailable) {
        if (result.downloaded) {
          setStatus("available")
          setMessage(`Update ${result.version ?? ""} downloaded. Restart to install and complete the update.`.trim())
        } else {
          setStatus("available")
          setMessage(`Update ${result.version ?? ""} found. Click 'Download' to start downloading.`.trim())
        }
      } else {
        setStatus("up-to-date")
        setMessage("You are on the latest version.")
      }
    } catch {
      setStatus("error")
      setMessage("Could not check for updates. Please try again.")
    } finally {
      setCheckInFlight(false)
    }
  }

  const downloadUpdate = async () => {
    if (downloadInFlight() || installInFlight() || checkInFlight()) return
    setDownloadInFlight(true)
    setStatus("downloading")
    setDownloadPercent(0)
    setMessage("Starting download...")
    try {
      const result = await nativeApi.invoke("download_update")
      if (result.status === "error") {
        setStatus("error")
        setMessage(`Failed to start download: ${result.message || "Unknown error"}`)
      }
    } catch {
      setStatus("error")
      setMessage("Failed to start update download.")
    } finally {
      setDownloadInFlight(false)
    }
  }

  const installUpdate = async () => {
    if (installInFlight() || checkInFlight()) return
    setInstallInFlight(true)
    setStatus("installing")
    setMessage("Installing update and restarting app...")
    try {
      const result = await nativeApi.invoke("install_update")
      if (result.status === "not-downloaded") {
        setStatus("downloading")
        setMessage("Update is not downloaded yet. Please wait and try again.")
      }
    } catch {
      setStatus("error")
      setMessage("Failed to install update.")
    } finally {
      setInstallInFlight(false)
    }
  }

  return (
    <div class="space-y-5">
      <h2 class="text-lg font-semibold">About shob</h2>

      <section class="overflow-hidden rounded-xl border border-border bg-card">
        <div class="flex items-center gap-3 px-5 py-4">
          <Ico class="h-9 w-9 rounded-lg object-cover" />
          <p class="text-2xl font-semibold leading-none text-foreground">{appName()}</p>
        </div>

        <div class="border-t border-border px-5 py-4">
          <div class="flex items-start gap-3">
            <CheckCircle2 class="mt-0.5 h-4 w-4 text-blue-400" />
            <div class="space-y-1">
              <p class="text-sm text-foreground">
                {status() === "up-to-date" ? "shob is up to date" : status() === "available" || updateDownloaded() ? "Update available for shob" : "Check update status"}
              </p>
              <p class="text-sm text-muted-foreground">shob {version()} (Official Build)</p>
              <Show when={latestVersion()}>
                <p class="text-sm text-muted-foreground">Latest found: {latestVersion()}</p>
              </Show>
            </div>
          </div>
        </div>

        <div class="border-t border-border px-5 py-4">
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={isBusy()} onClick={() => void checkForUpdates()}>
              {status() === "checking" ? "Checking..." : status() === "downloading" ? "Downloading..." : status() === "installing" ? "Installing..." : "Check for updates"}
            </Button>
            <Show when={status() === "available" && !updateDownloaded()}>
              <Button type="button" disabled={isBusy()} onClick={() => void downloadUpdate()}>
                Download
              </Button>
            </Show>
            <Show when={updateDownloaded()}>
              <Button type="button" disabled={installInFlight() || checkInFlight()} onClick={() => void installUpdate()}>
                Restart to install
              </Button>
            </Show>
          </div>
          
          <Show when={status() === "downloading"}>
            <div class="mt-4 space-y-1.5 max-w-sm animate-in fade-in duration-200">
              <div class="flex items-center justify-between text-xs font-semibold text-foreground/80">
                <span>Downloading...</span>
                <span>{downloadPercent().toFixed(0)}%</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-secondary/80 border border-border/40">
                <div
                  style={{ width: `${downloadPercent()}%` }}
                  class="h-full bg-blue-500 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                />
              </div>
            </div>
          </Show>

          <p class="mt-3 text-sm text-muted-foreground">{message()}</p>
          <Show when={lastCheckedAt()}>
            <p class="mt-1 text-xs text-muted-foreground">Last checked: {lastCheckedAt()}</p>
          </Show>
        </div>
      </section>

      <section class="rounded-xl border border-border bg-card px-5 py-4">
        <p class="text-base text-foreground">shob</p>
        <p class="mt-1 text-sm text-muted-foreground">Copyright © 2026 The shob Authors. All rights reserved.</p>
        <p class="mt-4 text-sm leading-6 text-foreground">
          shob is an AI agent built to do real work for you. Delegate coding tasks, automate repetitive workflows, review changes, and ship faster with a reliable AI teammate that stays in your flow.
        </p>
      </section>
    </div>
  )
}

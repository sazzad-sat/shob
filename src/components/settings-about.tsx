import { createSignal, onMount, Show } from "solid-js"
import { Button } from "@/components/ui/button"
import { nativeApi } from "@/services/native"
import shobLogo from "@/assets/icon/shob.png"
import { CheckCircle2 } from "lucide-solid"

type AboutStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error" | "installing" | "dev"

export function SettingsAbout() {
  const [appName, setAppName] = createSignal("Shob")
  const [version, setVersion] = createSignal("Unknown")
  const [latestVersion, setLatestVersion] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<AboutStatus>("idle")
  const [message, setMessage] = createSignal("Check for updates to see if a newer version is available.")
  const [updateDownloaded, setUpdateDownloaded] = createSignal(false)
  const [lastCheckedAt, setLastCheckedAt] = createSignal<string | null>(null)
  const [checkInFlight, setCheckInFlight] = createSignal(false)
  const [installInFlight, setInstallInFlight] = createSignal(false)

  const isBusy = () =>
    checkInFlight() ||
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
      const result = await nativeApi.invoke("check_for_updates", { manual: false })
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
          setStatus("downloading")
          setMessage(`Update ${result.version ?? ""} found. Downloading in the background...`.trim())
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
          <img src={shobLogo} alt="shob logo" class="h-9 w-9 rounded-lg object-cover" />
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
            <Show when={updateDownloaded() || status() === "available"}>
              <Button type="button" disabled={installInFlight() || checkInFlight()} onClick={() => void installUpdate()}>
                Restart to install
              </Button>
            </Show>
          </div>
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

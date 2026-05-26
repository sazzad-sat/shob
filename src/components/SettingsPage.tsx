import { createMemo, createSignal, For, Show } from "solid-js"
import { Boxes, SlidersHorizontal, Box, CircleHelp } from "lucide-solid"
import { SettingsProviders } from "./opencode-settings/settings-providers"
import { SettingsModels } from "./opencode-settings/settings-models"
import { SettingsAbout } from "./settings-about"
import { useStore } from "../store"
import { OPEN_CODE_THEME_LIST } from "../theme"
import { CliAvatar } from "./CliAvatar"
import { Button } from "@/components/ui/button"

type SettingsSection = "general" | "providers" | "models" | "about"

const getShellLabel = (shell: string) => shell.split(/[\\/]/).pop() || shell

export function SettingsPage() {
  const preferredCliId = useStore((s) => s.preferredCliId)
  const preferredShell = useStore((s) => s.preferredShell)
  const cliTools = useStore((s) => s.cliTools)
  const availableShells = useStore((s) => s.availableShells)
  const setPreferredCliTool = useStore((s) => s.setPreferredCliTool)
  const setPreferredShell = useStore((s) => s.setPreferredShell)
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const setThemeId = useStore((s) => s.setThemeId)
  const setColorScheme = useStore((s) => s.setColorScheme)
  const [section, setSection] = createSignal<SettingsSection>("general")

  const installedCliTools = createMemo(() => cliTools().filter((tool) => tool.installed))

  return (
    <div class="min-h-0 flex-1 bg-background text-foreground">
      <div class="flex h-full">
        <aside class="w-[220px] border-r border-border p-3">
          <div class="grid gap-1">
            <Button type="button" variant={section() === "general" ? "secondary" : "ghost"} class="justify-start" onClick={() => setSection("general")}>
              <SlidersHorizontal class="mr-2 h-4 w-4" /> General
            </Button>
            <Button type="button" variant={section() === "providers" ? "secondary" : "ghost"} class="justify-start" onClick={() => setSection("providers")}>
              <Boxes class="mr-2 h-4 w-4" /> Providers
            </Button>
            <Button type="button" variant={section() === "models" ? "secondary" : "ghost"} class="justify-start" onClick={() => setSection("models")}>
              <Box class="mr-2 h-4 w-4" /> Models
            </Button>
            <Button type="button" variant={section() === "about" ? "secondary" : "ghost"} class="justify-start" onClick={() => setSection("about")}>
              <CircleHelp class="mr-2 h-4 w-4" /> About
            </Button>
          </div>
        </aside>

        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
          <Show when={section() === "general"}>
            <div class="space-y-6">
              <h2 class="text-lg font-semibold">General</h2>

              <div class="rounded-lg border border-border bg-card p-4">
                <label class="mb-2 block text-sm text-muted-foreground">Color Scheme</label>
                <select
                  value={colorScheme()}
                  onChange={(event) => setColorScheme(event.currentTarget.value === "light" ? "light" : event.currentTarget.value === "dark" ? "dark" : "system")}
                  class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div class="rounded-lg border border-border bg-card p-4">
                <label class="mb-2 block text-sm text-muted-foreground">Theme</label>
                <select
                  value={themeId()}
                  onChange={(event) => setThemeId(event.currentTarget.value)}
                  class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <For each={OPEN_CODE_THEME_LIST}>{(theme) => <option value={theme.id}>{theme.name}</option>}</For>
                </select>
              </div>

              <div class="rounded-lg border border-border bg-card p-4">
                <label class="mb-2 block text-sm text-muted-foreground">Default CLI</label>
                <div class="flex items-center gap-2">
                  <span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <CliAvatar cliId={preferredCliId() ?? installedCliTools()[0]?.id ?? null} label="Default CLI" size="sm" />
                  </span>
                  <select
                    value={preferredCliId() ?? installedCliTools()[0]?.id ?? ""}
                    onChange={(event) => setPreferredCliTool(event.currentTarget.value || null)}
                    class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <Show when={installedCliTools().length > 0} fallback={<option value="" disabled>No CLI tools detected</option>}>
                      <For each={installedCliTools()}>{(tool) => <option value={tool.id}>{tool.label}</option>}</For>
                    </Show>
                  </select>
                </div>
              </div>

              <div class="rounded-lg border border-border bg-card p-4">
                <label class="mb-2 block text-sm text-muted-foreground">Default Shell</label>
                <select
                  value={preferredShell() ?? availableShells()[0] ?? ""}
                  onChange={(event) => setPreferredShell(event.currentTarget.value || null)}
                  class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <Show when={availableShells().length > 0} fallback={<option value="" disabled>No shells detected</option>}>
                    <For each={availableShells()}>{(shell) => <option value={shell}>{getShellLabel(shell)}</option>}</For>
                  </Show>
                </select>
              </div>
            </div>
          </Show>

          <Show when={section() === "providers"}>
            <SettingsProviders />
          </Show>

          <Show when={section() === "models"}>
            <SettingsModels />
          </Show>

          <Show when={section() === "about"}>
            <SettingsAbout />
          </Show>
        </div>
      </div>
    </div>
  )
}


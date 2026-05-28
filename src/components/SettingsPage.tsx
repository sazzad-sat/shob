import { createMemo, createSignal, For, Show } from "solid-js"
import { Boxes, SlidersHorizontal, Box, CircleHelp, Monitor, Sun, Moon, Check, Search, Terminal } from "lucide-solid"
import { SettingsProviders } from "./opencode-settings/settings-providers"
import { SettingsModels } from "./opencode-settings/settings-models"
import { SettingsAbout } from "./settings-about"
import { useStore } from "../store"
import { OPEN_CODE_THEME_LIST } from "../theme"
import { CliAvatar } from "./CliAvatar"
import { Button } from "@/components/ui/button"

type SettingsSection = "general" | "providers" | "models" | "about"

const getShellLabel = (shell: string) => shell.split(/[\\/]/).pop() || shell

function getThemeColors(theme: any, isDark: boolean) {
  const variant = isDark ? theme.dark : theme.light
  const palette = variant?.palette || variant?.seeds
  return {
    background: palette?.neutral ?? (isDark ? "#121214" : "#f4f4f6"),
    primary: palette?.primary ?? "#3b82f6",
    accent: palette?.accent ?? palette?.info ?? "#eab308",
    success: palette?.success ?? "#22c55e",
  }
}

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

  const [themeSearchQuery, setThemeSearchQuery] = createSignal("")

  const installedCliTools = createMemo(() => cliTools().filter((tool) => tool.installed))

  const isDark = createMemo(() => {
    const scheme = colorScheme()
    if (scheme === 'dark') return true
    if (scheme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const filteredThemes = createMemo(() => {
    const query = themeSearchQuery().toLowerCase().trim()
    if (!query) return OPEN_CODE_THEME_LIST
    return OPEN_CODE_THEME_LIST.filter(theme => theme.name.toLowerCase().includes(query))
  })

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
            <div class="space-y-6 max-w-3xl">
              <div>
                <h2 class="text-xl font-bold text-foreground">General Settings</h2>
                <p class="text-sm text-muted-foreground mt-1">Customize the interface appearance, default runtime tools, and shells.</p>
              </div>

              {/* Color Scheme Picker */}
              <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs space-y-4">
                <div>
                  <h3 class="font-medium text-foreground text-sm">Color Scheme</h3>
                  <p class="text-xs text-muted-foreground mt-0.5">Select a default brightness appearance for the application.</p>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {/* System */}
                  <button
                    type="button"
                    onClick={() => setColorScheme("system")}
                    class={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer outline-none select-none group relative active:scale-[0.98] ${
                      colorScheme() === "system"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/30 shadow-md"
                        : "border-border/60 bg-card/20 hover:bg-card/60 hover:border-border hover:scale-[1.01] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div class="relative w-full aspect-video rounded-lg border border-border/60 bg-muted/15 mb-2.5 overflow-hidden flex items-center justify-center">
                      <div class="absolute inset-0 flex rotate-12 scale-150">
                        <div class="w-1/2 h-full bg-white/5" />
                        <div class="w-1/2 h-full bg-black/30 border-l border-white/5" />
                      </div>
                      <Monitor class="h-5 w-5 text-foreground/80 relative z-10" />
                    </div>
                    <span class="text-xs font-semibold">System</span>
                    <Show when={colorScheme() === "system"}>
                      <div class="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm scale-90 animate-in zoom-in-50 duration-200">
                        <Check class="h-3 w-3 stroke-[3]" />
                      </div>
                    </Show>
                  </button>

                  {/* Light */}
                  <button
                    type="button"
                    onClick={() => setColorScheme("light")}
                    class={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer outline-none select-none group relative active:scale-[0.98] ${
                      colorScheme() === "light"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/30 shadow-md"
                        : "border-border/60 bg-card/20 hover:bg-card/60 hover:border-border hover:scale-[1.01] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div class="relative w-full aspect-video rounded-lg border border-border/60 bg-white mb-2.5 overflow-hidden flex items-center justify-center shadow-xs">
                      <Sun class="h-5 w-5 text-amber-500 relative z-10" />
                    </div>
                    <span class="text-xs font-semibold">Light</span>
                    <Show when={colorScheme() === "light"}>
                      <div class="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm scale-90 animate-in zoom-in-50 duration-200">
                        <Check class="h-3 w-3 stroke-[3]" />
                      </div>
                    </Show>
                  </button>

                  {/* Dark */}
                  <button
                    type="button"
                    onClick={() => setColorScheme("dark")}
                    class={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer outline-none select-none group relative active:scale-[0.98] ${
                      colorScheme() === "dark"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/30 shadow-md"
                        : "border-border/60 bg-card/20 hover:bg-card/60 hover:border-border hover:scale-[1.01] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div class="relative w-full aspect-video rounded-lg border border-border/60 bg-zinc-950 mb-2.5 overflow-hidden flex items-center justify-center">
                      <Moon class="h-5 w-5 text-sky-400 relative z-10" />
                    </div>
                    <span class="text-xs font-semibold">Dark</span>
                    <Show when={colorScheme() === "dark"}>
                      <div class="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm scale-90 animate-in zoom-in-50 duration-200">
                        <Check class="h-3 w-3 stroke-[3]" />
                      </div>
                    </Show>
                  </button>
                </div>
              </div>

              {/* Theme Picker */}
              <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <h3 class="font-medium text-foreground text-sm">Theme</h3>
                    <p class="text-xs text-muted-foreground mt-0.5">Select a design theme context for color tokens.</p>
                  </div>
                  <div class="relative w-48 shrink-0">
                    <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search themes..."
                      value={themeSearchQuery()}
                      onInput={(e) => setThemeSearchQuery(e.currentTarget.value)}
                      class="h-8 w-full rounded-lg border border-input bg-background/50 pl-8 pr-3 text-xs placeholder:text-muted-foreground/80 focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1 thin-scrollbar">
                  <For each={filteredThemes()}>
                    {(theme) => {
                      const colors = getThemeColors(theme, isDark())
                      const isSelected = themeId() === theme.id
                      return (
                        <button
                          type="button"
                          onClick={() => setThemeId(theme.id)}
                          style={isSelected ? { "border-color": colors.primary, "box-shadow": `0 0 10px ${colors.primary}12` } : {}}
                          class={`flex items-center justify-between p-2.5 rounded-lg border transition-all duration-150 cursor-pointer outline-none select-none text-left active:scale-[0.98] ${
                            isSelected
                              ? "bg-secondary/70 text-foreground border-2"
                              : "border-border/60 bg-card/10 hover:bg-card/40 hover:border-border/80 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span class="text-xs font-semibold truncate text-foreground pr-2">{theme.name}</span>

                          {/* Overlapping swatch dots */}
                          <div class="flex items-center shrink-0">
                            <span
                              style={{ "background-color": colors.background }}
                              class="h-3 w-3 rounded-full border border-border shadow-xs -mr-1 z-10 shrink-0"
                            />
                            <span
                              style={{ "background-color": colors.primary }}
                              class="h-3 w-3 rounded-full border border-border shadow-xs -mr-1 z-20 shrink-0"
                            />
                            <span
                              style={{ "background-color": colors.accent }}
                              class="h-3 w-3 rounded-full border border-border shadow-xs -mr-1 z-30 shrink-0"
                            />
                            <span
                              style={{ "background-color": colors.success }}
                              class="h-3 w-3 rounded-full border border-border shadow-xs z-40 shrink-0"
                            />
                          </div>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </div>

              {/* Default CLI */}
              <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs space-y-4">
                <div>
                  <h3 class="font-medium text-foreground text-sm">Default CLI</h3>
                  <p class="text-xs text-muted-foreground mt-0.5">Select the default Agent CLI runtime tool to execute commands.</p>
                </div>
                <Show
                  when={installedCliTools().length > 0}
                  fallback={
                    <div class="flex flex-col items-center justify-center p-6 border border-dashed border-border/60 rounded-xl bg-card/10 text-center">
                      <Box class="h-8 w-8 text-muted-foreground/60 mb-2" />
                      <div class="text-xs text-muted-foreground font-medium">No installed CLI tools detected</div>
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <For each={installedCliTools()}>
                      {(tool) => {
                        const isSelected = (preferredCliId() ?? installedCliTools()[0]?.id) === tool.id
                        return (
                          <button
                            type="button"
                            onClick={() => setPreferredCliTool(tool.id)}
                            class={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none select-none relative active:scale-[0.98] ${
                              isSelected
                                ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/30 shadow-md"
                                : "border-border/60 bg-card/20 hover:bg-card/60 hover:border-border hover:scale-[1.01] text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border shadow-xs shrink-0">
                              <CliAvatar cliId={tool.id} label={tool.label} size="sm" />
                            </span>
                            <div class="min-w-0 flex-1">
                              <div class="text-xs font-semibold text-foreground truncate">{tool.label}</div>
                              <div class="text-[10px] text-muted-foreground font-medium truncate mt-0.5">Installed Agent</div>
                            </div>
                            <Show when={isSelected}>
                              <div class="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm scale-90 animate-in zoom-in-50 duration-200">
                                <Check class="h-3 w-3 stroke-[3]" />
                              </div>
                            </Show>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              {/* Default Shell */}
              <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs space-y-4">
                <div>
                  <h3 class="font-medium text-foreground text-sm">Default Shell</h3>
                  <p class="text-xs text-muted-foreground mt-0.5">Select the preferred shell executable environment for terminals.</p>
                </div>
                <Show
                  when={availableShells().length > 0}
                  fallback={
                    <div class="flex flex-col items-center justify-center p-6 border border-dashed border-border/60 rounded-xl bg-card/10 text-center">
                      <Terminal class="h-8 w-8 text-muted-foreground/60 mb-2" />
                      <div class="text-xs text-muted-foreground font-medium">No terminal shells detected</div>
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <For each={availableShells()}>
                      {(shell) => {
                        const isSelected = (preferredShell() ?? availableShells()[0]) === shell
                        return (
                          <button
                            type="button"
                            onClick={() => setPreferredShell(shell)}
                            class={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none select-none relative active:scale-[0.98] ${
                              isSelected
                                ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/30 shadow-md"
                                : "border-border/60 bg-card/20 hover:bg-card/60 hover:border-border hover:scale-[1.01] text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border shadow-xs shrink-0">
                              <Terminal class="h-4 w-4 text-foreground/80" />
                            </span>
                            <div class="min-w-0 flex-1">
                              <div class="text-xs font-semibold text-foreground truncate">{getShellLabel(shell)}</div>
                              <div class="text-[9px] text-muted-foreground font-mono truncate mt-0.5">{shell}</div>
                            </div>
                            <Show when={isSelected}>
                              <div class="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm scale-90 animate-in zoom-in-50 duration-200">
                                <Check class="h-3 w-3 stroke-[3]" />
                              </div>
                            </Show>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </Show>
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


import { createMemo, createSignal, For, Show } from "solid-js"
import { Boxes, SlidersHorizontal, Box, CircleHelp, Monitor, Sun, Moon, Check, Search, Terminal, Settings, X } from "lucide-solid"
import { SettingsProviders } from "./opencode-settings/settings-providers"
import { SettingsModels } from "./opencode-settings/settings-models"
import { SettingsAbout } from "./settings-about"
import { useStore } from "../store"
import { OPEN_CODE_THEME_LIST } from "../theme"
import { useSettings } from "@/context/settings"
import { Switch } from "@/components/ui/switch"

type SettingsSection = "general" | "providers" | "models" | "about"

const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Theme, appearance, and terminal defaults",
    icon: SlidersHorizontal,
    keywords: ["appearance", "theme", "color", "shell", "terminal"],
  },
  {
    id: "providers",
    label: "Providers",
    description: "Connected accounts and API providers",
    icon: Boxes,
    keywords: ["provider", "api", "account", "connect", "key"],
  },
  {
    id: "models",
    label: "Models",
    description: "Visible models and provider catalogs",
    icon: Box,
    keywords: ["model", "ai", "visibility", "provider"],
  },
  {
    id: "about",
    label: "About",
    description: "App version and update controls",
    icon: CircleHelp,
    keywords: ["version", "update", "about", "release"],
  },
] as const

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

function AgentTimelineToggle(props: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div class="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/25 px-3 py-2.5">
      <div class="min-w-0">
        <div class="truncate text-xs font-semibold text-foreground">{props.title}</div>
        <div class="mt-0.5 text-[11px] leading-4 text-muted-foreground">{props.description}</div>
      </div>
      <Switch
        size="default"
        checked={props.checked}
        onChange={props.onChange}
        aria-label={props.title}
      />
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const preferredShell = useStore((s) => s.preferredShell)
  const availableShells = useStore((s) => s.availableShells)
  const setPreferredShell = useStore((s) => s.setPreferredShell)
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const setThemeId = useStore((s) => s.setThemeId)
  const setColorScheme = useStore((s) => s.setColorScheme)
  const [section, setSection] = createSignal<SettingsSection>("general")
  const [settingsSearchQuery, setSettingsSearchQuery] = createSignal("")
  const [themeSearchQuery, setThemeSearchQuery] = createSignal("")

  const isDark = createMemo(() => {
    const scheme = colorScheme()
    if (scheme === 'dark') return true
    if (scheme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const activeSection = createMemo(() => SETTINGS_SECTIONS.find((item) => item.id === section()) ?? SETTINGS_SECTIONS[0])

  const filteredSettingsSections = createMemo(() => {
    const query = settingsSearchQuery().toLowerCase().trim()
    if (!query) return SETTINGS_SECTIONS
    return SETTINGS_SECTIONS.filter((item) =>
      item.label.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.keywords.some((keyword) => keyword.includes(query))
    )
  })

  const selectedTheme = createMemo(() => OPEN_CODE_THEME_LIST.find((theme) => theme.id === themeId()) ?? OPEN_CODE_THEME_LIST[0])

  const selectedShell = createMemo(() => preferredShell() ?? availableShells()[0] ?? null)

  const colorSchemeLabel = createMemo(() => {
    const scheme = colorScheme()
    if (scheme === "light") return "Light"
    if (scheme === "dark") return "Dark"
    return "System"
  })

  const filteredThemes = createMemo(() => {
    const query = themeSearchQuery().toLowerCase().trim()
    if (!query) return OPEN_CODE_THEME_LIST
    return OPEN_CODE_THEME_LIST.filter(theme => theme.name.toLowerCase().includes(query))
  })

  return (
    <div class="min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div class="flex h-full min-h-0">
        <aside class="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-background/80 p-3">
          <div class="min-w-0 px-1 pb-4">
            <div class="flex items-center gap-2">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card/45">
                <Settings class="h-4 w-4 text-muted-foreground" />
              </span>
              <div class="min-w-0">
                <h1 class="truncate text-[15px] font-semibold leading-5 text-foreground">Settings</h1>
              </div>
            </div>
          </div>

          <div class="relative mb-3.5 min-w-0">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search settings"
              value={settingsSearchQuery()}
              onInput={(event) => setSettingsSearchQuery(event.currentTarget.value)}
              class="h-9 w-full rounded-lg border border-border/70 bg-card/30 pl-9 pr-8 text-[14px] font-medium text-foreground outline-none placeholder:text-muted-foreground/75 focus:border-ring focus:ring-1 focus:ring-ring/50"
            />
            <Show when={settingsSearchQuery()}>
              <button
                type="button"
                aria-label="Clear settings search"
                onClick={() => setSettingsSearchQuery("")}
                class="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </Show>
          </div>

          <nav class="grid min-w-0 gap-1.5 overflow-hidden">
            <Show
              when={filteredSettingsSections().length > 0}
              fallback={<div class="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[13px] text-muted-foreground">No settings found</div>}
            >
              <For each={filteredSettingsSections()}>
                {(item) => {
                  const Icon = item.icon
                  const isActive = () => section() === item.id

                  return (
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={isActive() ? "page" : undefined}
                      class={`group flex h-11 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border px-3 text-left outline-none transition-colors ${
                        isActive()
                          ? "border-primary/50 bg-secondary/90 text-foreground ring-1 ring-primary/25"
                          : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      }`}
                    >
                      <span class={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        isActive()
                          ? "border-border bg-background"
                          : "border-transparent bg-transparent group-hover:border-border/60 group-hover:bg-background/60"
                      }`}>
                        <Icon class="h-4 w-4" />
                      </span>
                      <span class="min-w-0 flex-1 truncate text-[14px] font-semibold leading-none">{item.label}</span>
                    </button>
                  )
                }}
              </For>
            </Show>
          </nav>
        </aside>

        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Show when={section() === "general"}>
            <div class="w-full max-w-[980px] space-y-5 p-6 lg:p-8">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 class="text-xl font-semibold text-foreground">{activeSection().label}</h2>
                  <p class="mt-1 text-sm text-muted-foreground">{activeSection().description}</p>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground">
                    {colorSchemeLabel()}
                  </span>
                  <span class="max-w-44 truncate rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground">
                    {selectedTheme()?.name ?? "Theme"}
                  </span>
                  <span class="max-w-44 truncate rounded-md border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground">
                    {selectedShell() ? getShellLabel(selectedShell()!) : "No shell"}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div class="rounded-lg border border-border/70 bg-card/30 p-3">
                  <span class="block text-[11px] text-muted-foreground">Appearance</span>
                  <span class="mt-1 block truncate text-sm font-medium text-foreground">{colorSchemeLabel()}</span>
                </div>
                <div class="rounded-lg border border-border/70 bg-card/30 p-3">
                  <span class="block text-[11px] text-muted-foreground">Theme</span>
                  <span class="mt-1 block truncate text-sm font-medium text-foreground">{selectedTheme()?.name ?? "Default"}</span>
                </div>
                <div class="rounded-lg border border-border/70 bg-card/30 p-3">
                  <span class="block text-[11px] text-muted-foreground">Terminal</span>
                  <span class="mt-1 block truncate text-sm font-medium text-foreground">{selectedShell() ? getShellLabel(selectedShell()!) : "Not detected"}</span>
                </div>
              </div>

              {/* Color Scheme Picker */}
              <div class="space-y-4 rounded-lg border border-border/70 bg-card/30 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-medium text-foreground">Color Scheme</h3>
                    <p class="mt-0.5 text-xs text-muted-foreground">Choose the brightness behavior for the app.</p>
                  </div>
                  <span class="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{colorSchemeLabel()}</span>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  {/* System */}
                  <button
                    type="button"
                    onClick={() => setColorScheme("system")}
                    class={`relative flex min-h-[112px] flex-col items-center justify-center rounded-lg border p-3 text-center outline-none transition-colors ${
                      colorScheme() === "system"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/25"
                        : "border-border/60 bg-background/30 text-muted-foreground hover:border-border hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    <div class="relative mb-2.5 flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/15">
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
                    class={`relative flex min-h-[112px] flex-col items-center justify-center rounded-lg border p-3 text-center outline-none transition-colors ${
                      colorScheme() === "light"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/25"
                        : "border-border/60 bg-background/30 text-muted-foreground hover:border-border hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    <div class="relative mb-2.5 flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white">
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
                    class={`relative flex min-h-[112px] flex-col items-center justify-center rounded-lg border p-3 text-center outline-none transition-colors ${
                      colorScheme() === "dark"
                        ? "border-primary bg-secondary/80 text-foreground ring-1 ring-primary/25"
                        : "border-border/60 bg-background/30 text-muted-foreground hover:border-border hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    <div class="relative mb-2.5 flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-zinc-950">
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
              <div class="space-y-4 rounded-lg border border-border/70 bg-card/30 p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 class="text-sm font-medium text-foreground">Theme</h3>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {filteredThemes().length} theme{filteredThemes().length === 1 ? "" : "s"} available
                    </p>
                  </div>
                  <div class="relative w-full shrink-0 sm:w-56">
                    <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search themes..."
                      value={themeSearchQuery()}
                      onInput={(e) => setThemeSearchQuery(e.currentTarget.value)}
                      class="h-8 w-full rounded-lg border border-input bg-background/50 pl-8 pr-8 text-xs outline-none placeholder:text-muted-foreground/80 focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                    <Show when={themeSearchQuery()}>
                      <button
                        type="button"
                        aria-label="Clear theme search"
                        onClick={() => setThemeSearchQuery("")}
                        class="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X class="h-3.5 w-3.5" />
                      </button>
                    </Show>
                  </div>
                </div>

                <Show
                  when={filteredThemes().length > 0}
                  fallback={<div class="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-xs text-muted-foreground">No themes found</div>}
                >
                  <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <For each={filteredThemes()}>
                      {(theme) => {
                        const colors = getThemeColors(theme, isDark())
                        const isSelected = () => themeId() === theme.id
                        return (
                          <button
                            type="button"
                            onClick={() => setThemeId(theme.id)}
                            aria-pressed={isSelected()}
                            style={isSelected() ? { "border-color": colors.primary } : undefined}
                            class={`flex items-center justify-between rounded-lg border p-2.5 text-left outline-none transition-colors ${
                              isSelected()
                                ? "bg-secondary text-foreground ring-1 ring-primary/35"
                                : "border-border/60 bg-background/25 text-muted-foreground hover:border-border/80 hover:bg-background/60 hover:text-foreground"
                            }`}
                          >
                            <span class="min-w-0 pr-2">
                              <span class="block truncate text-xs font-semibold text-foreground">{theme.name}</span>
                              <span class={`block text-[10px] ${isSelected() ? "text-primary" : "text-muted-foreground"}`}>
                                {isSelected() ? "Selected" : "Theme"}
                              </span>
                            </span>

                            <div class="flex shrink-0 items-center gap-2">
                              <Show when={isSelected()}>
                                <span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Check class="h-3 w-3 stroke-[3]" />
                                </span>
                              </Show>
                              {/* Overlapping swatch dots */}
                              <div class="flex items-center">
                                <span
                                  style={{ "background-color": colors.background }}
                                  class="z-10 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                                />
                                <span
                                  style={{ "background-color": colors.primary }}
                                  class="z-20 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                                />
                                <span
                                  style={{ "background-color": colors.accent }}
                                  class="z-30 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                                />
                                <span
                                  style={{ "background-color": colors.success }}
                                  class="z-40 h-3 w-3 shrink-0 rounded-full border border-border"
                                />
                              </div>
                            </div>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              <div class="space-y-4 rounded-lg border border-border/70 bg-card/30 p-4">
                <div>
                  <h3 class="text-sm font-medium text-foreground">Agent timeline</h3>
                  <p class="mt-0.5 text-xs text-muted-foreground">Choose which agent details open in chat.</p>
                </div>
                <div class="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                  <AgentTimelineToggle
                    title="Reasoning"
                    description="Show model summaries in the timeline."
                    checked={settings.general.showReasoningSummaries()}
                    onChange={settings.general.setShowReasoningSummaries}
                  />
                  <AgentTimelineToggle
                    title="Shell output"
                    description="Open command output by default."
                    checked={settings.general.shellToolPartsExpanded()}
                    onChange={settings.general.setShellToolPartsExpanded}
                  />
                  <AgentTimelineToggle
                    title="File edits"
                    description="Open edit, write, and patch details."
                    checked={settings.general.editToolPartsExpanded()}
                    onChange={settings.general.setEditToolPartsExpanded}
                  />
                </div>
              </div>

              {/* Default Shell */}
              <div class="space-y-4 rounded-lg border border-border/70 bg-card/30 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-medium text-foreground">Default Shell</h3>
                    <p class="mt-0.5 text-xs text-muted-foreground">Set the terminal environment used by new sessions.</p>
                  </div>
                  <Show when={selectedShell()}>
                    <span class="max-w-48 truncate rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {getShellLabel(selectedShell()!)}
                    </span>
                  </Show>
                </div>
                <Show
                  when={availableShells().length > 0}
                  fallback={
                    <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/25 p-6 text-center">
                      <Terminal class="h-8 w-8 text-muted-foreground/60 mb-2" />
                      <div class="text-xs text-muted-foreground font-medium">No terminal shells detected</div>
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <For each={availableShells()}>
                      {(shell) => {
                        const isSelected = () => selectedShell() === shell
                        return (
                          <button
                            type="button"
                            onClick={() => setPreferredShell(shell)}
                            aria-pressed={isSelected()}
                            class={`relative flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left outline-none transition-colors ${
                              isSelected()
                                ? "border-primary bg-secondary text-foreground ring-1 ring-primary/35"
                                : "border-border/60 bg-background/25 text-muted-foreground hover:border-border hover:bg-background/60 hover:text-foreground"
                            }`}
                          >
                            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                              <Terminal class="h-4 w-4 text-foreground/80" />
                            </span>
                            <div class="min-w-0 flex-1">
                              <div class="text-xs font-semibold text-foreground truncate">{getShellLabel(shell)}</div>
                              <div class={`text-[9px] font-mono truncate mt-0.5 ${isSelected() ? "text-primary" : "text-muted-foreground"}`}>
                                {isSelected() ? "Selected shell" : shell}
                              </div>
                            </div>
                            <Show when={isSelected()}>
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
            <div class="w-full max-w-[980px] p-6 lg:p-8">
              <SettingsAbout />
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}


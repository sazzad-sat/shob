import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { Blocks, Boxes, SlidersHorizontal, Box, CircleHelp } from "lucide-solid"
import { SettingsProviders } from "./shob-settings/settings-providers"
import { SettingsModels } from "./shob-settings/settings-models"
import { SettingsAbout } from "./settings-about"
import { SettingsPlugins } from "./settings-plugins"
import { useStore } from "../store"
import { applyAppTheme, getThemeById, SHOB_THEME_LIST, resolveThemeMode, type ShobTheme } from "../theme"
import { Combobox, ComboboxContent, ComboboxControl, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type SettingsSection = "general" | "plugins" | "providers" | "models" | "about"

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
    id: "plugins",
    label: "Plugins",
    description: "Install skills and workflows",
    icon: Blocks,
    keywords: ["plugin", "plugins", "skill", "skills", "store", "marketplace"],
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

const COLOR_SCHEME_OPTIONS = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const

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

function SettingsRow(props: {
  title: string
  description?: string
  children: JSX.Element
}) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 px-3 py-3.5 last:border-b-0 sm:px-4">
      <div class="min-w-[180px] flex-1">
        <div class="truncate text-[13px] font-medium leading-5 text-foreground">{props.title}</div>
        <Show when={props.description}>
          <div class="text-[12px] leading-5 text-muted-foreground">{props.description}</div>
        </Show>
      </div>
      <div class="min-w-0" style={{ width: "min(100%, 240px)" }}>
        {props.children}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const preferredShell = useStore((s) => s.preferredShell)
  const availableShells = useStore((s) => s.availableShells)
  const setPreferredShell = useStore((s) => s.setPreferredShell)
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const setThemeId = useStore((s) => s.setThemeId)
  const setColorScheme = useStore((s) => s.setColorScheme)
  const [section, setSection] = createSignal<SettingsSection>("general")

  const isDark = createMemo(() => {
    const scheme = colorScheme()
    if (scheme === 'dark') return true
    if (scheme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const activeSection = createMemo(() => SETTINGS_SECTIONS.find((item) => item.id === section()) ?? SETTINGS_SECTIONS[0])

  const committedTheme = createMemo(() => getThemeById(themeId()))

  const selectedShell = createMemo(() => preferredShell() ?? availableShells()[0] ?? null)

  let previewThemeTimeoutId: number | null = null
  let pendingThemePreviewId: string | null = null
  let previewedThemeId: string | null = null

  const clearThemePreviewDelay = () => {
    if (previewThemeTimeoutId !== null) {
      window.clearTimeout(previewThemeTimeoutId)
      previewThemeTimeoutId = null
    }
    pendingThemePreviewId = null
  }

  onCleanup(clearThemePreviewDelay)

  const currentThemeMode = () => resolveThemeMode(colorScheme(), isDark() ? "dark" : "light")

  const previewThemeSelection = (nextThemeId: string) => {
    const nextTheme = getThemeById(nextThemeId)
    if (nextTheme.id === themeId()) {
      if (previewedThemeId !== null) {
        previewedThemeId = null
        applyAppTheme(committedTheme(), currentThemeMode())
      }
      return
    }
    if (previewedThemeId === nextTheme.id) return
    previewedThemeId = nextTheme.id
    applyAppTheme(nextTheme, currentThemeMode())
  }

  const scheduleThemePreview = (nextThemeId: string) => {
    const nextTheme = getThemeById(nextThemeId)
    if (pendingThemePreviewId === nextTheme.id || previewedThemeId === nextTheme.id) return
    if (nextTheme.id === themeId() && previewedThemeId === null) return
    clearThemePreviewDelay()
    pendingThemePreviewId = nextTheme.id
    previewThemeTimeoutId = window.setTimeout(() => {
      previewThemeTimeoutId = null
      pendingThemePreviewId = null
      previewThemeSelection(nextTheme.id)
    }, 90)
  }

  const applyThemeSelection = (nextThemeId: string) => {
    clearThemePreviewDelay()
    const nextTheme = getThemeById(nextThemeId)
    previewedThemeId = null
    applyAppTheme(nextTheme, currentThemeMode())
    if (themeId() !== nextTheme.id) setThemeId(nextTheme.id)
  }

  const handleThemeSelectOpenChange = (isOpen: boolean) => {
    clearThemePreviewDelay()
    if (isOpen || previewedThemeId === null) return
    const nextTheme = committedTheme()
    previewedThemeId = null
    applyAppTheme(nextTheme, currentThemeMode())
  }

  return (
    <div class="min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div class="flex h-full min-h-0">
        <aside class="flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-border/50 bg-background p-3">
          <nav class="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div class="px-2 pb-1.5 pt-1 text-[13px] font-medium leading-5 text-muted-foreground/75">Personal</div>
            <div class="grid gap-0.5">
              <For each={SETTINGS_SECTIONS}>
                {(item) => {
                  const Icon = item.icon
                  const isActive = () => section() === item.id

                  return (
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={isActive() ? "page" : undefined}
                      class={`group flex h-8 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-2 text-left outline-none transition-colors ${
                        isActive()
                          ? "bg-muted/65 text-foreground"
                          : "text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <Icon class={`h-4 w-4 shrink-0 transition-colors ${
                        isActive() ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`} />
                      <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5">{item.label}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </nav>
        </aside>

        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Show when={section() === "general"}>
            <div class="w-full max-w-[700px] space-y-5 p-6 lg:p-8">
              <h2 class="text-[15px] font-semibold leading-5 text-foreground">{activeSection().label}</h2>

              <div class="overflow-hidden rounded-lg border border-border/70 bg-card/35">
                <SettingsRow title="Appearance" description="App brightness">
                  <div class="inline-grid h-8 w-full grid-cols-3 rounded-lg bg-muted/70 p-0.5">
                    <For each={COLOR_SCHEME_OPTIONS}>
                      {(item) => (
                        <button
                          type="button"
                          onClick={() => setColorScheme(item.id)}
                          aria-pressed={colorScheme() === item.id}
                          class={`rounded-md px-2 text-[12px] font-medium leading-none outline-none transition-colors ${
                            colorScheme() === item.id
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </button>
                      )}
                    </For>
                  </div>
                </SettingsRow>

                <SettingsRow title="Theme" description="Color palette">
                  <label class="sr-only" for="settings-theme-select">Theme</label>
                  <Combobox
                    options={SHOB_THEME_LIST}
                    optionValue="id"
                    optionTextValue="name"
                    optionLabel="name"
                    value={committedTheme()}
                    onChange={(theme: ShobTheme | null) => {
                      if (theme) applyThemeSelection(theme.id)
                    }}
                    onOpenChange={handleThemeSelectOpenChange}
                    itemComponent={(props: { item: { rawValue: ShobTheme } }) => {
                      const theme = props.item.rawValue
                      const colors = getThemeColors(theme, isDark())

                      return (
                        <ComboboxItem
                          item={props.item}
                          class="min-h-8 cursor-default gap-2 px-2 py-1.5 pr-8 text-[13px] font-medium text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-secondary/80 data-selected:text-foreground"
                          onFocus={() => scheduleThemePreview(theme.id)}
                          onPointerMove={(event: PointerEvent) => {
                            if (event.pointerType === "mouse") scheduleThemePreview(theme.id)
                          }}
                        >
                          <div class="flex min-w-0 flex-1 items-center gap-2">
                            <div class="flex shrink-0 items-center">
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
                            </div>
                            <span class="min-w-0 truncate">{theme.name}</span>
                          </div>
                        </ComboboxItem>
                      )
                    }}
                  >
                    <ComboboxControl>
                      <ComboboxInput id="settings-theme-select" aria-label="Select theme" />
                    </ComboboxControl>
                    <ComboboxContent>
                      <ComboboxList />
                    </ComboboxContent>
                  </Combobox>
                </SettingsRow>

                <SettingsRow title="Integrated terminal shell" description="Default shell for terminals">
                  <Show
                    when={availableShells().length > 0}
                    fallback={
                      <div class="flex h-8 w-full items-center rounded-lg bg-muted/70 px-2.5 text-[13px] font-medium text-muted-foreground">
                        Not detected
                      </div>
                    }
                  >
                    <Select
                      options={availableShells()}
                      value={selectedShell()}
                      onChange={(shell: string | null) => {
                        if (shell) setPreferredShell(shell)
                      }}
                      itemComponent={(props: { item: { rawValue: string } }) => (
                        <SelectItem
                          item={props.item}
                          class="min-h-8 cursor-default px-2 py-1.5 pr-8 text-[13px] font-medium text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-secondary/80 data-selected:text-foreground"
                        >
                          <span class="min-w-0 truncate">{getShellLabel(props.item.rawValue)}</span>
                        </SelectItem>
                      )}
                    >
                      <SelectTrigger
                        class="h-8 w-full border-transparent bg-muted/70 px-2.5 text-[13px] font-medium text-foreground hover:bg-muted"
                        aria-label="Select terminal shell"
                      >
                        <SelectValue>{() => selectedShell() ? getShellLabel(selectedShell()!) : "Not detected"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent class="max-h-56 w-[var(--kb-select-trigger-width)] rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-2xl" />
                    </Select>
                  </Show>
                </SettingsRow>
              </div>
            </div>
          </Show>

          <Show when={section() === "providers"}>
            <SettingsProviders />
          </Show>

          <Show when={section() === "plugins"}>
            <SettingsPlugins />
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


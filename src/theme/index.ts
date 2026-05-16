export type ThemeScheme = 'system' | 'light' | 'dark'

export interface OpenCodeThemeVariant {
  palette?: Record<string, string>
  overrides?: Record<string, string>
}

export interface OpenCodeTheme {
  id: string
  name: string
  light: OpenCodeThemeVariant
  dark: OpenCodeThemeVariant
}

const files = import.meta.glob<{ default: OpenCodeTheme }>("./themes/*.json", { eager: true })

export const OPEN_CODE_THEMES: Record<string, OpenCodeTheme> = Object.fromEntries(
  Object.values(files).map((mod) => [mod.default.id, mod.default]),
)

export const OPEN_CODE_THEME_LIST = Object.values(OPEN_CODE_THEMES).sort((a, b) => a.name.localeCompare(b.name))

const FALLBACK_THEME_ID = 'oc-2'

const toHex = (value: string | undefined, fallback: string) => {
  if (!value) return fallback
  return value.startsWith('#') ? value : `#${value}`
}

export const resolveAppThemeTokens = (theme: OpenCodeTheme, mode: 'light' | 'dark') => {
  const variant = mode === 'dark' ? theme.dark : theme.light
  const palette = variant.palette ?? {}
  const overrides = variant.overrides ?? {}
  const neutral = toHex(palette.neutral, mode === 'dark' ? '#1C1C1C' : '#F8F8F8')
  const ink = toHex(palette.ink, mode === 'dark' ? '#EDEDED' : '#171717')
  const primary = toHex(palette.primary, mode === 'dark' ? '#fab283' : '#dcde8d')
  const accent = toHex((palette as Record<string, string>).accent, mode === 'dark' ? '#2A2A2A' : '#EFEFEF')
  const interactive = toHex((palette as Record<string, string>).interactive ?? palette.info, '#034cff')
  const borderWeak = toHex(overrides['border-weak-base'], mode === 'dark' ? '#2a2a2a' : '#d9d9d9')
  const borderWeaker = toHex(overrides['border-weaker-base'], mode === 'dark' ? '#222222' : '#e8e8e8')
  const raised = toHex(overrides['surface-raised-base'], mode === 'dark' ? '#232323' : '#f3f3f3')
  const hoverSurface = toHex(overrides['surface-base-hover'], mode === 'dark' ? '#2A2A2A' : '#EFEFEF')

  return {
    '--background': toHex(overrides['surface-base'], neutral),
    '--foreground': toHex(overrides['text-strong'], ink),
    '--card': raised,
    '--card-foreground': toHex(overrides['text-strong'], ink),
    '--popover': raised,
    '--popover-foreground': toHex(overrides['text-strong'], ink),
    '--primary': primary,
    '--primary-foreground': neutral,
    '--secondary': raised,
    '--secondary-foreground': toHex(overrides['text-strong'], ink),
    '--muted': hoverSurface,
    '--muted-foreground': toHex(overrides['text-base'], mode === 'dark' ? '#A0A0A0' : '#6F6F6F'),
    '--accent': toHex(overrides['surface-interactive-weak'], accent),
    '--accent-foreground': toHex(overrides['text-strong'], ink),
    '--destructive': toHex(palette.error, '#fc533a'),
    '--border': borderWeak,
    '--input': raised,
    '--ring': interactive,
    '--sidebar': toHex(overrides['surface-base'], neutral),
    '--sidebar-foreground': toHex(overrides['text-strong'], ink),
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': neutral,
    '--sidebar-accent': raised,
    '--sidebar-accent-foreground': toHex(overrides['text-strong'], ink),
    '--sidebar-border': borderWeaker,
    '--sidebar-ring': interactive,
    '--term-bg': toHex(overrides['surface-base'], neutral),
  }
}

export const getThemeById = (id: string | null | undefined): OpenCodeTheme => OPEN_CODE_THEMES[id ?? ''] ?? OPEN_CODE_THEMES[FALLBACK_THEME_ID]

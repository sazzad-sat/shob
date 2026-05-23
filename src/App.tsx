import { createSignal, onCleanup, onMount, ErrorBoundary, createEffect } from 'solid-js'
import { nativeApi } from './services/native'
import { TitleBar } from './components/TitleBar'
import { MainView } from './components/MainView'
import { useStore } from './store'
import { getThemeById, resolveAppThemeTokens } from './theme'

function App() {
  const { loadProjects, loadCliTools, loadAvailableShells } = useStore()
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const [isBooting, setIsBooting] = createSignal(true)
  const [systemMode, setSystemMode] = createSignal<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  onMount(() => {
    const BOOT_TIMEOUT_MS = 4000

    const initialize = async () => {
      try {
        await Promise.race([
          loadProjects(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, BOOT_TIMEOUT_MS)
          }),
        ])
      } catch (error) {
        console.error('App boot initialization failed:', error)
      }

      setIsBooting(false)
    }

    void initialize()
  })

  createEffect(() => {
    const scheme = colorScheme()
    const isDark = scheme === 'dark' || (scheme === 'system' && systemMode() === 'dark')
    const mode = isDark ? 'dark' : 'light'
    const theme = getThemeById(themeId())
    const tokens = resolveAppThemeTokens(theme, mode)
    Object.entries(tokens).forEach(([key, value]) => document.documentElement.style.setProperty(key, value))
    document.documentElement.dataset.theme = theme.id
    document.documentElement.dataset.colorScheme = mode
    document.documentElement.style.colorScheme = mode
    document.documentElement.classList.toggle('dark', mode === 'dark')
    const background = tokens['--background-base'] ?? tokens['--background']
    if (window.shob && background) {
      void nativeApi.invoke('set_window_background', { color: background }).catch(() => undefined)
    }
  })

  onMount(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemMode = () => setSystemMode(mediaQuery.matches ? 'dark' : 'light')

    updateSystemMode()
    mediaQuery.addEventListener('change', updateSystemMode)
    onCleanup(() => mediaQuery.removeEventListener('change', updateSystemMode))
  })

  onMount(() => {
    let timeoutId: number | null = null
    let idleId: number | null = null

    const runDeferredInitialization = () => {
      void Promise.allSettled([loadCliTools(), loadAvailableShells()])
    }

    const scheduleDeferredInitialization = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => {
          runDeferredInitialization()
        }, { timeout: 1500 })
        return
      }

      timeoutId = window.setTimeout(() => {
        runDeferredInitialization()
      }, 250)
    }

    timeoutId = window.setTimeout(scheduleDeferredInitialization, 150)

    onCleanup(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
    })
  })

  onMount(() => {
    const handleBeforeUnload = () => {
      void nativeApi.invoke('cleanup_runtime').catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })



  const fallback = (
    <div class="flex flex-1 items-center justify-center bg-black text-sm text-zinc-300">
      Startup failed to render. Please restart the app.
    </div>
  )

  return (
    <>
      <div class="flex h-full min-h-0 flex-col overflow-hidden">
        <ErrorBoundary fallback={fallback}>
          <TitleBar />
        </ErrorBoundary>
        {isBooting() ? (
          <div class="flex-1 bg-black" />
        ) : (
          <ErrorBoundary fallback={fallback}>
            <MainView />
          </ErrorBoundary>
        )}
      </div>
    </>
  )
}

export default App

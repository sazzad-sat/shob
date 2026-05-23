import { ParentProps, createResource, createMemo, Show, createEffect } from "solid-js"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { LanguageProvider, useLanguage } from "@/context/language"
import { PlatformProvider, Platform } from "@/context/platform"
import { ServerProvider, ServerConnection } from "@/context/server"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { ModelsProvider } from "@/context/models"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { Router } from "@solidjs/router"
import { nativeApi } from "@/services/native"

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

const platform: Platform = {
  platform: "desktop",
  os: "windows",
  openLink: (url) => nativeApi.open(url as any),
  restart: async () => {},
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  notify: async () => {},
  getDefaultServer: async () => {
    try {
      const url = (window.shob as any)?.getServerUrl?.()
      if (url && url !== "http://localhost:4096") return ServerConnection.Key.make(url)
    } catch {}
    return ServerConnection.Key.make("http://localhost:4096")
  },
  setDefaultServer: async (url) => {
    try {
      await (nativeApi.invoke as any)("opencode_server_set_default", url)
    } catch {}
  },
}

const queryClient = new QueryClient()

export function AppProviders(props: ParentProps) {
  let initialServer = ServerConnection.Key.make("http://localhost:4096")
  try {
    const url = (window.shob as any)?.getServerUrl?.()
    if (url && url !== "http://localhost:4096") initialServer = ServerConnection.Key.make(url)
  } catch {}

  const servers = createMemo(() => {
    const items: Array<{ type: "http"; http: { url: string } }> = [
      { type: "http", http: { url: "http://localhost:4096" } },
    ]
    const ds = initialServer
    if (ds) {
      const url: string = ds as unknown as string
      if (url.startsWith("http") && !items.some((s) => s.http.url === url)) {
        items.unshift({ type: "http", http: { url } })
      }
    }
    return items
  })

  return (
    <PlatformProvider value={platform}>
      <LanguageProvider>
        <UiI18nBridge>
            <ServerProvider 
              defaultServer={initialServer} 
              servers={servers()}
            >
              <GlobalSDKProvider>
                <GlobalSyncProvider>
                  <ModelsProvider>
                    <QueryClientProvider client={queryClient}>
                      <DialogProvider>
                        <MarkedProvider>
                          {props.children}
                        </MarkedProvider>
                      </DialogProvider>
                    </QueryClientProvider>
                  </ModelsProvider>
                </GlobalSyncProvider>
              </GlobalSDKProvider>
            </ServerProvider>
        </UiI18nBridge>
      </LanguageProvider>
    </PlatformProvider>
  )
}

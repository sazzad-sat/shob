import { ParentProps, createResource, Show } from "solid-js"
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
import { nativeApi } from "@/services/native"
import { ErrorPage } from "@/pages/error"
import { SettingsProvider } from "@/context/settings"
import { MemoryRouter, Route } from "@solidjs/router"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"

const SIDECAR_SERVER_KEY = ServerConnection.Key.make("sidecar")

async function resolveSidecarServerUrl() {
  if (!window.shob) return "http://localhost:4096"

  const current = window.shob.getServerUrl()
  if (current) return current

  return nativeApi.invoke("opencode_server_start")
}

function sidecarServer(url: string): ServerConnection.Sidecar {
  return {
    type: "sidecar",
    variant: "base",
    displayName: "Local",
    http: { url },
  }
}

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

const platform: Platform = {
  platform: "desktop",
  os: "windows",
  openLink: (url) => nativeApi.invoke("open_external", { url }),
  restart: async () => {},
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  notify: async () => {},
  getDefaultServer: async () => {
    return SIDECAR_SERVER_KEY
  },
  setDefaultServer: async () => {},
}

const queryClient = new QueryClient()

export function AppProviders(props: ParentProps) {
  const [sidecarUrl] = createResource(resolveSidecarServerUrl)

  return (
    <PlatformProvider value={platform}>
      <LanguageProvider>
        <UiI18nBridge>
          <Show
            when={sidecarUrl.error}
            fallback={
              <Show when={sidecarUrl()} fallback={<div class="h-screen w-screen bg-background-base" />}>
                {(url) => (
                  <ServerProvider
                    defaultServer={SIDECAR_SERVER_KEY}
                    servers={[sidecarServer(url())]}
                  >
                    <GlobalSDKProvider>
                      <GlobalSyncProvider>
                        <SettingsProvider>
                          <MemoryRouter>
                            <Route path="*" component={() => (
                              <NotificationProvider>
                                <PermissionProvider>
                                  <ModelsProvider>
                                    <QueryClientProvider client={queryClient}>
                                      <DialogProvider>
                                        <MarkedProvider>
                                          {props.children}
                                        </MarkedProvider>
                                      </DialogProvider>
                                    </QueryClientProvider>
                                  </ModelsProvider>
                                </PermissionProvider>
                              </NotificationProvider>
                            )} />
                          </MemoryRouter>
                        </SettingsProvider>
                      </GlobalSyncProvider>
                    </GlobalSDKProvider>
                  </ServerProvider>
                )}
              </Show>
            }
          >
            {(error) => <ErrorPage error={error()} />}
          </Show>
        </UiI18nBridge>
      </LanguageProvider>
    </PlatformProvider>
  )
}


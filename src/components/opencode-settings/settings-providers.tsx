import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { showToast } from "@opencode-ai/ui/toast"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createMemo, type Component, For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogCustomProvider } from "./dialog-custom-provider"
import { DialogOpenAICompatible } from "./dialog-openai-compatible"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const PROVIDER_NOTES = [
  { match: (id: string) => id === "opencode", key: "dialog.provider.opencode.note" },
  { match: (id: string) => id === "opencode-go", key: "dialog.provider.opencodeGo.tagline" },
  { match: (id: string) => id === "anthropic", key: "dialog.provider.anthropic.note" },
  { match: (id: string) => id.startsWith("github-copilot"), key: "dialog.provider.copilot.note" },
  { match: (id: string) => id === "openai", key: "dialog.provider.openai.note" },
  { match: (id: string) => id === "xai", key: "dialog.provider.xai.note" },
  { match: (id: string) => id === "google", key: "dialog.provider.google.note" },
  { match: (id: string) => id === "antigravity", key: "dialog.provider.google.note" },
  { match: (id: string) => id === "openrouter", key: "dialog.provider.openrouter.note" },
  { match: (id: string) => id === "vercel", key: "dialog.provider.vercel.note" },
] as const

const Section: Component<{ title: string; children: JSX.Element }> = (props) => (
  <div class="flex flex-col gap-3">
    <h2 class="text-13-semibold text-text-strong px-1">{props.title}</h2>
    <div>{props.children}</div>
  </div>
)

const providerName = (item: { id: string; name: string }) => (item.id === "xai" ? "xAI (Grok)" : item.name)

const ConnectedRow: Component<{
  item: ProviderItem
  type: string
  canDisconnect: boolean
  onDisconnect: () => void
  disconnectHint: string
  disconnectLabel: string
}> = (props) => (
  <div class="rounded-lg border border-border-weak-base bg-surface-base p-3 h-full">
    <div class="flex items-center gap-3 min-w-0">
      <ProviderIcon id={props.item.id} class="size-5 shrink-0 icon-strong-base" />
      <span class="text-13-medium text-text-strong truncate flex-1">{providerName(props.item)}</span>
      <Tag>{props.type}</Tag>
    </div>
    <div class="mt-2.5 flex items-center justify-end">
      <Show
        when={props.canDisconnect}
        fallback={<span class="text-12-regular text-text-weak">{props.disconnectHint}</span>}
      >
        <Button size="small" variant="ghost" onClick={props.onDisconnect}>
          {props.disconnectLabel}
        </Button>
      </Show>
    </div>
  </div>
)

const PopularRow: Component<{
  item: { id: string; name: string }
  note?: string
  showRecommended?: boolean
  onConnect: () => void
  connectLabel: string
  recommendedLabel: string
}> = (props) => (
  <div class="rounded-lg border border-border-weak-base bg-surface-base p-3 h-full min-h-[96px]">
    <div class="flex items-start justify-between gap-3 min-w-0">
      <div class="flex items-center gap-x-2.5 min-w-0 flex-1">
        <ProviderIcon id={props.item.id} class="size-5 shrink-0 icon-strong-base" />
        <span class="text-13-medium text-text-strong truncate min-w-0">{providerName(props.item)}</span>
        <Show when={props.showRecommended}>
          <Tag class="hidden sm:inline-flex shrink-0">{props.recommendedLabel}</Tag>
        </Show>
      </div>
      <Button size="small" variant="secondary" icon="plus-small" class="shrink-0" onClick={props.onConnect}>
        {props.connectLabel}
      </Button>
    </div>
    <Show when={props.note}>
      <span class="text-12-regular text-text-weak mt-2 line-clamp-2 block">{props.note}</span>
    </Show>
  </div>
)

const SimpleTopActionCard: Component<{
  iconId: string
  title: string
  tag: string
  description: string
  onConnect: () => void
  connectLabel: string
}> = (props) => (
  <div class="rounded-lg border border-border-weak-base bg-surface-base p-3 h-full min-h-[96px]">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-x-2.5 min-w-0 flex-1">
        <ProviderIcon id={props.iconId} class="size-5 shrink-0 icon-strong-base" />
        <span class="text-13-medium text-text-strong truncate min-w-0">{props.title}</span>
        <Tag class="hidden sm:inline-flex shrink-0">{props.tag}</Tag>
      </div>
      <Button size="small" variant="secondary" icon="plus-small" class="shrink-0" onClick={props.onConnect}>
        {props.connectLabel}
      </Button>
    </div>
    <span class="text-12-regular text-text-weak mt-2 line-clamp-2 block">{props.description}</span>
  </div>
)

export const SettingsProviders: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const providers = useProviders()

  const connected = createMemo(() =>
    providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input)),
  )

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .popular()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id))
    return items
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const type = (item: ProviderItem) => {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: ProviderItem) => source(item) !== "env"

  const note = (id: string) => PROVIDER_NOTES.find((item) => item.match(id))?.key

  const isConfigCustom = (providerID: string) => {
    const provider = globalSync.data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    const before = globalSync.data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    globalSync.set("config", "disabled_providers", next)

    await globalSync
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        globalSync.set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await globalSDK.client.auth.remove({ providerID }).catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await globalSDK.client.auth
      .remove({ providerID })
      .then(async () => {
        await globalSDK.client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 sm:px-6 py-5 sm:py-6">
      <div class="flex flex-col gap-5 max-w-7xl w-full">
        {/* Connected */}
        <Section title={language.t("settings.providers.section.connected")}>
          <Show
            when={connected().length > 0}
            fallback={
              <div class="py-4 text-14-regular text-text-weak text-center">
                {language.t("settings.providers.connected.empty")}
              </div>
            }
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <For each={connected()}>
                {(item) => (
                  <ConnectedRow
                    item={item}
                    type={type(item)}
                    canDisconnect={canDisconnect(item)}
                    onDisconnect={() => void disconnect(item.id, item.name)}
                    disconnectHint={language.t("settings.providers.connected.environmentDescription")}
                    disconnectLabel={language.t("common.disconnect")}
                  />
                )}
              </For>
            </div>
          </Show>
        </Section>

        {/* Popular */}
        <Section title={language.t("settings.providers.section.popular")}>
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <For each={popular()}>
              {(item) => (
                <PopularRow
                  item={item}
                  note={note(item.id) ? language.t(note(item.id)!) : undefined}
                  showRecommended={item.id === "opencode" || item.id === "opencode-go"}
                  onConnect={() => dialog.show(() => <DialogConnectProvider provider={item.id} />)}
                  connectLabel={language.t("common.connect")}
                  recommendedLabel={language.t("dialog.provider.tag.recommended")}
                />
              )}
            </For>

            {/* OpenAI Compatible API */}
            <div data-component="openai-compatible-section">
              <SimpleTopActionCard
                iconId="openai"
                title={language.t("provider.openaiCompatible.title")}
                tag={language.t("settings.providers.tag.custom")}
                description={language.t("provider.openaiCompatible.description")}
                connectLabel={language.t("common.connect")}
                onConnect={() => dialog.show(() => <DialogOpenAICompatible />)}
              />
            </div>

            {/* Custom Provider */}
            <div data-component="custom-provider-section">
              <SimpleTopActionCard
                iconId="synthetic"
                title={language.t("provider.custom.title")}
                tag={language.t("settings.providers.tag.custom")}
                description={language.t("settings.providers.custom.description")}
                connectLabel={language.t("common.connect")}
                onConnect={() => dialog.show(() => <DialogCustomProvider back="close" />)}
              />
            </div>
          </div>
        </Section>

        {/* View All */}
        <Button
          variant="ghost"
          class="px-0 py-0 mt-1 text-13-medium text-text-interactive-base text-left justify-start hover:bg-transparent active:bg-transparent"
          onClick={() => dialog.show(() => <DialogSelectProvider />)}
        >
          {language.t("dialog.provider.viewAll")}
        </Button>
      </div>
    </div>
  )
}

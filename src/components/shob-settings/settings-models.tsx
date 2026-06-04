import { useFilteredList } from "@opencode-ai/ui/hooks"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Switch } from "@opencode-ai/ui/switch"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { type Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { popularProviders } from "@/hooks/use-providers"

type ModelItem = ReturnType<ReturnType<typeof useModels>["list"]>[number]

const LoadingState: Component<{ label: string }> = (props) => (
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <span class="text-14-regular text-text-weak">{props.label}</span>
  </div>
)

const EmptyState: Component<{ message: string; filter: string }> = (props) => (
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <span class="text-14-regular text-text-weak">{props.message}</span>
    <Show when={props.filter}>
      <span class="text-14-regular text-text-strong mt-1">"{props.filter}"</span>
    </Show>
  </div>
)

const ModelRow: Component<{ item: ModelItem; onToggle: (checked: boolean) => void; visible: boolean }> = (props) => (
  <div class="flex items-center justify-between gap-4 py-2.5 border-b border-border-weak-base last:border-0">
    <div class="min-w-0">
      <span class="text-13-regular text-text-strong truncate block">{props.item.name}</span>
    </div>
    <div class="flex-shrink-0">
      <Switch checked={props.visible} onChange={props.onToggle} hideLabel>
        {props.item.name}
      </Switch>
    </div>
  </div>
)

const ProviderGroup: Component<{
  group: { category: string; items: ModelItem[] }
  onToggle: (item: ModelItem, checked: boolean) => void
  isVisible: (item: ModelItem) => boolean
}> = (props) => (
  <div class="rounded-xl border border-border-weak-base bg-surface-panel p-5">
    <div class="flex items-center gap-2 mb-4">
      <ProviderIcon id={props.group.category} class="size-5 shrink-0 icon-strong-base" />
      <span class="text-13-semibold text-text-strong">{props.group.items[0].provider.name}</span>
    </div>
    <div class="flex flex-col">
      <For each={props.group.items}>
        {(item) => (
          <ModelRow
            item={item}
            visible={props.isVisible(item)}
            onToggle={(checked) => props.onToggle(item, checked)}
          />
        )}
      </For>
    </div>
  </div>
)

export const SettingsModels: Component = () => {
  const language = useLanguage()
  const models = useModels()

  const list = useFilteredList<ModelItem>({
    items: (_filter) => models.list(),
    key: (x) => `${x.provider.id}:${x.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.id,
    sortGroupsBy: (a, b) => {
      const aIndex = popularProviders.indexOf(a.category)
      const bIndex = popularProviders.indexOf(b.category)
      const aPopular = aIndex >= 0
      const bPopular = bIndex >= 0

      if (aPopular && !bPopular) return -1
      if (!aPopular && bPopular) return 1
      if (aPopular && bPopular) return aIndex - bIndex

      return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
    },
  })

  const isVisible = (item: ModelItem) => models.visible({ providerID: item.provider.id, modelID: item.id })

  const handleToggle = (item: ModelItem, checked: boolean) => {
    models.setVisibility({ providerID: item.provider.id, modelID: item.id }, checked)
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-6 py-6">
      <div class="flex flex-col gap-5 max-w-2xl">
        {/* Search */}
        <div class="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-panel border border-border-weak-base">
          <Icon name="magnifying-glass" class="text-icon-weak flex-shrink-0" />
          <TextField
            variant="ghost"
            type="text"
            value={list.filter()}
            onChange={list.onInput}
            placeholder={language.t("dialog.model.search.placeholder")}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            class="flex-1"
          />
          <Show when={list.filter()}>
            <IconButton icon="circle-x" variant="ghost" onClick={list.clear} />
          </Show>
        </div>

        {/* Content */}
        <div class="flex flex-col gap-4">
          <Show
            when={!list.grouped.loading}
            fallback={
              <div class="rounded-xl border border-border-weak-base bg-surface-panel p-8">
                <LoadingState label={`${language.t("common.loading")}${language.t("common.loading.ellipsis")}`} />
              </div>
            }
          >
            <Show
              when={list.flat().length > 0}
              fallback={
                <div class="rounded-xl border border-border-weak-base bg-surface-panel p-8">
                  <EmptyState message={language.t("dialog.model.empty")} filter={list.filter()} />
                </div>
              }
            >
              <For each={list.grouped.latest}>
                {(group) => (
                  <ProviderGroup group={group} onToggle={handleToggle} isVisible={isVisible} />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}
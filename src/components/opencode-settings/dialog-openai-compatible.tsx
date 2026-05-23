import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { batch, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

interface FetchedModel {
  id: string
  name: string
  selected: boolean
}

interface FormState {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  err: {
    providerID?: string
    name?: string
    baseURL?: string
    apiKey?: string
    fetch?: string
  }
}

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"

export function DialogOpenAICompatible() {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    err: {},
  })

  const [models, setModels] = createSignal<FetchedModel[]>([])
  const [isFetching, setIsFetching] = createSignal(false)
  const [hasFetched, setHasFetched] = createSignal(false)

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    batch(() => {
      setForm(key, value)
      setForm("err", key, undefined)
    })
  }

  const validateForm = () => {
    const providerID = form.providerID.trim()
    const name = form.name.trim()
    const baseURL = form.baseURL.trim()
    const apiKey = form.apiKey.trim()

    const idError = !providerID
      ? language.t("provider.custom.error.providerID.required")
      : !PROVIDER_ID.test(providerID)
        ? language.t("provider.custom.error.providerID.format")
        : undefined

    const nameError = !name ? language.t("provider.custom.error.name.required") : undefined
    const urlError = !baseURL
      ? language.t("provider.custom.error.baseURL.required")
      : !/^https?:\/\//.test(baseURL)
        ? language.t("provider.custom.error.baseURL.format")
        : undefined
    const keyError = !apiKey ? language.t("provider.custom.error.apiKey.required") : undefined

    batch(() => {
      setForm("err", "providerID", idError)
      setForm("err", "name", nameError)
      setForm("err", "baseURL", urlError)
      setForm("err", "apiKey", keyError)
    })

    return !idError && !nameError && !urlError && !keyError
  }

  const fetchModels = async () => {
    if (!validateForm()) return

    setIsFetching(true)
    setForm("err", "fetch", undefined)

    try {
      const baseURL = form.baseURL.trim().replace(/\/$/, "")
      const response = await fetch(`${baseURL}/v1/models`, {
        headers: {
          "Authorization": `Bearer ${form.apiKey.trim()}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid response format from API")
      }

      const fetchedModels: FetchedModel[] = data.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        selected: true,
      }))

      setModels(fetchedModels)
      setHasFetched(true)

      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.openaiCompatible.fetch.success.title"),
        description: language.t("provider.openaiCompatible.fetch.success.description", { count: fetchedModels.length }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setForm("err", "fetch", message)
      showToast({
        variant: "error",
        title: language.t("provider.openaiCompatible.fetch.error.title"),
        description: message,
      })
    } finally {
      setIsFetching(false)
    }
  }

  const toggleModel = (index: number) => {
    setModels(
      produce((list) => {
        if (list[index]) {
          list[index].selected = !list[index].selected
        }
      })
    )
  }

  const selectAll = () => {
    setModels(
      produce((list) => {
        list.forEach((m) => (m.selected = true))
      })
    )
  }

  const deselectAll = () => {
    setModels(
      produce((list) => {
        list.forEach((m) => (m.selected = false))
      })
    )
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async () => {
      const providerID = form.providerID.trim()
      const name = form.name.trim()
      const baseURL = form.baseURL.trim()
      const apiKey = form.apiKey.trim()

      const selectedModels = models().filter((m) => m.selected)
      if (selectedModels.length === 0) {
        throw new Error(language.t("provider.openaiCompatible.error.noModelsSelected"))
      }

      const modelConfig = Object.fromEntries(
        selectedModels.map((m) => [m.id, { name: m.name }])
      )

      await globalSDK.client.auth.set({
        providerID,
        auth: {
          type: "api",
          key: apiKey,
        },
      })

      const disabledProviders = globalSync.data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== providerID)

      await globalSync.updateConfig({
        provider: {
          [providerID]: {
            npm: OPENAI_COMPATIBLE,
            name,
            options: {
              baseURL,
            },
            models: modelConfig,
          },
        },
        disabled_providers: nextDisabled,
      })

      return { name }
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending || isFetching()) return
    if (!hasFetched()) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: language.t("provider.openaiCompatible.error.fetchFirst"),
      })
      return
    }
    saveMutation.mutate()
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={() => dialog.close()}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id="openai" class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">
            {language.t("provider.openaiCompatible.title")}
          </div>
        </div>

        <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
          <p class="text-14-regular text-text-base">
            {language.t("provider.openaiCompatible.description")}
          </p>

          <div class="flex flex-col gap-4">
            <TextField
              autofocus
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setField("providerID", v)}
              validationState={form.err.providerID ? "invalid" : undefined}
              error={form.err.providerID}
            />
            <TextField
              label={language.t("provider.custom.field.name.label")}
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setField("name", v)}
              validationState={form.err.name ? "invalid" : undefined}
              error={form.err.name}
            />
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => setField("baseURL", v)}
              validationState={form.err.baseURL ? "invalid" : undefined}
              error={form.err.baseURL}
            />
            <TextField
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setField("apiKey", v)}
              validationState={form.err.apiKey ? "invalid" : undefined}
              error={form.err.apiKey}
            />
          </div>

          <Show when={form.err.fetch}>
            <div class="text-14-regular text-text-error">{form.err.fetch}</div>
          </Show>

          <Button
            type="button"
            size="large"
            variant="secondary"
            disabled={isFetching() || saveMutation.isPending}
            onClick={fetchModels}
          >
            {isFetching()
              ? language.t("provider.openaiCompatible.fetching")
              : language.t("provider.openaiCompatible.fetchModels")}
          </Button>

          <Show when={hasFetched() && models().length > 0}>
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <label class="text-12-medium text-text-weak">
                  {language.t("provider.openaiCompatible.models.label")}
                </label>
                <div class="flex gap-2">
                  <Button type="button" size="small" variant="ghost" onClick={selectAll}>
                    {language.t("common.selectAll")}
                  </Button>
                  <Button type="button" size="small" variant="ghost" onClick={deselectAll}>
                    {language.t("common.deselectAll")}
                  </Button>
                </div>
              </div>

              <div class="max-h-48 overflow-y-auto border border-border-base rounded-lg">
                <For each={models()}>
                  {(model) => (
                    <label class="flex items-center gap-3 px-4 py-2 hover:bg-surface-raised-hover cursor-pointer border-b border-border-base last:border-0">
                      <input
                        type="checkbox"
                        checked={model.selected}
                        onChange={() => toggleModel(models().indexOf(model))}
                        class="size-4"
                      />
                      <div class="flex flex-col">
                        <span class="text-13-medium text-text-strong">{model.name}</span>
                        <span class="text-12-regular text-text-weak">{model.id}</span>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Button
            class="w-auto self-start"
            type="submit"
            size="large"
            variant="primary"
            disabled={saveMutation.isPending || isFetching() || !hasFetched()}
          >
            {saveMutation.isPending
              ? language.t("common.saving")
              : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}

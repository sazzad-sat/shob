import { For, Show, createMemo, createSignal } from "solid-js"
import { useMutation } from "@tanstack/solid-query"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/ui/dock-prompt"
import { showToast } from "@opencode-ai/ui/toast"
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"

export function SessionQuestionDock(props: { request: QuestionRequest; onSubmit: () => void }) {
  const sdk = useSDK()
  const language = useLanguage()
  const [custom, setCustom] = createSignal("")
  const [selected, setSelected] = createSignal<string[]>([])

  const question = createMemo(() => props.request.questions[0])
  const options = createMemo(() => question()?.options ?? [])
  const multi = createMemo(() => question()?.multiple === true)

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    showToast({ title: language.t("common.requestFailed"), description: message })
  }

  const replyMutation = useMutation(() => ({
    mutationFn: (answers: QuestionAnswer[]) => sdk.client.question.reply({ requestID: props.request.id, answers }),
    onMutate: () => props.onSubmit(),
    onError: fail,
  }))

  const rejectMutation = useMutation(() => ({
    mutationFn: () => sdk.client.question.reject({ requestID: props.request.id }),
    onMutate: () => props.onSubmit(),
    onError: fail,
  }))

  const sending = createMemo(() => replyMutation.isPending || rejectMutation.isPending)

  const toggle = (label: string) => {
    if (sending()) return
    if (!multi()) {
      setSelected([label])
      return
    }
    setSelected((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]))
  }

  const submit = async () => {
    if (sending()) return
    const answers = [...selected()]
    const customText = custom().trim()
    if (customText) answers.push(customText)
    if (answers.length === 0) return
    await replyMutation.mutateAsync([answers])
  }

  const reject = async () => {
    if (sending()) return
    await rejectMutation.mutateAsync()
  }

  return (
    <DockPrompt
      kind="question"
      header={<div data-slot="question-header-title">{language.t("ui.tool.questions")}</div>}
      footer={
        <>
          <Button variant="ghost" size="small" disabled={sending()} onClick={reject}>
            {language.t("ui.common.dismiss")}
          </Button>
          <Button variant="primary" size="small" disabled={sending()} onClick={submit}>
            {language.t("ui.common.submit")}
          </Button>
        </>
      }
    >
      <div data-slot="question-text" class="overflow-auto">
        {question()?.question}
      </div>
      <div data-slot="question-options">
        <For each={options()}>
          {(opt) => (
            <button
              type="button"
              data-slot="question-option"
              data-picked={selected().includes(opt.label)}
              disabled={sending()}
              onClick={() => toggle(opt.label)}
            >
              <span data-slot="question-option-main">
                <span data-slot="option-label">{opt.label}</span>
                <Show when={opt.description}>
                  <span data-slot="option-description">{opt.description}</span>
                </Show>
              </span>
            </button>
          )}
        </For>
        <textarea
          data-slot="question-custom-input"
          class="w-full"
          placeholder={language.t("ui.question.custom.placeholder")}
          value={custom()}
          disabled={sending()}
          rows={1}
          onInput={(e) => setCustom(e.currentTarget.value)}
        />
      </div>
    </DockPrompt>
  )
}

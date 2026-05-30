import { createSignal, onMount, Show } from 'solid-js'
import { Send, CornerDownLeft, Plus, Globe } from 'lucide-solid'

interface PromptComposerProps {
  onSubmit: (text: string) => void
  placeholder?: string
  disabled?: boolean
}

export function PromptComposer(props: PromptComposerProps) {
  const [text, setText] = createSignal('')
  const [isFocused, setIsFocused] = createSignal(false)
  let textareaRef: HTMLTextAreaElement | undefined

  const adjustHeight = () => {
    if (!textareaRef) return
    textareaRef.style.height = 'auto'
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`
  }

  const handleSubmit = () => {
    const value = text().trim()
    if (!value || props.disabled) return
    props.onSubmit(value)
    setText('')
    if (textareaRef) {
      textareaRef.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  onMount(() => {
    adjustHeight()
  })

  const hasText = () => text().trim().length > 0

  return (
    <div
      class="prompt-shell"
      data-focused={isFocused()}
      data-has-text={hasText()}
    >
      <textarea
        ref={textareaRef}
        class="prompt-input"
        placeholder={props.placeholder || "Message Agent..."}
        value={text()}
        onInput={(e) => {
          setText(e.currentTarget.value)
          adjustHeight()
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={props.disabled}
        rows={1}
      />

      <div class="prompt-bar">
        <div class="prompt-actions-left">
          <button class="prompt-btn-icon" title="Attach File">
            <Plus size={15} />
          </button>
          <button class="prompt-btn-text" title="Add Context">
            <Globe size={13} />
            <span>Context</span>
          </button>
        </div>

        <div class="prompt-actions-right">
          <Show when={!hasText()}>
            <span class="prompt-hint">
              <CornerDownLeft size={11} />
              <span>Enter to send</span>
            </span>
          </Show>
          <button
            class="prompt-submit"
            onClick={handleSubmit}
            disabled={!hasText() || props.disabled}
            title="Send message"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

import { createSignal, onMount } from 'solid-js'
import { Send, CornerDownLeft, Plus, Globe } from 'lucide-solid'

interface PromptComposerProps {
  onSubmit: (text: string) => void
  placeholder?: string
  disabled?: boolean
}

export function PromptComposer(props: PromptComposerProps) {
  const [text, setText] = createSignal('')
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

  return (
    <div class="relative flex w-full flex-col font-sans transition-[box-shadow,margin] duration-300 rounded-xl bg-surface-base border border-border-base shadow-sm focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
      <div class="group relative flex w-full flex-col overflow-hidden">
        <div class="relative flex w-full min-w-0 flex-1 flex-col pb-0">
          <div class="relative flex w-full min-w-0 flex-1 flex-col overflow-hidden py-1">
            <textarea
              ref={textareaRef}
              class="w-full resize-none bg-transparent px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none custom-scrollbar min-h-[44px] max-h-[40vh] leading-relaxed"
              placeholder={props.placeholder || "Message Agent..."}
              value={text()}
              onInput={(e) => {
                setText(e.currentTarget.value)
                adjustHeight()
              }}
              onKeyDown={handleKeyDown}
              disabled={props.disabled}
              rows={1}
            />
          </div>
        </div>
      </div>

      <div class="relative flex w-full shrink-0 flex-col overflow-hidden">
        <div class="flex min-h-11 w-full flex-row items-end justify-between px-2 pb-2">
          {/* Left tools (Attach, Context, etc.) */}
          <div class="flex items-center gap-1.5 pb-0.5">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-base-hover hover:text-foreground transition-colors"
              title="Attach File"
            >
              <Plus size={16} />
            </button>
            <button
              class="flex h-8 items-center gap-1.5 px-2 rounded-md text-muted-foreground hover:bg-surface-base-hover hover:text-foreground transition-colors text-xs font-medium"
              title="Add Context"
            >
              <Globe size={14} />
              <span>Context</span>
            </button>
          </div>

          {/* Right tools (Submit) */}
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-muted-foreground select-none pointer-events-none hidden sm:flex items-center gap-1 opacity-60 font-medium pb-1">
              <CornerDownLeft size={12} />
              Return to send
            </span>
            <button
              onClick={handleSubmit}
              disabled={!text().trim() || props.disabled}
              class="flex h-8 items-center justify-center gap-2 px-3 rounded-md bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm text-sm font-medium"
              title="Send message"
            >
              <span>Send</span>
              <Send size={14} class="ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

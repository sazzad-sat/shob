import { Component, For, Show } from "solid-js"
import { FileText, X } from "lucide-solid"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { PastePart } from "@/context/prompt"

type PromptPasteAttachmentsProps = {
  pastes: PastePart[]
  onOpen: (paste: PastePart) => void
  onRemove: (id: string) => void
}

export const PromptPasteAttachments: Component<PromptPasteAttachmentsProps> = (props) => {
  const formatSize = (chars: number) => {
    if (chars < 1024) return `${chars} B`
    return `${(chars / 1024).toFixed(1)} KB`
  }

  return (
    <Show when={props.pastes.length > 0}>
      <div class="flex flex-wrap gap-2 px-3 pt-3">
        <For each={props.pastes}>
          {(paste, index) => (
            <Tooltip value={paste.preview} placement="top" contentClass="break-all whitespace-pre font-mono text-[11px] max-w-xs p-2">
              <div
                class="group relative flex items-center gap-2.5 rounded-lg border border-border-weak-base bg-surface-raised-base hover:bg-surface-raised-base-hover hover:border-border-strong-base transition-all p-2.5 cursor-pointer max-w-[280px] min-w-[200px]"
                onClick={() => props.onOpen(paste)}
              >
                <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-background-stronger text-text-weak group-hover:text-primary transition-colors">
                  <FileText size={16} />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-semibold text-text-strong truncate">
                    Pasted Text {props.pastes.length > 1 ? `#${index() + 1}` : ""}
                  </div>
                  <div class="text-[11px] text-text-weaker truncate">
                    {formatSize(paste.charCount)} · {paste.lineCount} lines
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRemove(paste.id)
                  }}
                  class="size-6 rounded-md hover:bg-background-stronger flex items-center justify-center text-text-weak hover:text-text-strong transition-colors"
                  aria-label="Remove pasted text"
                >
                  <X size={14} />
                </button>
              </div>
            </Tooltip>
          )}
        </For>
      </div>
    </Show>
  )
}

import { Component } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"

type PastePreviewDialogProps = {
  content: string
  filename: string
}

export const PastePreviewDialog: Component<PastePreviewDialogProps> = (props) => {
  return (
    <Dialog title={props.filename} transition>
      <div class="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-border-weak-base bg-background p-4 font-mono text-[13px] leading-5 whitespace-pre select-text text-text-base">
        {props.content}
      </div>
    </Dialog>
  )
}

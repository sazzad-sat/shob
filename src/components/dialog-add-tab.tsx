import { Component } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"

export type SidePanelTabKind = "review" | "context"

export interface DialogAddTabProps {
  onSelect?: (kind: SidePanelTabKind) => void
}

const TABS: { id: SidePanelTabKind; titleKey: string; descriptionKey: string }[] = [
  {
    id: "review",
    titleKey: "dialog.addTab.review.title",
    descriptionKey: "dialog.addTab.review.description",
  },
  {
    id: "context",
    titleKey: "dialog.addTab.context.title",
    descriptionKey: "dialog.addTab.context.description",
  },
]

export const DialogAddTab: Component<DialogAddTabProps> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  return (
    <Dialog title={language.t("dialog.addTab.title")} transition>
      <List
        search={{ placeholder: language.t("dialog.addTab.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.addTab.empty")}
        key={(x) => x.id}
        items={TABS}
        filterKeys={["id", "titleKey", "descriptionKey"]}
        onSelect={(x) => {
          if (!x) return
          props.onSelect?.(x.id)
          dialog.close()
        }}
      >
        {(i) => (
          <div class="w-full flex flex-col gap-0.5 text-13-regular">
            <span class="truncate text-text-strong">{language.t(i.titleKey)}</span>
            <span class="truncate text-12-regular text-text-weak">{language.t(i.descriptionKey)}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}

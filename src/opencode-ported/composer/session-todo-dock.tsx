import type { Todo } from "@opencode-ai/sdk/v2/client"
import { For, Show, createMemo, createSignal } from "solid-js"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { DockTray } from "@opencode-ai/ui/dock-surface"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useLanguage } from "@/context/language"

export function SessionTodoDock(props: {
  todos: Todo[]
  collapsed: boolean
  onToggle: () => void
  collapseLabel: string
  expandLabel: string
}) {
  const language = useLanguage()
  const done = createMemo(() => props.todos.filter((todo) => todo.status === "completed").length)
  const total = createMemo(() => props.todos.length)
  const active = createMemo(
    () =>
      props.todos.find((todo) => todo.status === "in_progress") ??
      props.todos.find((todo) => todo.status === "pending") ??
      props.todos[0],
  )
  const [stuck, setStuck] = createSignal(false)

  return (
    <DockTray data-component="session-todo-dock">
      <div
        data-action="session-todo-toggle"
        class="pl-3 pr-2 py-2 flex items-center gap-2 overflow-visible"
        role="button"
        tabIndex={0}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <span class="text-14-regular text-text-strong cursor-default inline-flex items-baseline shrink-0 overflow-visible">
          {language.t("session.todo.progress", { done: done(), total: total() })}
        </span>
        <div data-slot="session-todo-preview" class="ml-1 min-w-0 overflow-hidden">
          <Show when={props.collapsed}>
            <span class="text-14-regular text-text-base truncate">{active()?.content ?? ""}</span>
          </Show>
        </div>
        <div class="ml-auto">
          <IconButton
            data-action="session-todo-toggle-button"
            data-collapsed={props.collapsed ? "true" : "false"}
            icon="chevron-down"
            size="normal"
            variant="ghost"
            style={{ transform: `rotate(${props.collapsed ? 180 : 0}deg)` }}
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              props.onToggle()
            }}
            aria-label={props.collapsed ? props.expandLabel : props.collapseLabel}
          />
        </div>
      </div>

      <Show when={!props.collapsed}>
        <div
          class="relative px-3 pb-11 flex flex-col gap-1.5 max-h-42 overflow-y-auto no-scrollbar"
          onScroll={(e) => setStuck(e.currentTarget.scrollTop > 0)}
        >
          <For each={props.todos}>
            {(todo) => (
              <Checkbox readOnly checked={todo.status === "completed"} indeterminate={todo.status === "in_progress"}>
                <span
                  class="text-14-regular min-w-0 break-words"
                  classList={{
                    "text-text-weak line-through": todo.status === "completed" || todo.status === "cancelled",
                    "text-text-strong": todo.status !== "completed" && todo.status !== "cancelled",
                  }}
                >
                  {todo.content}
                </span>
              </Checkbox>
            )}
          </For>
          <div
            class="pointer-events-none absolute top-0 left-0 right-0 h-4 transition-opacity duration-150"
            style={{
              background: "linear-gradient(to bottom, var(--background-base), transparent)",
              opacity: stuck() ? 1 : 0,
            }}
          />
        </div>
      </Show>
    </DockTray>
  )
}


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
    <DockTray data-component="session-todo-dock" class="todo-dock">
      <div
        data-action="session-todo-toggle"
        class="todo-dock-header"
        role="button"
        tabIndex={0}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <div class="todo-dock-badge">
          <span class="todo-dock-count">{done()}</span>
          <span class="todo-dock-separator">/</span>
          <span class="todo-dock-total">{total()}</span>
        </div>
        <div data-slot="session-todo-preview" class="todo-dock-preview">
          <Show when={props.collapsed}>
            <span class="todo-dock-active-text">{active()?.content ?? ""}</span>
          </Show>
        </div>
        <IconButton
          data-action="session-todo-toggle-button"
          data-collapsed={props.collapsed ? "true" : "false"}
          icon="chevron-down"
          size="small"
          variant="ghost"
          class="todo-dock-chevron"
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

      <Show when={!props.collapsed}>
        <div
          class="todo-dock-list"
          onScroll={(e) => setStuck(e.currentTarget.scrollTop > 0)}
        >
          <For each={props.todos}>
            {(todo) => (
              <div class="todo-dock-item">
                <Checkbox readOnly checked={todo.status === "completed"} indeterminate={todo.status === "in_progress"}>
                  <span
                    class="todo-dock-item-text"
                    classList={{
                      "todo-dock-item-done": todo.status === "completed" || todo.status === "cancelled",
                      "todo-dock-item-active": todo.status === "in_progress",
                      "todo-dock-item-pending": todo.status === "pending",
                    }}
                  >
                    {todo.content}
                  </span>
                </Checkbox>
              </div>
            )}
          </For>
          <div
            class="todo-dock-fade"
            style={{ opacity: stuck() ? 1 : 0 }}
          />
        </div>
      </Show>
    </DockTray>
  )
}


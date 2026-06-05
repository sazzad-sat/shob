import type { Todo } from "@opencode-ai/sdk/v2/client"
import { For, Show, createMemo } from "solid-js"
import { DockTray } from "@opencode-ai/ui/dock-surface"

export function SessionTodoDock(props: {
  todos: Todo[]
  collapsed: boolean
  onToggle: () => void
  collapseLabel: string
  expandLabel: string
}) {
  const active = createMemo(
    () =>
      props.todos.find((todo) => todo.status === "in_progress") ??
      props.todos.find((todo) => todo.status === "pending") ??
      props.todos[0],
  )
  const displayedTodos = createMemo(() => {
    if (!props.collapsed) return props.todos
    const todo = active()
    return todo ? [todo] : []
  })
  const toggleLabel = createMemo(() => (props.collapsed ? props.expandLabel : props.collapseLabel))

  return (
    <DockTray data-component="session-todo-dock" class="todo-dock">
      <div
        data-action="session-todo-toggle"
        class="todo-dock-header"
        role="button"
        tabIndex={0}
        aria-expanded={!props.collapsed}
        aria-label={toggleLabel()}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <span class="todo-dock-title">Progress</span>
      </div>

      <Show when={displayedTodos().length > 0}>
        <div class="todo-dock-list" aria-live="polite">
          <For each={displayedTodos()}>
            {(todo) => (
              <div class="todo-dock-item" data-status={todo.status} aria-current={todo.status === "in_progress" ? "step" : undefined}>
                <span class="todo-dock-status" role="img" aria-label={todoStatusLabel(todo.status)} />
                <span class="todo-dock-item-text">{todo.content}</span>
              </div>
            )}
          </For>
          <div class="todo-dock-divider" aria-hidden="true" />
        </div>
      </Show>
    </DockTray>
  )
}

function todoStatusLabel(status: Todo["status"]) {
  switch (status) {
    case "completed":
      return "Completed"
    case "in_progress":
      return "In progress"
    case "cancelled":
      return "Cancelled"
    default:
      return "Pending"
  }
}


import { For, Show, createMemo } from "solid-js"
import { Terminal } from "./Terminal"
import { useStore } from "../store"

interface TerminalPanelProps {
  onNewSession: () => void
}

export function TerminalPanel(_props: TerminalPanelProps) {
  const currentProject = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId) ?? null,
  )
  const projectSessions = createMemo(() => currentProject()?.sessions ?? [])
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeSession = createMemo(() =>
    projectSessions().find((s) => s.id === activeSessionId()) ?? null,
  )

  return (
    <div class="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-background">
      <For each={projectSessions()}>
        {(session) => (
          <Show when={session.id === activeSessionId()}>
            <Terminal sessionId={session.id} />
          </Show>
        )}
      </For>

      <Show when={!activeSession()}>
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          No terminal active
        </div>
      </Show>
    </div>
  )
}

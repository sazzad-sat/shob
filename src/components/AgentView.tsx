import { createEffect, createMemo, For, Show } from "solid-js"
import { PromptInput } from "../opencode-ported/prompt-input"
import { MockSessionProviders } from "../opencode-ported/mock-session-layout"
import { useSync } from "@/context/sync"
import { useParams } from "@solidjs/router"
import { Message } from "@opencode-ai/ui/message-part"
import { DataProvider, FileComponentProvider } from "@opencode-ai/ui/context"
import type { Message as ChatMessage, Part } from "@opencode-ai/sdk/v2/client"

interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

function AgentViewInner(props: AgentViewProps) {
  const sync = useSync()
  const params = useParams()
  let scrollRef: HTMLDivElement | undefined

  const activeSessionId = createMemo(() => {
    const id = params.id || props.sessionId
    return id?.startsWith("ses") ? id : undefined
  })

  const messages = createMemo<ChatMessage[]>(() => {
    const sessionID = activeSessionId()
    return sessionID ? (sync.data.message[sessionID] ?? []) : []
  })
  const getParts = (messageID: string): Part[] => sync.data.part[messageID] ?? []

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
  })

  createEffect(() => {
    messages()
    if (!scrollRef) return
    setTimeout(() => {
      if (!scrollRef) return
      scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
    }, 30)
  })

  const FilePreview = (fileProps: any) => (
    <div class="rounded-md border border-border/60 bg-background p-3 text-xs text-muted-foreground">
      {fileProps.file?.path || fileProps.fileDiff?.path || fileProps.fileDiff?.file || "File preview"}
    </div>
  )

  return (
    <DataProvider data={sync.data} directory={props.projectPath ?? ""}>
      <FileComponentProvider component={FilePreview}>
        <div class="flex h-full min-h-0 w-full flex-col bg-background">
      <div ref={scrollRef} class="flex-1 overflow-y-auto px-3 py-4">
        <div class="mx-auto w-full max-w-[980px]">
          <For each={messages()}>
            {(message) => (
              <div class="px-1 py-2">
                <Message message={message} parts={getParts(message.id)} />
              </div>
            )}
          </For>

          <Show when={messages().length === 0}>
            <div class="flex h-[42vh] items-center justify-center text-sm text-muted-foreground">
              Start a conversation with the agent
            </div>
          </Show>
        </div>
      </div>

      <div class="border-t border-border/60 p-3">
        <div class="mx-auto w-full max-w-[980px]">
          <PromptInput />
        </div>
      </div>
        </div>
      </FileComponentProvider>
    </DataProvider>
  )
}

export function AgentView(props: AgentViewProps) {
  return (
    <Show when={props.projectPath}>
      <MockSessionProviders directory={props.projectPath!} sessionId={props.sessionId}>
        <AgentViewInner {...props} />
      </MockSessionProviders>
    </Show>
  )
}

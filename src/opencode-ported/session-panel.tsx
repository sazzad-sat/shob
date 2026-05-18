import { createMemo, createResource, For, Show } from "solid-js"
import { diffLines, type Change } from "diff"
import { FileIcon } from "@/components/ui/file-icon"
import { nativeApi } from "@/services/native"
import { Icon } from "@/components/ui/icon"

type Props = {
  projectPath: string
  activeFile?: string | null
  openFiles?: string[]
  onSelectFile?: (file: string) => void
  onCloseFile?: (file: string) => void
}

const toPosix = (value: string) => value.replace(/\\/g, "/").replace(/\/+/g, "/")

const filename = (path: string) => path.split("/").filter(Boolean).at(-1) ?? path

const absolutePath = (root: string, file: string) => {
  const base = toPosix(root).replace(/\/+$/, "")
  const rel = toPosix(file).replace(/^\/+/, "")
  return `${base}/${rel}`
}

const tokenClass = (token: string) => {
  if (/^(import|from|export|default|function|return|const|let|var|if|else|for|while|class|type|interface)$/.test(token)) {
    return "text-[var(--chart-4)]"
  }
  if (/^['"`].*['"`]$/.test(token)) return "text-[var(--chart-5)]"
  if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) return "text-[var(--chart-3)]"
  if (/^[0-9]+$/.test(token)) return "text-[var(--chart-4)]"
  return "text-foreground"
}

function CodeLine(props: { line: string; index: number }) {
  const parts = createMemo(() => props.line.split(/(\s+|[{}()[\];,.<>/=:+*-])/g).filter((part) => part.length > 0))
  return (
    <div class="grid min-h-[24px] grid-cols-[56px_minmax(0,1fr)] gap-4 text-[12px] leading-6 font-mono">
      <div class="select-none text-right text-muted-foreground">{props.index + 1}</div>
      <pre class="m-0 whitespace-pre-wrap break-words text-foreground">
        <For each={parts()}>{(part) => <span class={/\s+/.test(part) ? "" : tokenClass(part)}>{part}</span>}</For>
      </pre>
    </div>
  )
}

function CodeText(props: { line: string }) {
  const parts = createMemo(() => props.line.split(/(\s+|[{}()[\];,.<>/=:+*-])/g).filter((part) => part.length > 0))
  return (
    <pre class="m-0 whitespace-pre-wrap break-words">
      <For each={parts()}>{(part) => <span class={/\s+/.test(part) ? "" : tokenClass(part)}>{part}</span>}</For>
    </pre>
  )
}

const splitChunkLines = (value: string) => {
  const lines = value.split(/\r?\n/)
  if (value.endsWith("\n") || value.endsWith("\r\n")) lines.pop()
  return lines
}

function UnifiedDiff(props: { chunks: Change[] }) {
  let oldLine = 1
  let newLine = 1

  return (
    <div class="py-4">
      <For each={props.chunks}>
        {(chunk) => {
          const lines = splitChunkLines(chunk.value)
          const kind = chunk.added ? "added" : chunk.removed ? "removed" : "context"

          return (
            <For each={lines}>
              {(line) => {
                const currentOld = chunk.added ? "" : oldLine++
                const currentNew = chunk.removed ? "" : newLine++
                const prefix = chunk.added ? "+" : chunk.removed ? "-" : " "

                return (
                  <div
                    class="grid min-h-[24px] grid-cols-[44px_44px_24px_minmax(0,1fr)] text-[12px] leading-6 font-mono"
                    style={{
                      "background-color": kind === "added"
                        ? "color-mix(in oklch, var(--icon-diff-add-base) 14%, transparent)"
                        : kind === "removed"
                          ? "color-mix(in oklch, var(--icon-diff-delete-base) 14%, transparent)"
                          : "transparent",
                    }}
                  >
                    <div class="select-none pr-2 text-right text-muted-foreground">{currentOld}</div>
                    <div class="select-none pr-2 text-right text-muted-foreground">{currentNew}</div>
                    <div
                      class="select-none text-center"
                      classList={{
                        "text-[var(--icon-diff-add-base)]": kind === "added",
                        "text-[var(--icon-diff-delete-base)]": kind === "removed",
                        "text-muted-foreground": kind === "context",
                      }}
                    >
                      {prefix}
                    </div>
                    <CodeText line={line} />
                  </div>
                )
              }}
            </For>
          )
        }}
      </For>
    </div>
  )
}

function SplitDiff(props: { before: string; after: string }) {
  const beforeLines = createMemo(() => splitChunkLines(props.before))
  const afterLines = createMemo(() => splitChunkLines(props.after))

  return (
    <div class="grid min-h-full grid-cols-2 divide-x divide-border text-[12px] leading-6 font-mono">
      <div class="min-w-0 overflow-auto py-4">
        <For each={beforeLines()}>
          {(line, index) => (
            <div
              class="grid min-h-[24px] grid-cols-[48px_minmax(0,1fr)]"
              style={{ "background-color": "color-mix(in oklch, var(--icon-diff-delete-base) 14%, transparent)" }}
            >
              <div class="select-none pr-3 text-right text-muted-foreground">{index() + 1}</div>
              <CodeText line={line} />
            </div>
          )}
        </For>
      </div>
      <div class="min-w-0 overflow-auto py-4">
        <For each={afterLines()}>
          {(line, index) => (
            <div
              class="grid min-h-[24px] grid-cols-[48px_minmax(0,1fr)]"
              style={{ "background-color": "color-mix(in oklch, var(--icon-diff-add-base) 14%, transparent)" }}
            >
              <div class="select-none pr-3 text-right text-muted-foreground">{index() + 1}</div>
              <CodeText line={line} />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export function OpencodeSessionPanel(props: Props) {
  const file = createMemo(() => props.activeFile ?? "")
  const openFiles = createMemo(() => props.openFiles ?? (file() ? [file()] : []))
  const [preview] = createResource(
    () => (props.projectPath && file() ? { path: absolutePath(props.projectPath, file()), file: file() } : null),
    async (input) => {
      if (!input) return { before: "", after: "", chunks: [] as Change[] }
      const [before, after] = await Promise.all([
        nativeApi.invoke("get_git_file_base", { path: input.path }).catch(() => "") as Promise<string>,
        nativeApi.invoke("read_text_file", { path: input.path }).catch(() => "") as Promise<string>,
      ])
      const chunks = diffLines(before ?? "", after ?? "")
      return { before: before ?? "", after: after ?? "", chunks }
    },
  )
  const lines = createMemo(() => String(preview()?.after ?? "").split(/\r?\n/))
  const hasDiff = createMemo(() => {
    const data = preview()
    return Boolean(data && data.before !== data.after)
  })
  return (
    <section class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div class="h-[56px] shrink-0 border-b border-border bg-background">
        <div class="flex h-full min-w-0 items-center gap-0 px-5">
          <div class="w-[66px] shrink-0 text-[13px] font-medium text-muted-foreground">Review</div>
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden">
            <For each={openFiles()}>
              {(path) => {
                const active = createMemo(() => path === file())
                return (
                  <div
                    class="group relative flex h-[30px] max-w-[190px] shrink-0 items-center gap-2 rounded-[6px] px-2.5 text-left text-[13px] font-medium transition-colors"
                    classList={{
                      "bg-accent text-foreground": active(),
                      "text-muted-foreground hover:bg-accent/60 hover:text-foreground": !active(),
                    }}
                    title={path}
                  >
                    <button
                      type="button"
                      onClick={() => props.onSelectFile?.(path)}
                      class="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <FileIcon node={{ path, type: "file" }} class="size-[14px] shrink-0" />
                      <span class="min-w-0 truncate">{filename(path)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onCloseFile?.(path)}
                      class="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                      aria-label={`Close ${filename(path)}`}
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                    <span
                      class="absolute inset-x-0 bottom-[-14px] h-px bg-foreground transition-opacity"
                      classList={{ "opacity-100": active(), "opacity-0": !active() }}
                    />
                  </div>
                )
              }}
            </For>
            <button
              type="button"
              class="ml-2 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              title="Open files from the file tree"
            >
              <Icon name="plus-small" size="small" />
            </button>
          </div>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto bg-background">
        <Show
          when={file()}
          fallback={<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Select a file</div>}
        >
          <Show when={!preview.loading} fallback={<div class="p-6 text-sm text-muted-foreground">Loading...</div>}>
            <Show
              when={hasDiff()}
              fallback={
                <div class="py-3">
                  <For each={lines()}>{(line, index) => <CodeLine line={line} index={index()} />}</For>
                </div>
              }
            >
              <UnifiedDiff chunks={preview()?.chunks ?? []} />
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  )
}

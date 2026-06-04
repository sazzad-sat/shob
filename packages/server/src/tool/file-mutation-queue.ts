import path from "path"
import { Effect } from "effect"
import { FileTime } from "@/file/time"
import { Filesystem } from "@/util/filesystem"
import type { Tool } from "./tool"

const EXTRA_LOCKS_KEY = "__toolMutationQueueLocks"

function normalize(file: string) {
  return Filesystem.normalizePath(path.resolve(file))
}

function getHeldLocks(ctx: Tool.Context) {
  const held = ctx.extra?.[EXTRA_LOCKS_KEY]
  if (held instanceof Set) return held as Set<string>
  return new Set<string>()
}

function setHeldLocks(ctx: Tool.Context, held: Set<string> | undefined) {
  if (!ctx.extra) ctx.extra = {}
  if (!held || held.size === 0) {
    delete ctx.extra[EXTRA_LOCKS_KEY]
    return
  }
  ctx.extra[EXTRA_LOCKS_KEY] = held
}

function uniqueSorted(files: string[]) {
  return Array.from(new Set(files.filter(Boolean).map(normalize))).sort((a, b) => a.localeCompare(b))
}

function lockAll<T, E, R>(
  filetime: FileTime.Interface,
  files: string[],
  index: number,
  fn: () => Effect.Effect<T, E, R>,
): Effect.Effect<T, E, R> {
  const file = files[index]
  if (!file) return fn()
  return filetime.withLock(file, () => lockAll(filetime, files, index + 1, fn) as Effect.Effect<T>) as Effect.Effect<
    T,
    E,
    R
  >
}

export namespace FileMutationQueue {
  export function files<T, E, R>(
    filetime: FileTime.Interface,
    ctx: Tool.Context,
    files: string[],
    fn: () => Effect.Effect<T, E, R>,
  ): Effect.Effect<T, E, R> {
    const normalized = uniqueSorted(files)
    if (normalized.length === 0) return fn()

    const previous = getHeldLocks(ctx)
    const missing = normalized.filter((file) => !previous.has(file))
    if (missing.length === 0) return fn()

    const next = new Set([...previous, ...missing])
    return Effect.acquireUseRelease(
      Effect.sync(() => {
        setHeldLocks(ctx, next)
      }),
      () => lockAll(filetime, missing, 0, fn),
      () =>
        Effect.sync(() => {
          setHeldLocks(ctx, previous.size > 0 ? previous : undefined)
        }),
    )
  }

  export function file<T, E, R>(
    filetime: FileTime.Interface,
    ctx: Tool.Context,
    file: string,
    fn: () => Effect.Effect<T, E, R>,
  ): Effect.Effect<T, E, R> {
    return files(filetime, ctx, [file], fn)
  }
}

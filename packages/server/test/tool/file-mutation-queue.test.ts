import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import path from "path"
import type { FileTime } from "../../src/file/time"
import { FileMutationQueue } from "../../src/tool/file-mutation-queue"
import type { Tool } from "../../src/tool/tool"
import { Filesystem } from "../../src/util/filesystem"

function normalize(file: string) {
  return Filesystem.normalizePath(path.resolve(file))
}

function fakeFileTime(locks: string[]): FileTime.Interface {
  return {
    read: () => Effect.void,
    get: () => Effect.succeed(undefined),
    assert: () => Effect.void,
    withLock: (file, fn) =>
      Effect.gen(function* () {
        locks.push(file)
        return yield* fn()
      }),
  }
}

describe("tool.file-mutation-queue", () => {
  test("locks unique files in deterministic order", async () => {
    const locks: string[] = []
    const ctx = { extra: {} } as Tool.Context
    const filetime = fakeFileTime(locks)

    const result = await Effect.runPromise(
      FileMutationQueue.files(filetime, ctx, ["b.txt", "a.txt", "a.txt"], () => Effect.succeed("done")),
    )

    expect(result).toBe("done")
    expect(locks).toEqual([normalize("a.txt"), normalize("b.txt")])
    expect(ctx.extra?.__toolMutationQueueLocks).toBeUndefined()
  })

  test("does not reacquire a lock already held by an outer mutation", async () => {
    const locks: string[] = []
    const ctx = { extra: {} } as Tool.Context
    const filetime = fakeFileTime(locks)

    const result = await Effect.runPromise(
      FileMutationQueue.file(filetime, ctx, "same.txt", () =>
        FileMutationQueue.file(filetime, ctx, "same.txt", () => Effect.succeed("nested")),
      ),
    )

    expect(result).toBe("nested")
    expect(locks).toEqual([normalize("same.txt")])
    expect(ctx.extra?.__toolMutationQueueLocks).toBeUndefined()
  })
})

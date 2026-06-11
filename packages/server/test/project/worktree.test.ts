import { $ } from "bun"
import { afterEach, describe, expect, test } from "bun:test"

const wintest = process.platform !== "win32" ? test : test.skip
import fs from "fs/promises"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Worktree } from "../../src/worktree"
import { tmpdir } from "../fixture/fixture"

function withInstance(directory: string, fn: () => Promise<any>) {
  return Instance.provide({ directory, fn })
}

function normalize(input: string) {
  return input.replace(/\\/g, "/").toLowerCase()
}

async function waitReady() {
  const { GlobalBus } = await import("../../src/bus/global")

  return await new Promise<{ name: string; branch?: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      GlobalBus.off("event", on)
      reject(new Error("timed out waiting for worktree.ready"))
    }, 10_000)

    function on(evt: { directory?: string; payload: { type: string; properties: { name: string; branch?: string } } }) {
      if (evt.payload.type !== Worktree.Event.Ready.type) return
      clearTimeout(timer)
      GlobalBus.off("event", on)
      resolve(evt.payload.properties)
    }

    GlobalBus.on("event", on)
  })
}

describe("Worktree", () => {
  afterEach(() => Instance.disposeAll())

  describe("makeWorktreeInfo", () => {
    test("returns detached info with name, commit, and directory", async () => {
      await using tmp = await tmpdir({ git: true })

      const info = await withInstance(tmp.path, () => Worktree.makeWorktreeInfo())

      expect(info.name).toBeDefined()
      expect(typeof info.name).toBe("string")
      expect(info.branch).toBeUndefined()
      expect(info.detached).toBe(true)
      expect(info.baseCommit).toMatch(/^[0-9a-f]{40}$/)
      expect(normalize(info.directory)).toContain(normalize(path.join(".shob", "worktrees")))
      expect(info.directory).toContain(info.name)
    })

    test("uses provided name as base", async () => {
      await using tmp = await tmpdir({ git: true })

      const info = await withInstance(tmp.path, () => Worktree.makeWorktreeInfo("my-feature"))

      expect(info.name).toBe("my-feature")
      expect(info.branch).toBeUndefined()
    })

    test("slugifies the provided name", async () => {
      await using tmp = await tmpdir({ git: true })

      const info = await withInstance(tmp.path, () => Worktree.makeWorktreeInfo("My Feature Branch!"))

      expect(info.name).toBe("my-feature-branch")
    })

    test("throws NotGitError for non-git directories", async () => {
      await using tmp = await tmpdir()

      await expect(withInstance(tmp.path, () => Worktree.makeWorktreeInfo())).rejects.toThrow("WorktreeNotGitError")
    })
  })

  describe("create + remove lifecycle", () => {
    test("creates distinct detached worktrees", async () => {
      await using tmp = await tmpdir({ git: true })

      const first = await withInstance(tmp.path, () => Worktree.create())
      const second = await withInstance(tmp.path, () => Worktree.create())

      expect(first.directory).not.toBe(second.directory)
      expect(first.baseCommit).toBe(second.baseCommit)
      expect(first.detached).toBe(true)
      expect(second.detached).toBe(true)

      await withInstance(tmp.path, () => Worktree.remove({ directory: first.directory }))
      await withInstance(tmp.path, () => Worktree.remove({ directory: second.directory }))
    })

    test("copies staged, unstaged, and untracked changes when requested", async () => {
      await using tmp = await tmpdir({ git: true })
      const staged = path.join(tmp.path, "staged.txt")
      const unstaged = path.join(tmp.path, "unstaged.txt")
      const untracked = path.join(tmp.path, "untracked.txt")

      await fs.writeFile(staged, "base\n")
      await fs.writeFile(unstaged, "base\n")
      await $`git add staged.txt unstaged.txt`.cwd(tmp.path).quiet()
      await $`git commit -m base`.cwd(tmp.path).quiet()
      await fs.writeFile(staged, "staged change\n")
      await $`git add staged.txt`.cwd(tmp.path).quiet()
      await fs.writeFile(unstaged, "unstaged change\n")
      await fs.writeFile(untracked, "untracked change\n")

      const info = await withInstance(tmp.path, () => Worktree.create({ includeLocalChanges: true }))

      expect((await fs.readFile(path.join(info.directory, "staged.txt"), "utf8")).trim()).toBe("staged change")
      expect((await fs.readFile(path.join(info.directory, "unstaged.txt"), "utf8")).trim()).toBe("unstaged change")
      expect((await fs.readFile(path.join(info.directory, "untracked.txt"), "utf8")).trim()).toBe("untracked change")
      const status = await $`git status --porcelain`.cwd(info.directory).quiet().text()
      expect(status).toContain("M  staged.txt")
      expect(status).toContain(" M unstaged.txt")
      expect(status).toContain("?? untracked.txt")

      await withInstance(tmp.path, () => Worktree.remove({ directory: info.directory }))
    })

    test("create returns worktree info and remove cleans up", async () => {
      await using tmp = await tmpdir({ git: true })

      const info = await withInstance(tmp.path, () => Worktree.create())

      expect(info.name).toBeDefined()
      expect(info.branch).toBeUndefined()
      expect(info.detached).toBe(true)
      expect(info.directory).toBeDefined()

      // Wait for bootstrap to complete
      await Bun.sleep(1000)

      const ok = await withInstance(tmp.path, () => Worktree.remove({ directory: info.directory }))
      expect(ok).toBe(true)
    })

    test("create returns after setup and fires Event.Ready after bootstrap", async () => {
      await using tmp = await tmpdir({ git: true })
      const ready = waitReady()

      const info = await withInstance(tmp.path, () => Worktree.create())

      // create returns before bootstrap completes, but the worktree already exists
      expect(info.name).toBeDefined()
      expect(info.branch).toBeUndefined()

      const text = await $`git worktree list --porcelain`.cwd(tmp.path).quiet().text()
      const dir = await fs.realpath(info.directory).catch(() => info.directory)
      expect(normalize(text)).toContain(normalize(dir))

      // Event.Ready fires after bootstrap finishes in the background
      const props = await ready
      expect(props.name).toBe(info.name)
      expect(props.branch).toBeUndefined()

      // Cleanup
      await withInstance(info.directory, () => Instance.dispose())
      await Bun.sleep(100)
      await withInstance(tmp.path, () => Worktree.remove({ directory: info.directory }))
    })

    test("create with custom name", async () => {
      await using tmp = await tmpdir({ git: true })
      const ready = waitReady()

      const info = await withInstance(tmp.path, () => Worktree.create({ name: "test-workspace" }))

      expect(info.name).toBe("test-workspace")
      expect(info.branch).toBeUndefined()

      // Cleanup
      await ready
      await withInstance(info.directory, () => Instance.dispose())
      await Bun.sleep(100)
      await withInstance(tmp.path, () => Worktree.remove({ directory: info.directory }))
    })
  })

  describe("createFromInfo", () => {
    wintest("creates and bootstraps git worktree", async () => {
      await using tmp = await tmpdir({ git: true })

      const info = await withInstance(tmp.path, () => Worktree.makeWorktreeInfo("from-info-test"))
      await withInstance(tmp.path, () => Worktree.createFromInfo(info))

      // Worktree should exist in git (normalize slashes for Windows)
      const list = await $`git worktree list --porcelain`.cwd(tmp.path).quiet().text()
      const normalizedList = list.replace(/\\/g, "/")
      const normalizedDir = info.directory.replace(/\\/g, "/")
      expect(normalizedList).toContain(normalizedDir)

      // Cleanup
      await withInstance(tmp.path, () => Worktree.remove({ directory: info.directory }))
    })
  })

  describe("remove edge cases", () => {
    test("remove non-existent directory succeeds silently", async () => {
      await using tmp = await tmpdir({ git: true })

      const ok = await withInstance(tmp.path, () =>
        Worktree.remove({ directory: path.join(tmp.path, "does-not-exist") }),
      )
      expect(ok).toBe(true)
    })

    test("throws NotGitError for non-git directories", async () => {
      await using tmp = await tmpdir()

      await expect(withInstance(tmp.path, () => Worktree.remove({ directory: "/tmp/fake" }))).rejects.toThrow(
        "WorktreeNotGitError",
      )
    })
  })
})

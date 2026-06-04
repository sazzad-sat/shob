import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session"
import { SessionMemory } from "../../src/session/memory"
import { MessageID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const layer = Layer.mergeAll(
  Session.defaultLayer,
  SessionMemory.defaultLayer,
  Bus.layer,
  Config.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
)
const it = testEffect(layer)

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const summary = `## Goal

Make the coding agent more reliable.

## Instructions

- Preserve current files before mutation.
- Prefer the File Mutation Queue for write, edit, multiedit, and apply_patch.

## Discoveries

The agent should remember that apply_patch and write operations need deterministic locks.

## Accomplished

Implemented queue locking and next step is to monitor repair and memory recall.

## Relevant files / directories

- packages/server/src/tool/file-mutation-queue.ts
- packages/server/src/tool/apply_patch.ts`

describe("session.memory", () => {
  it.live("stores compaction summaries as typed searchable memory", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const memory = yield* SessionMemory.Service
        const session = yield* sessions.create({ title: "memory test" })
        const user = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: session.id,
          agent: "build",
          model: ref,
          time: { created: Date.now() },
        })
        const messageID = MessageID.ascending()
        yield* sessions.updateMessage({
          id: messageID,
          role: "assistant",
          parentID: user.id,
          sessionID: session.id,
          mode: "compaction",
          agent: "compaction",
          summary: true,
          path: { cwd: session.directory, root: session.directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          providerID: ref.providerID,
          modelID: ref.modelID,
          time: { created: Date.now() },
        })

        const saved = yield* memory.rememberCompaction({ sessionID: session.id, messageID, summary })
        expect(saved.map((item) => item.type).sort()).toEqual(["episodic", "procedural", "semantic"])

        const results = yield* memory.search({
          sessionID: session.id,
          query: "apply_patch deterministic mutation queue locks",
          limit: 2,
        })
        expect(results.length).toBeGreaterThan(0)
        expect(results[0]?.content).toContain("apply_patch")

        const context = yield* memory.context({
          sessionID: session.id,
          query: "how should apply_patch lock files",
          maxChars: 1_000,
        })
        expect(context).toContain("<memory-context>")
        expect(context).toContain("apply_patch")
      }),
    ),
  )

  it.live("retrieves memories across sessions in the same project", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const memory = yield* SessionMemory.Service
        const first = yield* sessions.create({ title: "first" })
        const second = yield* sessions.create({ title: "second" })

        yield* memory.add({
          sessionID: first.id,
          type: "semantic",
          source: "test",
          title: "Project rule",
          content: "For this project, mutation queue lock ordering must stay deterministic.",
          weight: 9,
        })

        const results = yield* memory.search({
          sessionID: second.id,
          query: "deterministic lock ordering",
        })
        expect(results[0]?.title).toBe("Project rule")
      }),
    ),
  )

  it.live("honors disabled memory config", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const memory = yield* SessionMemory.Service
          const session = yield* sessions.create({ title: "disabled" })

          const saved = yield* memory.rememberCompaction({
            sessionID: session.id,
            messageID: MessageID.ascending(),
            summary,
          })
          expect(saved).toEqual([])
        }),
      { config: { memory: { enabled: false } } },
    ),
  )
})

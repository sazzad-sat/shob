import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { ToolRegistry } from "../../src/tool/registry"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await Instance.disposeAll()
})

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    Config.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    Session.defaultLayer,
    ToolRegistry.defaultLayer,
  ),
)

const seed = Effect.fn("TaskToolTest.seed")(function* (title = "Pinned") {
  const session = yield* Session.Service
  const chat = yield* session.create({ title })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: MessageV2.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

function stubOps(opts?: { onPrompt?: (input: SessionPrompt.PromptInput) => void; text?: string }): TaskPromptOps {
  return {
    cancel() {},
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        opts?.onPrompt?.(input)
        return reply(input, opts?.text ?? "done")
      }),
  }
}

function reply(input: Parameters<typeof SessionPrompt.prompt>[0], text: string): MessageV2.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: input.messageID ?? MessageID.ascending(),
      sessionID: input.sessionID,
      mode: input.agent ?? "general",
      agent: input.agent ?? "general",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: input.model?.modelID ?? ref.modelID,
      providerID: input.model?.providerID ?? ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
    },
    parts: [
      {
        id: PartID.ascending(),
        messageID: id,
        sessionID: input.sessionID,
        type: "text",
        text,
      },
    ],
  }
}

describe("tool.task", () => {
  it.live("description sorts subagents by name and is stable across calls", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const get = Effect.fnUntraced(function* () {
            const tools = yield* registry.tools({ ...ref, agent: build })
            return tools.find((tool) => tool.id === TaskTool.id)?.description ?? ""
          })
          const first = yield* get()
          const second = yield* get()

          expect(first).toBe(second)

          const alpha = first.indexOf("- alpha: Alpha agent")
          const explore = first.indexOf("- explore:")
          const general = first.indexOf("- general:")
          const zebra = first.indexOf("- zebra: Zebra agent")

          expect(alpha).toBeGreaterThan(-1)
          expect(explore).toBeGreaterThan(alpha)
          expect(general).toBeGreaterThan(explore)
          expect(zebra).toBeGreaterThan(general)
        }),
      {
        config: {
          agent: {
            zebra: {
              description: "Zebra agent",
              mode: "subagent",
            },
            alpha: {
              description: "Alpha agent",
              mode: "subagent",
            },
          },
        },
      },
    ),
  )

  it.live("description hides denied subagents for the caller", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const description =
            (yield* registry.tools({ ...ref, agent: build })).find((tool) => tool.id === TaskTool.id)?.description ?? ""

          expect(description).toContain("- alpha: Alpha agent")
          expect(description).not.toContain("- zebra: Zebra agent")
        }),
      {
        config: {
          permission: {
            task: {
              "*": "allow",
              zebra: "deny",
            },
          },
          agent: {
            zebra: {
              description: "Zebra agent",
              mode: "subagent",
            },
            alpha: {
              description: "Alpha agent",
              mode: "subagent",
            },
          },
        },
      },
    ),
  )

  it.live("execute resumes an existing task session from task_id", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const child = yield* sessions.create({ parentID: chat.id, title: "Existing child" })
        const tool = yield* TaskTool
        const def = yield* Effect.promise(() => tool.init())
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps = stubOps({ text: "resumed", onPrompt: (input) => (seen = input) })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: child.id,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const kids = yield* sessions.children(chat.id)
        expect(kids).toHaveLength(1)
        expect(kids[0]?.id).toBe(child.id)
        expect(result.metadata.sessionId).toBe(child.id)
        expect(result.output).toContain(`task_id: ${child.id}`)
        expect(seen?.sessionID).toBe(child.id)
      }),
    ),
  )

  it.live("execute asks by default and skips checks when bypassed", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* Effect.promise(() => tool.init())
        const calls: unknown[] = []
        const promptOps = stubOps()

        const exec = (extra?: Record<string, any>) =>
          def.execute(
            {
              description: "inspect bug",
              prompt: "look into the cache key path",
              subagent_type: "general",
            },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps, ...extra },
              messages: [],
              metadata: () => Effect.void,
              ask: (input) =>
                Effect.sync(() => {
                  calls.push(input)
                }),
            },
          )

        yield* exec()
        yield* exec({ bypassAgentCheck: true })

        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual({
          permission: "task",
          patterns: ["general"],
          always: ["*"],
          metadata: {
            description: "inspect bug",
            subagent_type: "general",
          },
        })
      }),
    ),
  )

  it.live("execute creates a child when task_id does not exist", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* Effect.promise(() => tool.init())
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps = stubOps({ text: "created", onPrompt: (input) => (seen = input) })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: "ses_missing",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const sessionId = result.metadata.sessionId!
        const kids = yield* sessions.children(chat.id)
        expect(kids).toHaveLength(1)
        expect(kids[0]?.id).toBe(sessionId)
        expect(sessionId).not.toBe("ses_missing")
        expect(result.output).toContain(`task_id: ${sessionId}`)
        expect(seen?.sessionID).toBe(sessionId)
      }),
    ),
  )

  it.live("execute shapes child permissions for task, todowrite, and primary tools", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const { chat, assistant } = yield* seed()
          const tool = yield* TaskTool
          const def = yield* Effect.promise(() => tool.init())
          let seen: SessionPrompt.PromptInput | undefined
          const promptOps = stubOps({ onPrompt: (input) => (seen = input) })

          const result = yield* def.execute(
            {
              description: "inspect bug",
              prompt: "look into the cache key path",
              subagent_type: "reviewer",
            },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps },
              messages: [],
              metadata: () => Effect.void,
              ask: () => Effect.void,
            },
          )

          const sessionId = result.metadata.sessionId!
          const child = yield* sessions.get(sessionId)
          expect(child.parentID).toBe(chat.id)
          expect(child.permission).toEqual([
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "bash",
              pattern: "*",
              action: "allow",
            },
            {
              permission: "read",
              pattern: "*",
              action: "allow",
            },
          ])
          expect(seen?.tools).toEqual({
            todowrite: false,
            bash: false,
            read: false,
          })
        }),
      {
        config: {
          agent: {
            reviewer: {
              mode: "subagent",
              permission: {
                task: "allow",
              },
            },
          },
          experimental: {
            primary_tools: ["bash", "read"],
          },
        },
      },
    ),
  )

  it.live("execute runs independent tasks in parallel mode", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* Effect.promise(() => tool.init())
        const prompts: SessionPrompt.PromptInput[] = []
        const promptOps = stubOps({ text: "parallel done", onPrompt: (input) => prompts.push(input) })

        const result = yield* def.execute(
          {
            tasks: [
              {
                description: "inspect cache",
                prompt: "inspect cache path",
                subagent_type: "general",
              },
              {
                description: "review api",
                prompt: "review api path",
                subagent_type: "general",
              },
            ],
            concurrency: 2,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const kids = yield* sessions.children(chat.id)
        expect(kids).toHaveLength(2)
        expect(prompts).toHaveLength(2)
        expect((result.metadata as any).mode).toBe("parallel")
        expect((result.metadata as any).results).toHaveLength(2)
        expect(result.output).toContain("Parallel tasks: 2/2 succeeded")
        expect(result.output).toContain('index="1"')
        expect(result.output).toContain('index="2"')
      }),
    ),
  )

  it.live("execute passes previous step output through chain mode", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* Effect.promise(() => tool.init())
        const resolved: string[] = []
        const promptOps: TaskPromptOps = {
          cancel() {},
          resolvePromptParts: (template) =>
            Effect.sync(() => {
              resolved.push(template)
              return [{ type: "text" as const, text: template }]
            }),
          prompt: (input) =>
            Effect.sync(() => {
              const text = input.parts.find((part) => part.type === "text")?.text ?? ""
              return reply(input, `result(${text})`)
            }),
        }

        const result = yield* def.execute(
          {
            chain: [
              {
                description: "first step",
                prompt: "find issue",
                subagent_type: "general",
              },
              {
                description: "second step",
                prompt: "fix using {previous}",
                subagent_type: "general",
              },
            ],
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect(resolved).toHaveLength(2)
        expect(resolved[0]).toBe("find issue")
        expect(resolved[1]).toContain("result(find issue)")
        expect((result.metadata as any).mode).toBe("chain")
        expect(result.output).toContain("Chain tasks: 2 completed")
        expect(result.output).toContain('step="2"')
      }),
    ),
  )
})

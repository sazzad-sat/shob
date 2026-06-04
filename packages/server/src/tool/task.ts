import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "../config/config"
import { Cause, Effect, Exit } from "effect"
import type { ModelID, ProviderID } from "../provider/schema"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): void
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<MessageV2.WithParts>
}

const id = "task"

const MAX_PARALLEL_TASKS = 8
const MAX_TASK_CONCURRENCY = 4

const taskItem = z.object({
  description: z.string().optional().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

const parameters = taskItem.extend({
  description: z.string().optional().describe("A short (3-5 words) description of the task"),
  prompt: z.string().optional().describe("The task for the agent to perform"),
  subagent_type: z.string().optional().describe("The type of specialized agent to use for this task"),
  tasks: z
    .array(taskItem)
    .max(MAX_PARALLEL_TASKS)
    .optional()
    .describe("Run multiple independent subagent tasks in parallel."),
  chain: z
    .array(
      taskItem.extend({
        prompt: z
          .string()
          .describe("Sequential task prompt. Use {previous} to include the previous step's result."),
      }),
    )
    .max(MAX_PARALLEL_TASKS)
    .optional()
    .describe("Run subagent tasks sequentially, passing each result to the next step with {previous}."),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(MAX_TASK_CONCURRENCY)
    .optional()
    .describe("Maximum parallel task concurrency, default 4."),
})

type TaskParams = z.infer<typeof parameters>
type TaskItem = z.infer<typeof taskItem>
type NormalizedTask = TaskItem & { description: string }
type TaskModel = {
  providerID: ProviderID
  modelID: ModelID
}
type TaskMetadata = {
  sessionId?: SessionID
  model?: TaskModel
  agent?: string
  description?: string
  mode?: "parallel" | "chain"
  concurrency?: number
  results?: Array<{
    ok?: boolean
    step?: number
    agent: string
    description: string
    sessionId?: SessionID
    model?: TaskModel
    error?: string
  }>
}

function shortDescription(prompt: string, fallback: string) {
  const words = prompt
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
  return words.slice(0, 5).join(" ") || fallback
}

function normalizeTask(input: TaskItem, fallback: string): NormalizedTask {
  return {
    ...input,
    description: input.description?.trim() || shortDescription(input.prompt, fallback),
  }
}

function singleModeInput(params: TaskParams): NormalizedTask {
  if (!params.prompt || !params.subagent_type) {
    throw new Error("Task mode requires prompt and subagent_type. For parallel mode use tasks, for chain mode use chain.")
  }
  return normalizeTask(
    {
      description: params.description,
      prompt: params.prompt,
      subagent_type: params.subagent_type,
      task_id: params.task_id,
      command: params.command,
    },
    "subagent task",
  )
}

function hasSingleFields(params: TaskParams) {
  return Boolean(params.description || params.prompt || params.subagent_type || params.task_id || params.command)
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const TaskTool = Tool.define<typeof parameters, TaskMetadata, Agent.Service | Config.Service | Session.Service>(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service

    const runSingle = Effect.fn("TaskTool.runSingle")(function* (
      params: NormalizedTask,
      ctx: Tool.Context,
      options?: { emitMetadata?: boolean },
    ) {
      const cfg = yield* config.get()

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      const canTask = next.permission.some((rule) => rule.permission === id)
      const canTodo = next.permission.some((rule) => rule.permission === "todowrite")

      const taskID = params.task_id
      const session = taskID
        ? yield* sessions.get(SessionID.make(taskID)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
          permission: [
            ...(canTodo
              ? []
              : [
                  {
                    permission: "todowrite" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(canTask
              ? []
              : [
                  {
                    permission: id,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(cfg.experimental?.primary_tools?.map((item) => ({
              pattern: "*",
              action: "allow" as const,
              permission: item,
            })) ?? []),
          ],
        }))

      const msg = yield* Effect.sync(() => MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }))
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      const model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      if (options?.emitMetadata !== false) {
        yield* ctx.metadata({
          title: params.description,
          metadata: {
            sessionId: nextSession.id,
            model,
          },
        })
      }

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const messageID = MessageID.ascending()

      function cancel() {
        ops.cancel(nextSession.id)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", cancel)
        }),
        () =>
          Effect.gen(function* () {
            const parts = yield* ops.resolvePromptParts(params.prompt)
            const result = yield* ops.prompt({
              messageID,
              sessionID: nextSession.id,
              model: {
                modelID: model.modelID,
                providerID: model.providerID,
              },
              agent: next.name,
              tools: {
                ...(canTodo ? {} : { todowrite: false }),
                ...(canTask ? {} : { task: false }),
                ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
              },
              parts,
            })
            const text = result.parts.findLast((item) => item.type === "text")?.text ?? ""

            return {
              title: params.description,
              metadata: {
                sessionId: nextSession.id,
                model,
                agent: next.name,
                description: params.description,
              },
              output: [
                `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
                "",
                "<task_result>",
                text,
                "</task_result>",
              ].join("\n"),
              text,
            }
          }),
        () =>
          Effect.sync(() => {
            ctx.abort.removeEventListener("abort", cancel)
          }),
      )
    })

    const runParallel = Effect.fn("TaskTool.runParallel")(function* (params: TaskParams, ctx: Tool.Context) {
      const tasks = (params.tasks ?? []).map((task, index) => normalizeTask(task, `parallel task ${index + 1}`))
      if (tasks.length === 0) return yield* Effect.fail(new Error("Parallel mode requires at least one task."))

      const concurrency = Math.min(params.concurrency ?? MAX_TASK_CONCURRENCY, tasks.length)
      const results = yield* Effect.forEach(
        tasks,
        (task, index) =>
          runSingle(task, ctx, { emitMetadata: false }).pipe(
            Effect.exit,
            Effect.map((exit) => {
              if (Exit.isSuccess(exit)) {
                return {
                  ok: true as const,
                  index,
                  task,
                  result: exit.value,
                }
              }
              return {
                ok: false as const,
                index,
                task,
                error: errorText(Cause.squash(exit.cause)),
              }
            }),
          ),
        { concurrency },
      )

      const succeeded = results.filter((item) => item.ok).length
      const output = [
        `Parallel tasks: ${succeeded}/${results.length} succeeded`,
        "",
        ...results.flatMap((item) => {
          if (!item.ok) {
            return [
              `<task_error index="${item.index + 1}" agent="${item.task.subagent_type}">`,
              item.error,
              "</task_error>",
              "",
            ]
          }
          return [
            `<task_result index="${item.index + 1}" agent="${item.task.subagent_type}" task_id="${item.result.metadata.sessionId}">`,
            item.result.text,
            "</task_result>",
            "",
          ]
        }),
      ].join("\n")

      return {
        title: `parallel tasks ${succeeded}/${results.length}`,
        metadata: {
          mode: "parallel" as const,
          concurrency,
          results: results.map((item) =>
            item.ok
              ? {
                  ok: true,
                  agent: item.task.subagent_type,
                  description: item.task.description,
                  sessionId: item.result.metadata.sessionId,
                  model: item.result.metadata.model,
                }
              : {
                  ok: false,
                  agent: item.task.subagent_type,
                  description: item.task.description,
                  error: item.error,
                },
          ),
        },
        output: output.trimEnd(),
      }
    })

    const runChain = Effect.fn("TaskTool.runChain")(function* (params: TaskParams, ctx: Tool.Context) {
      const chain = params.chain ?? []
      if (chain.length === 0) return yield* Effect.fail(new Error("Chain mode requires at least one task."))

      let previous = ""
      const results = []
      for (const [index, raw] of chain.entries()) {
        const task = normalizeTask(
          {
            ...raw,
            prompt: raw.prompt.replaceAll("{previous}", previous),
          },
          `chain step ${index + 1}`,
        )
        const result = yield* runSingle(task, ctx, { emitMetadata: false })
        previous = result.text
        results.push({ task, result })
      }

      return {
        title: `chain tasks ${results.length}`,
        metadata: {
          mode: "chain" as const,
          results: results.map((item, index) => ({
            step: index + 1,
            agent: item.task.subagent_type,
            description: item.task.description,
            sessionId: item.result.metadata.sessionId,
            model: item.result.metadata.model,
          })),
        },
        output: [
          `Chain tasks: ${results.length} completed`,
          "",
          ...results.flatMap((item, index) => [
            `<task_result step="${index + 1}" agent="${item.task.subagent_type}" task_id="${item.result.metadata.sessionId}">`,
            item.result.text,
            "</task_result>",
            "",
          ]),
        ]
          .join("\n")
          .trimEnd(),
      }
    })

    const run = Effect.fn("TaskTool.execute")(function* (params: TaskParams, ctx: Tool.Context) {
      const modes = [
        hasSingleFields(params),
        (params.tasks?.length ?? 0) > 0,
        (params.chain?.length ?? 0) > 0,
      ].filter(Boolean).length
      if (modes !== 1) {
        return yield* Effect.fail(
          new Error("Provide exactly one task mode: single prompt/subagent_type, tasks for parallel, or chain."),
        )
      }

      if ((params.tasks?.length ?? 0) > 0) return yield* runParallel(params, ctx)
      if ((params.chain?.length ?? 0) > 0) return yield* runChain(params, ctx)
      return yield* runSingle(singleModeInput(params), ctx)
    })

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)

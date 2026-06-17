import { describe, expect, test } from "bun:test"
import type { Part } from "@shob-ai/sdk/v2"
import { groupAssistantDisplayParts, orderAssistantDisplayParts, type AssistantPartEntry } from "./message-part-order"

const sessionID = "ses_test"
const messageID = "msg_test"

function entry(part: Part, messageCompleted = false): AssistantPartEntry {
  return { messageID, messageCompleted, part }
}

function text(id: string, finished = true): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "text",
    text: "final answer",
    time: finished ? { start: 1, end: 2 } : { start: 1 },
  } as Part
}

function reasoning(id: string, finished = true): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "reasoning",
    text: "thinking summary",
    time: finished ? { start: 1, end: 2 } : { start: 1 },
  } as Part
}

function tool(id: string, status: "pending" | "running" | "completed" | "error" = "completed"): Part {
  const base = {
    id,
    sessionID,
    messageID,
    type: "tool",
    tool: "read",
    callID: id,
  }
  if (status === "error") {
    return {
      ...base,
      state: {
        status,
        input: {},
        error: "failed",
        time: { start: 1, end: 2 },
      },
    } as Part
  }
  return {
    ...base,
    state: {
      status,
      input: {},
      output: status === "completed" ? "" : undefined,
      time: status === "completed" ? { start: 1, end: 2 } : { start: 1 },
    },
  } as Part
}

const isTool = (part: Part) => part.type === "tool"
const ids = (parts: AssistantPartEntry[]) => parts.map((item) => item.part.id)

describe("message part display ordering", () => {
  test("preserves natural part order", () => {
    const parts = [entry(text("text_1")), entry(reasoning("reasoning_1"))]

    expect(orderAssistantDisplayParts(parts)).toBe(parts)
    expect(ids(orderAssistantDisplayParts(parts))).toEqual(["text_1", "reasoning_1"])
  })

  test("live unfinished reasoning hides a later running tool", () => {
    const parts = [entry(reasoning("reasoning_1", false)), entry(tool("tool_1", "running"))]

    expect(ids(orderAssistantDisplayParts(parts, { live: true }))).toEqual(["reasoning_1"])
  })

  test("finished reasoning allows the next running tool to appear", () => {
    const parts = [entry(reasoning("reasoning_1")), entry(tool("tool_1", "running"))]

    expect(ids(orderAssistantDisplayParts(parts, { live: true }))).toEqual(["reasoning_1", "tool_1"])
  })

  test("running tool hides later text", () => {
    const parts = [entry(tool("tool_1", "running")), entry(text("text_1", false))]

    expect(ids(orderAssistantDisplayParts(parts, { live: true }))).toEqual(["tool_1"])
  })

  test("non-live mode shows all parts even with missing completion fields", () => {
    const parts = [entry(reasoning("reasoning_1", false)), entry(tool("tool_1", "running")), entry(text("text_1", false))]

    expect(orderAssistantDisplayParts(parts, { live: false })).toBe(parts)
    expect(ids(orderAssistantDisplayParts(parts, { live: false }))).toEqual(["reasoning_1", "tool_1", "text_1"])
  })

  test("keeps adjacent tools in one context group", () => {
    const groups = groupAssistantDisplayParts([entry(tool("tool_1")), entry(tool("tool_2"))], isTool)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({
      key: "context:tool_1",
      type: "context",
      refs: [
        { messageID, partID: "tool_1" },
        { messageID, partID: "tool_2" },
      ],
    })
  })

  test("groups completed tool plus current running tool while later text waits", () => {
    const groups = groupAssistantDisplayParts(
      [entry(tool("tool_1")), entry(tool("tool_2", "running")), entry(text("text_1", false))],
      isTool,
      { live: true },
    )

    expect(groups).toEqual([
      {
        key: "context:tool_1",
        type: "context",
        refs: [
          { messageID, partID: "tool_1" },
          { messageID, partID: "tool_2" },
        ],
      },
    ])
  })

  test("does not create a context group for reasoning-only content", () => {
    const groups = groupAssistantDisplayParts([entry(reasoning("reasoning_1"))], isTool)

    expect(groups).toEqual([
      {
        key: `part:${messageID}:reasoning_1`,
        type: "part",
        ref: { messageID, partID: "reasoning_1" },
      },
    ])
  })
})

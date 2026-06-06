import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { groupAssistantDisplayParts, orderAssistantDisplayParts, type AssistantPartEntry } from "./message-part-order"

const sessionID = "ses_test"
const messageID = "msg_test"

function entry(part: Part): AssistantPartEntry {
  return { messageID, part }
}

function text(id: string): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "text",
    text: "final answer",
  } as Part
}

function reasoning(id: string): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "reasoning",
    text: "thinking summary",
    time: { start: 1, end: 2 },
  } as Part
}

function tool(id: string): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "tool",
    tool: "read",
    callID: id,
    state: {
      status: "completed",
      input: {},
      output: "",
      time: { start: 1, end: 2 },
    },
  } as Part
}

const isTool = (part: Part) => part.type === "tool"
const ids = (parts: AssistantPartEntry[]) => parts.map((item) => item.part.id)

describe("message part display ordering", () => {
  test("moves late reasoning before the first text answer", () => {
    const parts = [entry(text("text_1")), entry(reasoning("reasoning_1"))]

    expect(ids(orderAssistantDisplayParts(parts))).toEqual(["reasoning_1", "text_1"])
  })

  test("keeps reasoning before text unchanged", () => {
    const parts = [entry(reasoning("reasoning_1")), entry(text("text_1"))]

    expect(orderAssistantDisplayParts(parts)).toBe(parts)
    expect(ids(orderAssistantDisplayParts(parts))).toEqual(["reasoning_1", "text_1"])
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

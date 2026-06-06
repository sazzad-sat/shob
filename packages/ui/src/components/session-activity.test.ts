import { describe, expect, test } from "bun:test"
import { getAssistantActivityLabel, type ActivityMessage, type ActivityPart } from "./session-activity"

const dict: Record<string, string> = {
  "ui.sessionTurn.status.delegating": "Delegating work",
  "ui.sessionTurn.status.gatheringContext": "Exploring",
  "ui.sessionTurn.status.makingEdits": "Making edits",
  "ui.sessionTurn.status.runningCommands": "Running commands",
}

const t = (key: string, params?: Record<string, string | number | boolean>) =>
  (dict[key] ?? key).replace(/{{\s*([^}]+?)\s*}}/g, (_, raw) => String(params?.[String(raw)] ?? ""))

function label(messages: ActivityMessage[], parts: Record<string, ActivityPart[]>) {
  return getAssistantActivityLabel({
    messages,
    getParts: (messageID) => parts[messageID],
    t,
  })
}

describe("assistant activity label", () => {
  test("detects a running read tool from its input", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "read",
              state: { status: "running", input: { filePath: "C:/repo/src/components/AgentView.tsx" } },
            },
          ],
        },
      ),
    ).toBe("Reading AgentView.tsx")
  })

  test("detects search work from tool input", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "grep",
              state: { status: "running", input: { pattern: "createMemo" } },
            },
          ],
        },
      ),
    ).toBe("Searching createMemo")
  })

  test("uses the newest active tool", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            { type: "tool", tool: "grep", state: { status: "running", input: { pattern: "foo" } } },
            { type: "tool", tool: "bash", state: { status: "running", input: { description: "tests" } } },
          ],
        },
      ),
    ).toBe("Running tests")
  })

  test("detects editing from file tool input", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "edit",
              state: { status: "running", input: { filePath: "packages/ui/src/components/session-turn.tsx" } },
            },
          ],
        },
      ),
    ).toBe("Editing session-turn.tsx")
  })

  test("detects streamed answer text", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [{ type: "text", text: "Here is the fix" }],
        },
      ),
    ).toBe("Working")
  })

  test("detects reasoning topic", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [{ type: "reasoning", text: "## Checking resize behavior\n\nNeed to inspect the UI." }],
        },
      ),
    ).toBe("Analyzing Checking resize behavior")
  })

  test("falls back only when there is no live signal yet", () => {
    expect(label([{ id: "msg_1", role: "assistant", time: {} }], { msg_1: [] })).toBe("Exploring")
  })
})

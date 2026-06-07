import { describe, expect, test } from "bun:test"
import {
  activityKindForVisibleParts,
  activityLabel,
  activityTitleForVisibleParts,
  getAssistantActivityLabel,
  SPINNER_VERBS,
  type ActivityMessage,
  type ActivityPart,
} from "./session-activity"

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

  test("prioritizes a visible inspected group over later reasoning", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "read",
              state: { status: "completed", input: { filePath: "src/routes/profile/+page.svelte" } },
            },
            { type: "tool", tool: "read", state: { status: "completed", input: { filePath: "src/app.css" } } },
            { type: "reasoning", text: "## Checking SEO\n\nNeed to inspect the files." },
          ],
        },
      ),
    ).toBe("Inspecting 2 items")
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

  test("detects reasoning without adding the topic to the title", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [{ type: "reasoning", text: "## Checking resize behavior\n\nNeed to inspect the UI." }],
        },
      ),
    ).toBe("Reasoning")
  })

  test("falls back only when there is no live signal yet", () => {
    expect(label([{ id: "msg_1", role: "assistant", time: {} }], { msg_1: [] })).toBe("Working")
  })

  test("keeps the action label verbs available", () => {
    expect(SPINNER_VERBS).toContain("Working")
    expect(SPINNER_VERBS).toContain("Reasoning")
    expect(SPINNER_VERBS).toContain("Reading")
    expect(SPINNER_VERBS).toContain("Inspecting")
    expect(SPINNER_VERBS).toContain("Editing")
  })

  test("derives labels from explicitly visible parts", () => {
    expect(activityLabel(activityKindForVisibleParts([]))).toBe("Working")
    expect(activityLabel(activityKindForVisibleParts([{ type: "reasoning", text: "thinking" }]))).toBe("Reasoning")
    expect(activityTitleForVisibleParts([])).toBe("Working")
    expect(activityTitleForVisibleParts([{ type: "reasoning", text: "thinking" }])).toBe("Reasoning")
    expect(
      activityTitleForVisibleParts([
        { type: "tool", tool: "read", state: { status: "completed", input: { filePath: "src/app.css" } } },
        { type: "reasoning", text: "later reasoning" },
      ]),
    ).toBe("Reading app.css")
    expect(
      activityTitleForVisibleParts([
        { type: "tool", tool: "grep", state: { status: "running", input: { pattern: "createMemo" } } },
        { type: "reasoning", text: "later reasoning" },
      ]),
    ).toBe("Searching createMemo")
  })

  test("allows dynamic spinner fallback when no live signal exists", () => {
    expect(
      getAssistantActivityLabel({
        messages: [{ id: "msg_1", role: "assistant", time: {} }],
        getParts: () => [],
        t,
        fallback: "Checking",
      }),
    ).toBe("Checking")
  })
})

import { describe, expect, test } from "bun:test"
import { getReasoningDisplayState, REASONING_VISIBLE_CHARACTER_LIMIT } from "./message-part-reasoning-state"

describe("message part reasoning display state", () => {
  test("does not render whitespace-only reasoning", () => {
    expect(getReasoningDisplayState(" \n\t ")).toEqual({
      text: "",
      visible: false,
      defaultOpen: false,
      autoOpenOnPending: false,
    })
  })

  test("opens short reasoning by default", () => {
    const state = getReasoningDisplayState("Checking the current code path.")

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(true)
    expect(state.autoOpenOnPending).toBe(true)
  })

  test("collapses completed reasoning above the visible character limit", () => {
    const state = getReasoningDisplayState("a".repeat(REASONING_VISIBLE_CHARACTER_LIMIT + 1))

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(false)
    expect(state.autoOpenOnPending).toBe(true)
  })

  test("keeps streaming reasoning open above the visible character limit", () => {
    const state = getReasoningDisplayState("a".repeat(REASONING_VISIBLE_CHARACTER_LIMIT + 1), { streaming: true })

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(true)
    expect(state.autoOpenOnPending).toBe(true)
  })
})

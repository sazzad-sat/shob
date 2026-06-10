import { describe, expect, test } from "bun:test"
import { getReasoningDisplayState } from "./message-part-reasoning-state"

describe("message part reasoning display state", () => {
  test("does not render whitespace-only reasoning", () => {
    expect(getReasoningDisplayState(" \n\t ")).toEqual({
      text: "",
      visible: false,
      defaultOpen: false,
      autoOpenOnPending: false,
    })
  })

  test("collapses short reasoning by default", () => {
    const state = getReasoningDisplayState("Checking the current code path.")

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(false)
    expect(state.autoOpenOnPending).toBe(true)
  })

  test("collapses long reasoning by default", () => {
    const state = getReasoningDisplayState("a".repeat(351))

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(false)
    expect(state.autoOpenOnPending).toBe(true)
  })

  test("collapses streaming reasoning by default", () => {
    const state = getReasoningDisplayState("Checking the current code path.", { streaming: true })

    expect(state.visible).toBe(true)
    expect(state.defaultOpen).toBe(false)
    expect(state.autoOpenOnPending).toBe(true)
  })
})

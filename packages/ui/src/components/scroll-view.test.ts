import { describe, expect, test } from "bun:test"
import { scrollKey, scrollThumbState, scrollTopForThumbDrag } from "./scroll-view"

describe("scrollKey", () => {
  test("maps plain navigation keys", () => {
    expect(scrollKey({ key: "PageDown", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBe(
      "page-down",
    )
    expect(scrollKey({ key: "ArrowUp", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBe("up")
  })

  test("ignores modified keybinds", () => {
    expect(
      scrollKey({ key: "ArrowDown", altKey: false, ctrlKey: false, metaKey: true, shiftKey: false }),
    ).toBeUndefined()
    expect(scrollKey({ key: "PageUp", altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBeUndefined()
    expect(scrollKey({ key: "End", altKey: false, ctrlKey: false, metaKey: false, shiftKey: true })).toBeUndefined()
  })
})

describe("scrollThumbState", () => {
  test("hides the thumb when content does not overflow", () => {
    expect(scrollThumbState({ scrollTop: 0, scrollHeight: 100, clientHeight: 120 }).show).toBe(false)
  })

  test("keeps the thumb inside the padded track", () => {
    const start = scrollThumbState({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })
    const end = scrollThumbState({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })

    expect(start.show).toBe(true)
    expect(start.top).toBe(8)
    expect(end.top + end.height).toBeLessThanOrEqual(192)
  })
})

describe("scrollTopForThumbDrag", () => {
  test("maps thumb movement through the same padded track as rendering", () => {
    const state = scrollThumbState({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })
    const next = scrollTopForThumbDrag({
      startScrollTop: 0,
      deltaY: state.maxThumbTravel,
      scrollHeight: 1000,
      clientHeight: 200,
      thumbHeight: state.height,
    })

    expect(next).toBe(800)
  })

  test("clamps dragged scroll positions", () => {
    expect(
      scrollTopForThumbDrag({
        startScrollTop: 0,
        deltaY: -999,
        scrollHeight: 1000,
        clientHeight: 200,
        thumbHeight: 40,
      }),
    ).toBe(0)
  })
})

import { describe, expect, test } from "bun:test"
import z from "zod"
import { parseToolInput, repairToolInputCandidate } from "../../src/tool/input"

describe("tool input repair", () => {
  test("unwraps top-level args wrapper", () => {
    const schema = z.object({ filePath: z.string() })
    const result = parseToolInput("read", schema, { args: { filePath: "src/index.ts" } })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.repaired).toBe(true)
      expect(result.data.filePath).toBe("src/index.ts")
    }
  })

  test("strips markdown link markup from path-like fields", () => {
    const schema = z.object({ filePath: z.string(), content: z.string() })
    const result = parseToolInput("write", schema, {
      filePath: "[notes.md](file:///tmp/notes.md)",
      content: "[keep me](https://example.com)",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.filePath).toBe("notes.md")
      expect(result.data.content).toBe("[keep me](https://example.com)")
    }
  })

  test("coalesces null-like optional fields", () => {
    const schema = z.object({
      pattern: z.string(),
      include: z.string().optional(),
      path: z.string().optional(),
    })
    const result = parseToolInput("grep", schema, {
      pattern: "TODO",
      include: null,
      path: "undefined",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ pattern: "TODO" })
    }
  })

  test("parses JSON-stringified arrays and objects", () => {
    const schema = z.object({
      ignore: z.array(z.string()),
      nested: z.object({ name: z.string() }),
    })
    const result = parseToolInput("list", schema, {
      ignore: '["node_modules","dist"]',
      nested: '{"name":"demo"}',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ignore).toEqual(["node_modules", "dist"])
      expect(result.data.nested).toEqual({ name: "demo" })
    }
  })

  test("wraps a bare string as a string array", () => {
    const schema = z.object({ ignore: z.array(z.string()) })
    const result = parseToolInput("list", schema, { ignore: "*.log" })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ignore).toEqual(["*.log"])
    }
  })

  test("converts numeric and boolean strings", () => {
    const schema = z.object({
      limit: z.number(),
      replaceAll: z.boolean(),
    })
    const result = parseToolInput("edit", schema, {
      limit: "25",
      replaceAll: "false",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ limit: 25, replaceAll: false })
    }
  })

  test("does not repair when second validation still fails", () => {
    const schema = z.object({
      filePath: z.string(),
      limit: z.number(),
    })
    const result = parseToolInput("read", schema, {
      filePath: "[ok.ts](file:///ok.ts)",
      limit: "not-a-number",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("limit")
    }
  })

  test("returns a JSON-schema-driven repair candidate", () => {
    const result = repairToolInputCandidate(
      "read",
      JSON.stringify({ args: { filePath: "[demo.ts](file:///demo.ts)", limit: "2" } }),
      {
        type: "object",
        required: ["filePath"],
        properties: {
          filePath: { type: "string" },
          limit: { type: "number" },
        },
      },
    )

    expect(result.repaired).toBe(true)
    expect(result.input).toEqual({ filePath: "demo.ts", limit: 2 })
  })
})

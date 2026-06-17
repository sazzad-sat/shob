import type { Part } from "@shob-ai/sdk/v2"

export type AssistantPartEntry<TPart extends Pick<Part, "id" | "type"> = Part> = {
  messageID: string
  part: TPart
  messageCompleted?: boolean
}

export type AssistantPartRef = {
  messageID: string
  partID: string
}

export type AssistantPartGroup =
  | {
      key: string
      type: "part"
      ref: AssistantPartRef
    }
  | {
      key: string
      type: "context"
      refs: AssistantPartRef[]
    }

function sameRef(a: AssistantPartRef, b: AssistantPartRef) {
  return a.messageID === b.messageID && a.partID === b.partID
}

function sameGroup(a: AssistantPartGroup, b: AssistantPartGroup) {
  if (a === b) return true
  if (a.key !== b.key) return false
  if (a.type !== b.type) return false
  if (a.type === "part") {
    if (b.type !== "part") return false
    return sameRef(a.ref, b.ref)
  }
  if (b.type !== "context") return false
  if (a.refs.length !== b.refs.length) return false
  return a.refs.every((ref, i) => sameRef(ref, b.refs[i]!))
}

export function sameAssistantPartGroups(
  a: readonly AssistantPartGroup[] | undefined,
  b: readonly AssistantPartGroup[] | undefined,
) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((item, i) => sameGroup(item, b[i]!))
}

export type AssistantDisplayOrderOptions = {
  live?: boolean
}

function hasEnd(value: unknown) {
  if (!value || typeof value !== "object") return false
  return typeof (value as { end?: unknown }).end === "number"
}

function isActiveTool(part: Pick<Part, "type">) {
  if (part.type !== "tool") return false
  const status = (part as { state?: { status?: unknown } }).state?.status
  return status === "pending" || status === "running"
}

function isUnfinishedLivePart(entry: AssistantPartEntry) {
  const parentLive = entry.messageCompleted !== true
  if (!parentLive) return false

  if (entry.part.type === "reasoning" || entry.part.type === "text") {
    return !hasEnd((entry.part as { time?: unknown }).time)
  }

  return isActiveTool(entry.part)
}

export function orderAssistantDisplayParts<T extends AssistantPartEntry>(
  parts: T[],
  options: AssistantDisplayOrderOptions = {},
) {
  if (!options.live) return parts

  const firstUnfinished = parts.findIndex(isUnfinishedLivePart)
  if (firstUnfinished === -1) return parts
  return parts.slice(0, firstUnfinished + 1)
}

export function groupAssistantDisplayParts<T extends AssistantPartEntry>(
  parts: T[],
  isContextPart: (part: T["part"]) => boolean,
  options: AssistantDisplayOrderOptions = {},
): AssistantPartGroup[] {
  const ordered = orderAssistantDisplayParts(parts, options)
  const result: AssistantPartGroup[] = []
  let start = -1

  const flush = (end: number) => {
    if (start < 0) return
    const first = ordered[start]
    if (!first) {
      start = -1
      return
    }
    result.push({
      key: `context:${first.part.id}`,
      type: "context",
      refs: ordered.slice(start, end + 1).map((item) => ({
        messageID: item.messageID,
        partID: item.part.id,
      })),
    })
    start = -1
  }

  ordered.forEach((item, index) => {
    if (isContextPart(item.part)) {
      if (start < 0) start = index
      return
    }

    flush(index - 1)
    result.push({
      key: `part:${item.messageID}:${item.part.id}`,
      type: "part",
      ref: {
        messageID: item.messageID,
        partID: item.part.id,
      },
    })
  })

  flush(ordered.length - 1)
  return result
}

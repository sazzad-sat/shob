import type { Part } from "@opencode-ai/sdk/v2"

export type AssistantPartEntry<TPart extends Pick<Part, "id" | "type"> = Part> = {
  messageID: string
  part: TPart
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

export function orderAssistantDisplayParts<T extends AssistantPartEntry>(parts: T[]) {
  const firstText = parts.findIndex((entry) => entry.part.type === "text")
  if (firstText === -1) return parts

  const beforeText: T[] = []
  const lateReasoning: T[] = []
  const textAndAfter: T[] = []

  parts.forEach((entry, index) => {
    if (index < firstText) {
      beforeText.push(entry)
      return
    }
    if (index > firstText && entry.part.type === "reasoning") {
      lateReasoning.push(entry)
      return
    }
    textAndAfter.push(entry)
  })

  if (lateReasoning.length === 0) return parts
  return [...beforeText, ...lateReasoning, ...textAndAfter]
}

export function groupAssistantDisplayParts<T extends AssistantPartEntry>(
  parts: T[],
  isContextPart: (part: T["part"]) => boolean,
): AssistantPartGroup[] {
  const ordered = orderAssistantDisplayParts(parts)
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

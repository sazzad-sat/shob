type ActivityParams = Record<string, string | number | boolean>

export type ActivityTranslator = (key: string, params?: ActivityParams) => string

export type ActivityMessage = {
  id: string
  role?: string
  time?: {
    created?: number
    completed?: number
  }
}

export type ActivityPart = {
  type: string
  text?: string
  tool?: string
  state?: {
    status?: string
    input?: unknown
    metadata?: unknown
  }
}

export type ActivityKind =
  | "working"
  | "reasoning"
  | "reading"
  | "inspecting"
  | "editing"
  | "running"
  | "patching"
  | "delegating"
  | "waiting"
  | "loading"

const ACTIVITY_LABELS = {
  working: "Working",
  reasoning: "Reasoning",
  reading: "Reading",
  inspecting: "Inspecting",
  editing: "Editing",
  running: "Running",
  patching: "Patching",
  delegating: "Delegating",
  waiting: "Waiting",
  loading: "Loading",
} satisfies Record<ActivityKind, string>

export const SPINNER_VERBS = Object.values(ACTIVITY_LABELS)

function cleanTopic(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function stringValue(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
}

function compact(value: string | undefined, max = 46) {
  if (!value) return
  const clean = cleanTopic(value)
  if (!clean) return
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`
}

function fileName(path: string | undefined) {
  if (!path) return
  const clean = path.replace(/[\\/]+$/g, "")
  const parts = clean.split(/[\\/]/).filter(Boolean)
  return compact(parts[parts.length - 1] || clean)
}

function host(url: string | undefined) {
  if (!url) return
  try {
    return compact(new URL(url).hostname)
  } catch {
    return compact(url)
  }
}

function withTarget(label: string, target: string | undefined) {
  return target ? `${label} ${target}` : label
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function fileCount(value: unknown) {
  if (Array.isArray(value)) return value.length
  return 0
}

export function extractReasoningTopic(text: string) {
  const markdown = text.replace(/\r\n?/g, "\n")

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanTopic(html[1].replace(/<[^>]+>/g, " "))
    if (value) return value
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = cleanTopic(atx[1])
    if (value) return value
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)
  if (setext?.[1]) {
    const value = cleanTopic(setext[1])
    if (value) return value
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  if (strong?.[1]) {
    const value = cleanTopic(strong[1])
    if (value) return value
  }
}

function isTool(part: ActivityPart): part is ActivityPart & { tool: string } {
  return part.type === "tool" && typeof part.tool === "string"
}

const INSPECT_TOOLS = new Set(["list", "glob", "grep", "codesearch", "webfetch", "websearch"])

export function activityLabel(kind: ActivityKind | undefined = "working") {
  return ACTIVITY_LABELS[kind]
}

export function activityKindForPart(part: ActivityPart | undefined): ActivityKind | undefined {
  if (!part) return

  if (isTool(part)) {
    switch (part.tool) {
      case "read":
        return "reading"
      case "list":
      case "glob":
      case "grep":
      case "codesearch":
      case "webfetch":
      case "websearch":
        return "inspecting"
      case "bash":
        return "running"
      case "edit":
      case "write":
        return "editing"
      case "apply_patch":
        return "patching"
      case "task":
        return "delegating"
      case "question":
        return "waiting"
      case "skill":
        return "loading"
      default:
        return "working"
    }
  }

  if (part.type === "reasoning" && part.text?.trim()) return "reasoning"
  if (part.type === "text" && part.text?.trim()) return "working"
}

export function activityKindForVisibleParts(parts: readonly ActivityPart[]): ActivityKind {
  const tools = parts.filter(isTool)
  const latestTool = tools.at(-1)
  if (latestTool) {
    const inspectOnly = tools.every((part) => part.tool === "read" || INSPECT_TOOLS.has(part.tool))
    if (latestTool.tool === "read" && tools.length > 1 && inspectOnly) return "inspecting"
    return activityKindForPart(latestTool) ?? "working"
  }

  for (let index = parts.length - 1; index >= 0; index--) {
    const kind = activityKindForPart(parts[index])
    if (kind) return kind
  }

  return "working"
}

function toolTarget(part: ActivityPart & { tool: string }) {
  const input = record(part.state?.input)
  const metadata = record(part.state?.metadata)

  switch (part.tool) {
    case "read":
    case "edit":
    case "write":
      return fileName(stringValue(input, ["filePath", "path"]))
    case "list":
      return fileName(stringValue(input, ["path"]))
    case "glob":
    case "grep":
      return compact(stringValue(input, ["pattern"]))
    case "codesearch":
    case "websearch":
      return compact(stringValue(input, ["query"]))
    case "webfetch":
      return host(stringValue(input, ["url"]))
    case "bash":
      return compact(stringValue(input, ["description", "command"]), 54)
    case "apply_patch": {
      const count = fileCount(input.files) || fileCount(metadata.files)
      return count > 0 ? plural(count, "file") : undefined
    }
    case "task":
      return compact(stringValue(input, ["description", "prompt"]), 54)
    case "skill":
      return compact(stringValue(input, ["name"]))
  }
}

function singleToolActivityTitle(part: ActivityPart & { tool: string }) {
  switch (part.tool) {
    case "read":
      return withTarget("Reading", toolTarget(part))
    case "list":
      return withTarget("Inspecting", toolTarget(part))
    case "glob":
    case "grep":
      return withTarget("Searching", toolTarget(part))
    case "codesearch":
      return toolTarget(part) ? `Searching code for ${toolTarget(part)}` : "Searching code"
    case "webfetch":
      return withTarget("Fetching", toolTarget(part))
    case "websearch":
      return toolTarget(part) ? `Searching web for ${toolTarget(part)}` : "Searching web"
    case "bash":
      return withTarget("Running", toolTarget(part))
    case "edit":
    case "write":
      return withTarget("Editing", toolTarget(part))
    case "apply_patch":
      return withTarget("Patching", toolTarget(part))
    case "task":
      return withTarget("Delegating", toolTarget(part))
    case "question":
      return "Waiting"
    case "skill":
      return withTarget("Loading", toolTarget(part))
    default:
      return "Working"
  }
}

function groupedToolActivityTitle(tools: readonly (ActivityPart & { tool: string })[]) {
  if (tools.length === 0) return "Working"
  if (tools.length === 1) return singleToolActivityTitle(tools[0]!)

  const inspectOnly = tools.every((part) => part.tool === "read" || INSPECT_TOOLS.has(part.tool))
  if (inspectOnly) return `Inspecting ${plural(tools.length, "item")}`

  const editCount = tools.filter((part) => part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch").length
  if (editCount === tools.length) return `Editing ${plural(tools.length, "file")}`

  const commandCount = tools.filter((part) => part.tool === "bash").length
  if (commandCount === tools.length) return `Running ${plural(tools.length, "command")}`

  const latest = tools.at(-1)
  return latest ? singleToolActivityTitle(latest) : "Working"
}

export function activityTitleForVisibleParts(parts: readonly ActivityPart[]): string {
  const tools = parts.filter(isTool)
  if (tools.length > 0) return groupedToolActivityTitle(tools)
  return activityLabel(activityKindForVisibleParts(parts))
}

export function getAssistantActivityLabel(input: {
  messages: readonly ActivityMessage[]
  getParts: (messageID: string) => readonly ActivityPart[] | undefined
  t: ActivityTranslator
  fallback?: string
  visibleParts?: readonly ActivityPart[]
}) {
  if (input.visibleParts) return activityTitleForVisibleParts(input.visibleParts)

  const parts: ActivityPart[] = []

  for (let messageIndex = 0; messageIndex < input.messages.length; messageIndex++) {
    const message = input.messages[messageIndex]
    if (!message || message.role !== "assistant") continue
    parts.push(...(input.getParts(message.id) ?? []))
  }

  if (parts.length > 0) return activityTitleForVisibleParts(parts)
  if (input.fallback) return input.fallback
  return "Working"
}

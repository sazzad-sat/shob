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

function translate(t: ActivityTranslator, key: string, fallback: string, params?: ActivityParams) {
  const value = t(key, params)
  return value && value !== key ? value : fallback
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

function cleanTopic(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(value: string | undefined, max = 48) {
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

function activeTool(part: ActivityPart): part is ActivityPart & { tool: string } {
  return (
    part.type === "tool" &&
    typeof part.tool === "string" &&
    (part.state?.status === "pending" || part.state?.status === "running")
  )
}

function toolActivityLabel(part: ActivityPart & { tool: string }, t: ActivityTranslator) {
  const input = record(part.state?.input)
  const metadata = record(part.state?.metadata)

  switch (part.tool) {
    case "read":
      return withTarget("Reading", fileName(stringValue(input, ["filePath", "path"])))
    case "list":
      return withTarget("Listing", fileName(stringValue(input, ["path"])))
    case "glob":
      return withTarget("Finding", compact(stringValue(input, ["pattern"])))
    case "grep":
      return withTarget("Searching", compact(stringValue(input, ["pattern"])))
    case "codesearch": {
      const query = compact(stringValue(input, ["query"]))
      return query ? `Searching code for ${query}` : translate(t, "ui.sessionTurn.status.searchingCodebase", "Searching the codebase")
    }
    case "webfetch":
      return withTarget("Fetching", host(stringValue(input, ["url"])))
    case "websearch": {
      const query = compact(stringValue(input, ["query"]))
      return query ? `Searching web for ${query}` : translate(t, "ui.sessionTurn.status.searchingWeb", "Searching the web")
    }
    case "bash": {
      const command = compact(stringValue(input, ["description", "command"]))
      return command ? `Running ${command}` : translate(t, "ui.sessionTurn.status.runningCommands", "Running commands")
    }
    case "edit":
    case "write": {
      const file = fileName(stringValue(input, ["filePath", "path"]))
      return file ? `Editing ${file}` : translate(t, "ui.sessionTurn.status.makingEdits", "Making edits")
    }
    case "apply_patch": {
      const count = fileCount(input.files) || fileCount(metadata.files)
      if (count > 0) return `Applying patch to ${count} ${count === 1 ? "file" : "files"}`
      return "Applying patch"
    }
    case "task": {
      const description = compact(stringValue(input, ["description", "prompt"]), 64)
      return description ? `Delegating ${description}` : translate(t, "ui.sessionTurn.status.delegating", "Delegating work")
    }
    case "question":
      return "Waiting for answer"
    case "skill":
      return withTarget("Loading skill", compact(stringValue(input, ["name"]))) || "Loading skill"
    default:
      return `Using ${part.tool}`
  }
}

function isStreamingAssistant(message: ActivityMessage) {
  return message.role === "assistant" && typeof message.time?.completed !== "number"
}

export function getAssistantActivityLabel(input: {
  messages: readonly ActivityMessage[]
  getParts: (messageID: string) => readonly ActivityPart[] | undefined
  t: ActivityTranslator
}) {
  let latestTopic: string | undefined

  for (let messageIndex = input.messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = input.messages[messageIndex]
    if (!message || message.role !== "assistant") continue

    const parts = input.getParts(message.id) ?? []
    const streaming = isStreamingAssistant(message)

    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex]
      if (!part) continue

      if (activeTool(part)) return toolActivityLabel(part, input.t)

      if (streaming && part.type === "text" && part.text?.trim()) return "Working"

      if (part.type === "reasoning" && part.text?.trim()) {
        latestTopic ??= extractReasoningTopic(part.text)
        if (streaming) return latestTopic ? `Analyzing ${latestTopic}` : "Analyzing request"
      }
    }
  }

  if (latestTopic) return `Analyzing ${latestTopic}`
  return translate(input.t, "ui.sessionTurn.status.gatheringContext", "Exploring")
}

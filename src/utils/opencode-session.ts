import type { Session as LocalSession } from "@/types"
import { sessionTitle } from "./session-title"

export type OpenCodeSessionLike = {
  id: string
  parentID?: string
  title?: string
  time?: {
    created?: number
    updated?: number
    archived?: number
  }
}

export const openCodeSessionUpdatedAt = (session: OpenCodeSessionLike) =>
  session.time?.updated ?? session.time?.created ?? 0

export const sortOpenCodeSessionsById = <T extends { id: string }>(sessions: T[]) =>
  [...sessions].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))

export function toLocalOpenCodeSession(
  session: OpenCodeSessionLike,
  options: { shell?: string | null; pinned?: boolean } = {},
): LocalSession {
  const now = Date.now()
  const createdAt = session.time?.created ?? now
  const lastActiveAt = session.time?.updated ?? createdAt

  return {
    id: session.id,
    name: sessionTitle(session.title) || "New session",
    parentSessionId: session.parentID ?? null,
    shell: options.shell ?? (globalThis.navigator?.platform?.toLowerCase().includes("win") ? "powershell.exe" : "/bin/sh"),
    cliTool: "opencode",
    pendingLaunchCommand: null,
    pinned: options.pinned ?? false,
    createdAt,
    lastActiveAt,
    commandCount: 0,
    startupDurationMs: null,
  }
}

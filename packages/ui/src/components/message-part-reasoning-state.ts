export const REASONING_VISIBLE_CHARACTER_LIMIT = 350

export type ReasoningDisplayState = {
  text: string
  visible: boolean
  defaultOpen: boolean
  autoOpenOnPending: boolean
}

export function getReasoningDisplayState(
  text: string | null | undefined,
  options: { streaming?: boolean } = {},
): ReasoningDisplayState {
  const trimmed = text?.trim() ?? ""
  const visible = trimmed.length > 0
  const withinVisibleLimit = visible && Array.from(trimmed).length <= REASONING_VISIBLE_CHARACTER_LIMIT
  const defaultOpen = visible && (options.streaming || withinVisibleLimit)

  return {
    text: trimmed,
    visible,
    defaultOpen,
    autoOpenOnPending: visible,
  }
}
